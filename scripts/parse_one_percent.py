"""
Parse the IDX >=1% shareholder PDF into a clean CSV.

Input:  data/<pdf>
Output: output/one_percent_holders.csv
"""

from pathlib import Path
from datetime import datetime
import re
import pdfplumber
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

COLUMNS = [
    "date",
    "share_code",
    "issuer_name",
    "investor_name",
    "investor_type",
    "local_foreign",
    "nationality",
    "domicile",
    "holdings_scripless",
    "holdings_scrip",
    "total_holding_shares",
    "percentage",
]

DATE_RE = re.compile(r"^\d{2}-[A-Za-z]{3}-\d{4}$")


def parse_id_number(val: str) -> int:
    """Convert Indonesian-formatted integer ('3.200.142.830' or '0') to int."""
    if val is None or val.strip() == "":
        return 0
    return int(val.replace(".", ""))


def parse_percentage(val: str) -> float:
    """Convert '41,10' -> 41.10."""
    if val is None or val.strip() == "":
        return 0.0
    return float(val.replace(",", "."))


def parse_date(val: str) -> str:
    """Convert '31-Mar-2026' -> '2026-03-31' (ISO 8601)."""
    return datetime.strptime(val.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")


def find_pdf() -> Path:
    pdfs = list(DATA_DIR.glob("*.pdf"))
    if len(pdfs) != 1:
        raise FileNotFoundError(
            f"Expected exactly 1 PDF in {DATA_DIR}, found {len(pdfs)}"
        )
    return pdfs[0]


def extract_rows(pdf_path: Path) -> list[list]:
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue
            table = tables[0]
            for row in table:
                if row[0] is None or row[0].strip() == "" or row[0] == "DATE":
                    continue
                if not DATE_RE.match(row[0].strip()):
                    continue
                rows.append(row)
            if (i + 1) % 10 == 0 or i == total_pages - 1:
                print(f"  pages processed: {i + 1}/{total_pages}")
    return rows


def build_dataframe(rows: list[list]) -> pd.DataFrame:
    records = []
    for row in rows:
        r = [c.strip() if c else "" for c in row]
        # Fix encoding artifacts (backtick -> apostrophe, collapse whitespace)
        r = [v.replace("`", "'") for v in r]
        r = [re.sub(r"\s+", " ", v).strip() for v in r]
        records.append(
            {
                "date": parse_date(r[0]),
                "share_code": r[1],
                "issuer_name": r[2],
                "investor_name": r[3],
                "investor_type": r[4],
                "local_foreign": r[5],
                "nationality": r[6],
                "domicile": r[7],
                "holdings_scripless": parse_id_number(r[8]),
                "holdings_scrip": parse_id_number(r[9]),
                "total_holding_shares": parse_id_number(r[10]),
                "percentage": parse_percentage(r[11]),
            }
        )
    df = pd.DataFrame(records, columns=COLUMNS)
    return df


def validate(df: pd.DataFrame) -> None:
    assert df["share_code"].str.len().min() >= 3, "Ticker too short"
    assert (df["total_holding_shares"] >= 0).all(), "Negative share counts"
    assert (df["percentage"] > 0).all(), "Non-positive percentage"
    assert (df["percentage"] <= 100).all(), "Percentage > 100"

    per_ticker = df.groupby("share_code")["percentage"].sum()
    outliers = per_ticker[per_ticker > 110]
    if len(outliers):
        print(f"  WARNING: {len(outliers)} tickers sum > 110% (expected for multi-class shares)")


def main():
    pdf_path = find_pdf()
    print(f"Source: {pdf_path.name}")

    print("Extracting tables ...")
    rows = extract_rows(pdf_path)
    print(f"  raw rows: {len(rows)}")

    print("Building DataFrame ...")
    df = build_dataframe(rows)

    print("Validating ...")
    validate(df)

    out_path = OUTPUT_DIR / "one_percent_holders.csv"
    df.to_csv(out_path, index=False)
    print(f"\nOutput: {out_path}")
    print(f"  Total rows   : {len(df):,}")
    print(f"  Unique tickers: {df['share_code'].nunique():,}")
    print(f"  Date range    : {df['date'].min()} to {df['date'].max()}")
    print(f"\nSample (first 5):")
    print(df.head().to_string(index=False))
    print(f"\nSample (last 5):")
    print(df.tail().to_string(index=False))


if __name__ == "__main__":
    main()
