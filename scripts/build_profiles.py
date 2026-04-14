"""
Build investor intelligence profiles and detect investor groups
from the parsed 1% ownership CSV.

Input:  output/one_percent_holders.csv
        config/verified_groups.json (strict mode: manifest for proven groups only)

Output (default strict):
        output/investor_profiles.json   (group_id only from manifest)
        output/investor_groups.json     (verified groups only)
        output/investor_group_candidates.json  (name_match groups only by default;
            co_ownership + family_name omitted per audit — use --include-heuristic-clusters for full set)
        config/group_protocol_scores.json      (PDF confidence scores: omit stems with score < min_kept)

Optional (strict mode):
        --write-group-audit           → output/group_audit_strict.json
        --export-member-locations     → output/candidate_group_members_locations.csv

Output (--legacy-heuristic-groups):
        output/investor_profiles.json
        output/investor_groups.json     (name_match-only group_id by default; same flag as strict)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"
CONFIG_DIR = ROOT / "config"
CSV_PATH = OUTPUT_DIR / "one_percent_holders.csv"
VERIFIED_GROUPS_PATH = CONFIG_DIR / "verified_groups.json"
PROTOCOL_SCORES_PATH = CONFIG_DIR / "group_protocol_scores.json"
PROFILES_PATH = OUTPUT_DIR / "investor_profiles.json"
CANDIDATES_PATH = OUTPUT_DIR / "investor_group_candidates.json"
GROUP_AUDIT_PATH = OUTPUT_DIR / "group_audit_strict.json"
MEMBER_LOCATIONS_CSV_PATH = OUTPUT_DIR / "candidate_group_members_locations.csv"
PROFILES_SUMMARY_PATH = OUTPUT_DIR / "investor_profiles_summary.json"

TYPE_LABELS = {
    "CP": "Company",
    "ID": "Individual",
    "IB": "Investment Bank",
    "MF": "Mutual Fund",
    "SC": "Securities Company",
    "OT": "Other",
    "IS": "Insurance / Social Security",
    "PF": "Pension Fund",
    "FD": "Foundation",
}

CLASSIFICATION_MAP = {
    "CP": "company",
    "ID": "individual",
    "IB": "broker",
    "SC": "broker",
    "MF": "mutual_fund",
    "IS": "insurance",
    "PF": "pension_fund",
    "FD": "foundation",
    "OT": "other",
}

OFFSHORE_JURISDICTIONS = {
    "VIRGIN ISLANDS, BRITISH",
    "CAYMAN ISLANDS",
    "BERMUDA",
    "BRITISH VIRGIN ISLANDS",
    "JERSEY",
    "GUERNSEY",
    "ISLE OF MAN",
    "LIECHTENSTEIN",
    "LUXEMBOURG",
    "MAURITIUS",
    "SEYCHELLES",
    "LABUAN",
    "SAMOA",
    "VANUATU",
    "PANAMA",
    "BAHAMAS",
}

GOVERNMENT_KEYWORDS = [
    "GOVERNMENT OF",
    "REPUBLIC OF",
    "KEMENTERIAN",
    "KEJAKSAAN",
    "JAKSA AGUNG",
    "PEMERINTAH",
    "NEGARA REPUBLIK",
    "BANK INDONESIA",
    "DANANTARA",
    "BP BUMN",
    "BADAN PENGATURAN BUMN",
]

# Well-known Indonesian conglomerate name stems for group detection.
# Each tuple: (canonical group label, list of matching substrings)
KNOWN_GROUP_STEMS = [
    # State entities
    ("Danantara / State Holdings", ["DANANTARA", "BP BUMN", "BADAN PENGATURAN"]),
    ("ASABRI", ["ASABRI"]),
    ("Jaminan Sosial (BPJS)", ["KETENAGAKERJAAN", "JAMINAN SOSIAL", "BPJS"]),
    # Conglomerates
    ("Bakrie Group", ["BAKRIE"]),
    ("Salim Group", ["SALIM", "INDOFOOD", "INDOMARET", "BOGASARI", "INDORITEL"]),
    ("Sinar Mas Group", ["SINAR MAS", "SINARMAS"]),
    ("Lippo Group", ["LIPPO", "MATAHARI"]),
    ("Astra Group", ["ASTRA"]),
    ("Djarum Group", ["DJARUM"]),
    ("Gudang Garam Group", ["GUDANG GARAM"]),
    ("Ciputra Group", ["CIPUTRA"]),
    ("MNC Group", ["MNC ", "MEDIA NUSANTARA", "TANOESOEDIBJO"]),
    ("Emtek Group", ["EMTEK", "ELANG MAHKOTA"]),
    ("CT Corp Group", ["CT CORP", "CHAIRUL TANJUNG", "TRANS CORP"]),
    ("Telkom Group", ["TELKOM"]),
    ("PLN Group", ["PLN", "PERUSAHAAN LISTRIK"]),
    ("Pertamina Group", ["PERTAMINA"]),
    ("BCA Group", ["CENTRAL ASIA"]),
    ("BRI Group", ["BANK RAKYAT"]),
    ("Mandiri Group", ["BANK MANDIRI"]),
    ("BNI Group", ["BANK NEGARA INDONESIA"]),
    ("MUFG / Danamon Group", ["MUFG", "DANAMON", "ADIRA DINAMIKA"]),
    ("Saratoga Group", ["SARATOGA"]),
    ("Adaro / Alamtri Group", ["ADARO", "ALAMTRI"]),
    ("Barito Group", ["BARITO"]),
    ("Medco Group", ["MEDCO"]),
    ("Triputra Group", ["TRIPUTRA", "ADI DINAMIKA", "DAYA ADICIPTA"]),
    ("Jardine Group", ["JARDINE"]),
    ("Panin Group", ["PANIN"]),
    ("Mayapada Group", ["MAYAPADA"]),
    ("Agung Podomoro Group", ["AGUNG PODOMORO", "PODOMORO"]),
    ("Pakuwon Group", ["PAKUWON"]),
    ("Surya Citra Group", ["SURYA CITRA"]),
    ("Wings Group", ["WINGS"]),
    ("Ancora Group", ["ANCORA"]),
    ("ABM Investama Group", ["ABM INVESTAMA"]),
    ("Rajawali / Sondakh Group", ["RAJAWALI", "PETER SONDAKH"]),
    ("Sampoerna Group", ["SAMPOERNA"]),
    ("Kawan Lama Group", ["KAWAN LAMA"]),
    ("Maspion Group", ["MASPION", "HUSIN INVESTAMA", "ALIM INVESTINDO", "GUNA INVESTINDO"]),
    ("Argo Manunggal Group", ["ARGO MANUNGGAL"]),
    ("Tanoko / Avian Group", ["TANOKO", "TANCORP"]),
    ("Fairfax Group", ["FAIRFAX"]),
    ("Tolaram Group", ["TOLARAM"]),
    # Families
    ("Thohir Family", ["THOHIR"]),
    ("Widjaja Family", ["WIDJAJA", "EKA TJIPTA"]),
    ("Hartono Family", ["HARTONO"]),
    ("Soeryadjaya Family", ["SOERYADJAYA"]),
    ("Tanoto Family", ["TANOTO", "ROYAL GOLDEN EAGLE"]),
    ("Riady Family", ["RIADY"]),
    ("Rachmat Family", ["RACHMAT"]),
    ("Prajogo Family", ["PRAJOGO"]),
    ("Risjad Family", ["RISJAD"]),
]


@dataclass
class ProtocolScoreFilter:
    """
    Indonesian Family Group Audit Protocol (PDF): groups at or below min_kept-1
    are omitted from name_match grouping (default: scores 1–7 dropped, 8+ kept).
    """

    min_kept: int
    default_score: int
    score_by_group_id: dict[str, int]

    def score_for(self, gid: str) -> int:
        return int(self.score_by_group_id.get(gid, self.default_score))

    def keep_gid(self, gid: str) -> bool:
        return self.score_for(gid) >= self.min_kept


def group_id_from_label(label: str) -> str:
    return "grp_" + re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def load_protocol_score_filter(path: Path) -> ProtocolScoreFilter:
    if not path.is_file():
        return ProtocolScoreFilter(
            min_kept=8,
            default_score=9,
            score_by_group_id={"grp_riady_family": 2},
        )
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    min_kept = int(raw.get("min_confidence_score_kept", 8))
    default_score = int(raw.get("default_score", 9))
    scores = raw.get("score_by_group_id") or {}
    score_by = {str(k): int(v) for k, v in scores.items()}
    return ProtocolScoreFilter(
        min_kept=min_kept, default_score=default_score, score_by_group_id=score_by
    )


def noop_protocol_score_filter() -> ProtocolScoreFilter:
    """Disable PDF score filtering (all name_match stems apply)."""
    return ProtocolScoreFilter(min_kept=-999, default_score=99, score_by_group_id={})


def load_data() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    for col in ["nationality", "domicile", "investor_type", "local_foreign"]:
        df[col] = df[col].fillna("").str.strip()
    # Clean formatting artifacts flagged by audit
    df["issuer_name"] = df["issuer_name"].str.replace("`", "'", regex=False)
    df["investor_name"] = df["investor_name"].str.replace(r"\s+", " ", regex=True).str.strip()
    return df


# ──────────────────────────────────────────────────
#  Verified manifest (strict mode)
# ──────────────────────────────────────────────────

def _validate_evidence_item(item: dict, ctx: str) -> None:
    if not isinstance(item, dict):
        raise ValueError(f"{ctx}: evidence entry must be an object")
    for key in ("url", "title", "retrieved"):
        if key not in item or not str(item[key]).strip():
            raise ValueError(f"{ctx}: evidence.{key} is required and must be non-empty")


def load_verified_manifest(path: Path) -> list[dict]:
    """Load {\"groups\": [...]} or a raw list of group objects."""
    if not path.is_file():
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        groups = data
    elif isinstance(data, dict) and isinstance(data.get("groups"), list):
        groups = data["groups"]
    else:
        raise ValueError(f"{path}: expected list or {{\"groups\": [...]}}")

    seen_ids: set[str] = set()
    for i, g in enumerate(groups):
        ctx = f"group[{i}]"
        if not isinstance(g, dict):
            raise ValueError(f"{ctx}: must be an object")
        gid = g.get("id", "")
        if not isinstance(gid, str) or not gid.strip():
            raise ValueError(f"{ctx}: id must be a non-empty string")
        if gid in seen_ids:
            raise ValueError(f"duplicate manifest group id: {gid}")
        seen_ids.add(gid)
        label = g.get("label", "")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"{ctx} {gid}: label is required")
        members = g.get("members")
        if not isinstance(members, list) or not members:
            raise ValueError(f"{ctx} {gid}: members must be a non-empty array of strings")
        for j, m in enumerate(members):
            if not isinstance(m, str) or not m.strip():
                raise ValueError(f"{ctx} {gid}: members[{j}] invalid")
        evidence = g.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise ValueError(f"{ctx} {gid}: evidence must be a non-empty array")
        for j, ev in enumerate(evidence):
            _validate_evidence_item(ev, f"{ctx} {gid} evidence[{j}]")
        me = g.get("member_evidence")
        if me is not None:
            if not isinstance(me, dict):
                raise ValueError(f"{ctx} {gid}: member_evidence must be an object or omitted")
            for mn, evlist in me.items():
                if not isinstance(mn, str):
                    raise ValueError(f"{ctx} {gid}: member_evidence key must be string")
                if not isinstance(evlist, list) or not evlist:
                    raise ValueError(f"{ctx} {gid}: member_evidence[{mn!r}] must be non-empty array")
                for j, ev in enumerate(evlist):
                    _validate_evidence_item(ev, f"{ctx} {gid} member_evidence[{mn!r}][{j}]")
    return groups


def apply_verified_manifest(profiles: list[dict], manifest_groups: list[dict]) -> list[dict]:
    """
    Set profile group_id only for manifest members. Each investor may appear in at most one group.
    Returns investor_groups.json-shaped list.
    """
    profile_map = {p["name"]: p for p in profiles}
    assigned_member: dict[str, str] = {}
    manifest_missing: list[tuple[str, str]] = []

    for g in manifest_groups:
        gid = g["id"]
        for m in g["members"]:
            if m not in profile_map:
                manifest_missing.append((gid, m))
                continue
            if m in assigned_member and assigned_member[m] != gid:
                raise ValueError(
                    f"Investor {m!r} appears in multiple verified groups: "
                    f"{assigned_member[m]} and {gid}"
                )
            assigned_member[m] = gid
            profile_map[m]["group_id"] = gid

    if manifest_missing:
        print(
            f"  Warning: {len(manifest_missing)} manifest member name(s) not found in "
            "profiles (no group_id assigned for those names)."
        )

    out: list[dict] = []
    for g in manifest_groups:
        gid = g["id"]
        members = sorted({m for m in g["members"] if m in profile_map})
        if not members:
            continue
        total_stocks = sum(profile_map[m]["portfolio_size"] for m in members)
        total_pct = sum(profile_map[m]["total_pct_sum"] for m in members)
        verified_at = g.get("verified_at") or (g["evidence"][0].get("retrieved", "") if g.get("evidence") else "")
        out.append({
            "id": gid,
            "label": g["label"],
            "members": members,
            "member_count": len(members),
            "total_stocks": total_stocks,
            "total_pct_sum": round(total_pct, 2),
            "detection_method": "manual_verified",
            "confidence": "verified",
            "evidence": g["evidence"],
            "member_evidence": g.get("member_evidence") or {},
            "verified_at": verified_at,
        })
    return out


# ──────────────────────────────────────────────────
#  Profile builder
# ──────────────────────────────────────────────────

def classify_investor(name: str, type_code: str) -> str:
    """Refine classification beyond the raw type code."""
    upper = name.upper()
    for kw in GOVERNMENT_KEYWORDS:
        if kw in upper:
            return "government"
    return CLASSIFICATION_MAP.get(type_code, "other")


def compute_risk_flags(row: dict, treasury_investors: set) -> list[str]:
    flags = []
    if row["max_pct"] >= 50:
        flags.append("high_concentration")
    if row["domicile"].upper() in OFFSHORE_JURISDICTIONS:
        flags.append("offshore_domicile")
    if row["portfolio_size"] >= 5:
        flags.append("multi_stock")
    if row["portfolio_size"] >= 1 and row["max_pct"] >= 30:
        flags.append("dominant_holder")
    if row["name"] in treasury_investors:
        flags.append("treasury_shares")
    return flags


def detect_treasury_shares(df: pd.DataFrame) -> set[str]:
    """
    Detect investors that appear to hold their own company's stock
    (treasury shares / buyback). Flagged by audit as important for
    accurate ownership analysis.
    """
    treasury = set()
    for code, grp in df.groupby("share_code"):
        issuer = grp["issuer_name"].iloc[0].upper()
        issuer_words = [
            w for w in issuer.replace("TBK", "").replace("PT", "").replace(",", "").split()
            if len(w) > 3
        ][:3]
        for _, r in grp.iterrows():
            inv = r["investor_name"].upper()
            # Match: share code as substring of investor name (min 4 chars to avoid false hits)
            if len(code) >= 4 and code in inv:
                # Exclude obvious false positives (e.g., "BANK" in "BANK JULIUS BAER")
                if inv.startswith(code) or f" {code}" in inv or f"({code})" in inv:
                    treasury.add(r["investor_name"])
                    continue
            # Match: key issuer words all appear in investor name
            if len(issuer_words) >= 2 and all(w in inv for w in issuer_words):
                treasury.add(r["investor_name"])
    return treasury


def build_co_investor_map(df: pd.DataFrame) -> dict[str, list[str]]:
    """For each stock, collect all investors -> build pairwise co-investor counts."""
    stock_investors = df.groupby("share_code")["investor_name"].apply(set).to_dict()
    co_counts: dict[str, Counter] = defaultdict(Counter)
    for _code, investors in stock_investors.items():
        inv_list = list(investors)
        for i, inv_a in enumerate(inv_list):
            for inv_b in inv_list[i + 1:]:
                co_counts[inv_a][inv_b] += 1
                co_counts[inv_b][inv_a] += 1
    return {
        name: [x[0] for x in counter.most_common(10)]
        for name, counter in co_counts.items()
    }


def build_profiles(df: pd.DataFrame) -> list[dict]:
    print("Building co-investor map ...")
    co_map = build_co_investor_map(df)

    print("Detecting treasury shares ...")
    treasury_investors = detect_treasury_shares(df)
    print(f"  flagged {len(treasury_investors)} treasury-like investors")

    profiles = []
    grouped = df.groupby("investor_name")
    total = len(grouped)

    for idx, (name, grp) in enumerate(grouped):
        first = grp.iloc[0]
        type_code = first["investor_type"]

        holdings = []
        for _, r in grp.iterrows():
            holdings.append({
                "code": r["share_code"],
                "issuer": r["issuer_name"],
                "pct": float(r["percentage"]),
                "shares": int(r["total_holding_shares"]),
            })
        holdings.sort(key=lambda h: h["pct"], reverse=True)

        total_shares = int(grp["total_holding_shares"].sum())
        pct_values = grp["percentage"].tolist()
        max_row = grp.loc[grp["percentage"].idxmax()]

        profile = {
            "name": name,
            "type_code": type_code,
            "type_label": TYPE_LABELS.get(type_code, type_code),
            "classification": classify_investor(name, type_code),
            "local_foreign": first["local_foreign"],
            "nationality": first["nationality"],
            "domicile": first["domicile"],
            "portfolio_size": len(grp),
            "total_shares": total_shares,
            "total_pct_sum": round(sum(pct_values), 2),
            "avg_pct": round(sum(pct_values) / len(pct_values), 2),
            "max_pct": round(float(max_row["percentage"]), 2),
            "max_pct_stock": max_row["share_code"],
            "max_pct_issuer": max_row["issuer_name"],
            "holdings": holdings,
            "co_investors": co_map.get(name, []),
            "group_id": None,
            "risk_flags": [],
        }
        profile["risk_flags"] = compute_risk_flags(profile, treasury_investors)
        profiles.append(profile)

        if (idx + 1) % 1000 == 0 or idx == total - 1:
            print(f"  profiles built: {idx + 1}/{total}")

    return profiles


# ──────────────────────────────────────────────────
#  Group detection
# ──────────────────────────────────────────────────

def detect_groups_by_name(
    profiles: list[dict],
    assign: bool = True,
    protocol: ProtocolScoreFilter | None = None,
) -> tuple[list[dict], set[str]]:
    """Match investors to known conglomerate / family groups by name substring."""
    eff_protocol = protocol if protocol is not None else load_protocol_score_filter(
        PROTOCOL_SCORES_PATH
    )
    groups: dict[str, dict] = {}
    matched_names: set[str] = set()

    for label, stems in KNOWN_GROUP_STEMS:
        gid = group_id_from_label(label)
        if not eff_protocol.keep_gid(gid):
            continue
        p_score = eff_protocol.score_for(gid)
        members: list[str] = []
        for p in profiles:
            upper = p["name"].upper()
            if any(s in upper for s in stems):
                members.append(p["name"])
                matched_names.add(p["name"])
                if assign and p["group_id"] is None:
                    p["group_id"] = gid
        if members:
            mem_set = set(members)
            total_stocks = sum(p["portfolio_size"] for p in profiles if p["name"] in mem_set)
            total_pct = sum(p["total_pct_sum"] for p in profiles if p["name"] in mem_set)
            groups[gid] = {
                "id": gid,
                "label": label,
                "members": sorted(mem_set),
                "member_count": len(mem_set),
                "total_stocks": total_stocks,
                "total_pct_sum": round(total_pct, 2),
                "detection_method": "name_match",
                "confidence": "high",
                "protocol_confidence_score": p_score,
                "protocol_min_score_kept": eff_protocol.min_kept,
            }

    return list(groups.values()), matched_names


def detect_groups_by_co_ownership(
    profiles: list[dict],
    df: pd.DataFrame,
    min_shared: int = 3,
    assign: bool = True,
    name_matched_exclude: set[str] | None = None,
) -> list[dict]:
    """
    Find clusters of investors that co-own shares in >= min_shared stocks
    and are not yet assigned to a name-based group.

    When assign=False, pass name_matched_exclude so the graph matches the layered heuristic.
    """
    if assign:
        unassigned = {p["name"] for p in profiles if p["group_id"] is None}
    else:
        all_names = {p["name"] for p in profiles}
        unassigned = all_names - (name_matched_exclude or set())

    stock_investors = df.groupby("share_code")["investor_name"].apply(set).to_dict()

    pair_counts: Counter = Counter()
    for _code, investors in stock_investors.items():
        eligible = investors & unassigned
        inv_list = sorted(eligible)
        for i, a in enumerate(inv_list):
            for b in inv_list[i + 1:]:
                pair_counts[(a, b)] += 1

    # Build adjacency from strong co-ownership pairs
    adjacency: dict[str, set] = defaultdict(set)
    for (a, b), count in pair_counts.items():
        if count >= min_shared:
            adjacency[a].add(b)
            adjacency[b].add(a)

    # Connected components via BFS
    visited: set[str] = set()
    clusters: list[set[str]] = []
    for node in adjacency:
        if node in visited:
            continue
        component: set[str] = set()
        queue = [node]
        while queue:
            current = queue.pop()
            if current in visited:
                continue
            visited.add(current)
            component.add(current)
            queue.extend(adjacency[current] - visited)
        if len(component) >= 2:
            clusters.append(component)

    groups = []
    profile_map = {p["name"]: p for p in profiles}
    for i, cluster in enumerate(sorted(clusters, key=len, reverse=True)):
        gid = f"grp_co_ownership_{i+1}"
        members = sorted(cluster)

        total_stocks = sum(profile_map[m]["portfolio_size"] for m in members)
        total_pct = sum(profile_map[m]["total_pct_sum"] for m in members)

        # Pick a representative label from the largest member
        biggest = max(members, key=lambda m: profile_map[m]["portfolio_size"])
        label = f"Co-ownership cluster: {biggest} +{len(members)-1}"

        if assign:
            for m in members:
                if profile_map[m]["group_id"] is None:
                    profile_map[m]["group_id"] = gid

        shared = min(
            pair_counts.get(tuple(sorted([members[0], members[1]])), 0)
            if len(members) >= 2 else 0,
            10,
        )
        confidence = "high" if shared >= 5 else "medium"

        groups.append({
            "id": gid,
            "label": label,
            "members": members,
            "member_count": len(members),
            "total_stocks": total_stocks,
            "total_pct_sum": round(total_pct, 2),
            "detection_method": "co_ownership",
            "confidence": confidence,
        })

    return groups


def detect_groups_by_family_name(
    profiles: list[dict],
    assign: bool = True,
    exclude_names: set[str] | None = None,
) -> list[dict]:
    """
    For individuals (type_code=ID) not yet in a group, cluster by
    shared last word in name (surname heuristic).
    """
    exclude_names = exclude_names or set()

    if assign:
        individuals = [
            p for p in profiles
            if p["type_code"] == "ID" and p["group_id"] is None
        ]
    else:
        individuals = [
            p for p in profiles
            if p["type_code"] == "ID" and p["name"] not in exclude_names
        ]

    surname_map: dict[str, list[dict]] = defaultdict(list)
    for p in individuals:
        parts = p["name"].strip().split()
        if len(parts) >= 2:
            surname = parts[-1].upper()
            # Skip very short or generic surnames
            if len(surname) >= 3 and surname not in {
                "JR", "JR.", "SR", "SR.", "III", "II", "IV",
                "BIN", "BINTI", "SE", "SH", "MM", "MBA", "DR", "IR",
                "HJ", "HJ.", "H.", "DRS", "DRS.", "PROF",
            }:
                surname_map[surname].append(p)

    groups = []
    profile_map = {p["name"]: p for p in profiles}

    for surname, members_list in sorted(
        surname_map.items(), key=lambda x: len(x[1]), reverse=True
    ):
        if len(members_list) < 2:
            continue

        gid = f"grp_family_{re.sub(r'[^a-z0-9]+', '_', surname.lower())}"
        member_names = sorted(m["name"] for m in members_list)

        # Only create group if members share stock overlap (reduces false positives)
        stocks_per_member = [
            set(h["code"] for h in profile_map[m]["holdings"]) for m in member_names
        ]
        has_overlap = False
        for i in range(len(stocks_per_member)):
            for j in range(i + 1, len(stocks_per_member)):
                if stocks_per_member[i] & stocks_per_member[j]:
                    has_overlap = True
                    break
            if has_overlap:
                break

        if not has_overlap:
            continue

        total_stocks = sum(profile_map[m]["portfolio_size"] for m in member_names)
        total_pct = sum(profile_map[m]["total_pct_sum"] for m in member_names)

        if assign:
            for m in member_names:
                if profile_map[m]["group_id"] is None:
                    profile_map[m]["group_id"] = gid

        groups.append({
            "id": gid,
            "label": f"{surname.title()} Family",
            "members": member_names,
            "member_count": len(member_names),
            "total_stocks": total_stocks,
            "total_pct_sum": round(total_pct, 2),
            "detection_method": "family_name",
            "confidence": "medium",
        })

    return groups


def build_candidate_groups(
    profiles: list[dict],
    df: pd.DataFrame,
    name_match_only: bool = True,
    protocol: ProtocolScoreFilter | None = None,
) -> list[dict]:
    """
    Heuristic groups for research only; does not mutate profile group_id.

    When name_match_only is True (default), only KNOWN_GROUP_STEMS (name_match)
    groups are emitted — aligned with audit: verified major conglomerates / state /
    named family stems; co_ownership (custodian/heuristic) and family_name
    (surname-based, unverifiable) clusters are omitted.
    """
    if name_match_only:
        groups_name, _ = detect_groups_by_name(profiles, assign=False, protocol=protocol)
        groups_name.sort(key=lambda g: g["total_pct_sum"], reverse=True)
        return groups_name
    groups_name, name_matched = detect_groups_by_name(
        profiles, assign=False, protocol=protocol
    )
    groups_co = detect_groups_by_co_ownership(
        profiles, df, min_shared=3, assign=False, name_matched_exclude=name_matched
    )
    co_matched: set[str] = set()
    for g in groups_co:
        co_matched.update(g["members"])
    groups_family = detect_groups_by_family_name(
        profiles, assign=False, exclude_names=name_matched | co_matched
    )
    all_groups = groups_name + groups_co + groups_family
    all_groups.sort(key=lambda g: g["total_pct_sum"], reverse=True)
    return all_groups


def write_group_audit_strict_report() -> None:
    """Emit output/group_audit_strict.json from candidates + profiles (strict audit)."""
    if not CANDIDATES_PATH.is_file():
        return
    with open(CANDIDATES_PATH, encoding="utf-8") as f:
        candidates: list[dict] = json.load(f)

    profile_names: set[str] = set()
    profiles_by_group: dict[str, list[str]] = defaultdict(list)
    if PROFILES_PATH.is_file():
        with open(PROFILES_PATH, encoding="utf-8") as f:
            profiles = json.load(f)
        for p in profiles:
            profile_names.add(p["name"])
            gid = p.get("group_id")
            if gid:
                profiles_by_group[gid].append(p["name"])

    group_rows = []
    member_count_issues = 0
    unknown_members = 0

    for i, g in enumerate(candidates):
        gid = g.get("id", "")
        members = g.get("members") or []
        mc = g.get("member_count")
        ok_count = mc == len(members) if mc is not None else False
        if not ok_count:
            member_count_issues += 1
        missing = [m for m in members if m not in profile_names]
        unknown_members += len(missing)
        group_rows.append({
            "index": i,
            "id": gid,
            "label": g.get("label", ""),
            "detection_method": g.get("detection_method", ""),
            "confidence": g.get("confidence", ""),
            "member_count": mc,
            "members_len": len(members),
            "member_count_matches_len": ok_count,
            "members_not_in_profiles": missing,
            "strict_verdict": "unverifiable_without_citation",
            "strict_notes": (
                "Heuristic candidate (name_match unless verified via manifest). "
                "Not accepted under strict mode without manifest evidence."
            ),
        })

    verified_path = OUTPUT_DIR / "investor_groups.json"
    verified_ids: set[str] = set()
    if verified_path.is_file():
        with open(verified_path, encoding="utf-8") as f:
            verified = json.load(f)
        verified_ids = {x["id"] for x in verified if isinstance(x, dict) and "id" in x}

    profile_crosswalk_issues: list[dict] = []
    for gid, names in profiles_by_group.items():
        if gid not in verified_ids:
            profile_crosswalk_issues.append({
                "group_id": gid,
                "profile_count": len(names),
                "sample_names": sorted(names)[:5],
                "issue": "group_id not found in investor_groups.json (verified list)",
            })

    report: dict = {
        "summary": {
            "candidate_groups_total": len(candidates),
            "by_detection_method": {},
            "member_count_mismatches": member_count_issues,
            "unknown_member_name_rows": unknown_members,
            "profiles_with_unverified_group_id": sum(
                1 for gid in profiles_by_group if gid not in verified_ids
            ),
        },
        "groups": group_rows,
        "profile_crosswalk": {
            "verified_group_ids_count": len(verified_ids),
            "issues": profile_crosswalk_issues,
        },
    }
    for g in candidates:
        dm = g.get("detection_method", "unknown")
        report["summary"]["by_detection_method"][dm] = (
            report["summary"]["by_detection_method"].get(dm, 0) + 1
        )

    GROUP_AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(GROUP_AUDIT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(
        f"Wrote {GROUP_AUDIT_PATH}  (groups={len(candidates)}, "
        f"member_count_issues={member_count_issues}, orphan_group_id={len(profile_crosswalk_issues)})"
    )


def _local_foreign_label(code: str) -> str:
    c = (code or "").strip().upper()
    if c == "L":
        return "Local"
    if c == "F":
        return "Foreign"
    return "Unknown"


def write_investor_profiles_summary(profiles: list[dict]) -> None:
    """Small JSON for dashboards / future web home without loading full profiles."""
    by_class: Counter = Counter((p.get("classification") or "") for p in profiles)
    top = sorted(
        profiles,
        key=lambda p: (-p["portfolio_size"], -float(p.get("total_pct_sum") or 0)),
    )[:100]
    slim = [
        {
            "name": p["name"],
            "portfolio_size": p["portfolio_size"],
            "total_pct_sum": p.get("total_pct_sum"),
            "classification": p.get("classification"),
            "local_foreign": p.get("local_foreign"),
        }
        for p in top
    ]
    out = {
        "total_profiles": len(profiles),
        "by_classification": dict(by_class),
        "top_by_portfolio": slim,
    }
    with open(PROFILES_SUMMARY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {PROFILES_SUMMARY_PATH}")


def export_candidate_member_locations_csv() -> None:
    """Union of candidate members joined to profiles → CSV."""
    if not CANDIDATES_PATH.is_file() or not PROFILES_PATH.is_file():
        return
    with open(CANDIDATES_PATH, encoding="utf-8") as f:
        groups = json.load(f)
    member_to_groups: dict[str, list[str]] = defaultdict(list)
    for g in groups:
        gid = g.get("id", "")
        for m in g.get("members") or []:
            member_to_groups[m].append(gid)
    with open(PROFILES_PATH, encoding="utf-8") as f:
        profiles = json.load(f)
    by_name = {p["name"]: p for p in profiles}
    names = sorted(member_to_groups.keys())
    with open(MEMBER_LOCATIONS_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "member_name",
            "nationality",
            "domicile",
            "local_foreign_code",
            "local_or_foreign",
            "in_profile",
            "group_ids",
        ])
        for name in names:
            p = by_name.get(name)
            if p:
                nat = p.get("nationality") or ""
                dom = p.get("domicile") or ""
                lf = p.get("local_foreign") or ""
                in_prof = "yes"
            else:
                nat = dom = lf = ""
                in_prof = "no"
            w.writerow([
                name,
                nat,
                dom,
                lf,
                _local_foreign_label(lf),
                in_prof,
                ";".join(sorted(set(member_to_groups[name]))),
            ])
    print(f"Wrote {MEMBER_LOCATIONS_CSV_PATH}  ({len(names):,} unique members)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build investor profiles and groups.")
    parser.add_argument(
        "--legacy-heuristic-groups",
        action="store_true",
        help="Write single investor_groups.json with heuristics assigned to group_id (old behavior).",
    )
    parser.add_argument(
        "--verified-manifest",
        type=Path,
        default=VERIFIED_GROUPS_PATH,
        help="Path to verified_groups.json (strict mode).",
    )
    parser.add_argument(
        "--include-heuristic-clusters",
        action="store_true",
        help="Include co_ownership and family_name in candidates/legacy (disables audit name_match-only filter).",
    )
    parser.add_argument(
        "--disable-protocol-score-filter",
        action="store_true",
        help="Do not apply group_protocol_scores.json (PDF confidence) filtering to name_match stems.",
    )
    parser.add_argument(
        "--protocol-scores",
        type=Path,
        default=PROTOCOL_SCORES_PATH,
        help="JSON with min_confidence_score_kept, default_score, score_by_group_id (PDF protocol).",
    )
    parser.add_argument(
        "--write-group-audit",
        action="store_true",
        help="Write output/group_audit_strict.json after candidate build (strict mode).",
    )
    parser.add_argument(
        "--export-member-locations",
        action="store_true",
        help="Write output/candidate_group_members_locations.csv (strict mode).",
    )
    args = parser.parse_args()
    legacy = args.legacy_heuristic_groups
    manifest_path: Path = args.verified_manifest
    name_match_only = not args.include_heuristic_clusters
    protocol = (
        noop_protocol_score_filter()
        if args.disable_protocol_score_filter
        else load_protocol_score_filter(args.protocol_scores)
    )

    print(f"Loading {CSV_PATH} ...")
    if not CSV_PATH.is_file():
        print(f"Missing input CSV: {CSV_PATH}", file=sys.stderr)
        return 1
    df = load_data()
    print(f"  {len(df):,} rows, {df['investor_name'].nunique():,} unique investors\n")

    profiles = build_profiles(df)
    write_investor_profiles_summary(profiles)

    if legacy:
        print("\nDetecting groups by known name stems ...")
        groups_name, _ = detect_groups_by_name(profiles, assign=True, protocol=protocol)
        print(f"  found {len(groups_name)} name-based groups")

        if name_match_only:
            print("  (skipping co-ownership and family_name clusters — audit filter)")
            all_groups = list(groups_name)
        else:
            print("Detecting groups by co-ownership clustering ...")
            groups_co = detect_groups_by_co_ownership(profiles, df, min_shared=3, assign=True)
            print(f"  found {len(groups_co)} co-ownership groups")

            print("Detecting groups by family surname ...")
            groups_family = detect_groups_by_family_name(profiles, assign=True)
            print(f"  found {len(groups_family)} family groups")

            all_groups = groups_name + groups_co + groups_family
        all_groups.sort(key=lambda g: g["total_pct_sum"], reverse=True)

        assigned = sum(1 for p in profiles if p["group_id"] is not None)
        print(f"\nTotal groups: {len(all_groups)}")
        print(f"Investors with group: {assigned}/{len(profiles)}")

        profiles_path = OUTPUT_DIR / "investor_profiles.json"
        groups_path = OUTPUT_DIR / "investor_groups.json"
        with open(profiles_path, "w", encoding="utf-8") as f:
            json.dump(profiles, f, ensure_ascii=False, indent=2)
        print(f"\nWrote {profiles_path}  ({len(profiles):,} profiles)")
        with open(groups_path, "w", encoding="utf-8") as f:
            json.dump(all_groups, f, ensure_ascii=False, indent=2)
        print(f"Wrote {groups_path}  ({len(all_groups):,} groups)")
        return 0

    # Strict mode (default)
    print("\nBuilding heuristic candidate groups (no profile assignment) ...")
    candidates = build_candidate_groups(
        profiles, df, name_match_only=name_match_only, protocol=protocol
    )
    print(f"  candidate groups: {len(candidates)}")

    with open(CANDIDATES_PATH, "w", encoding="utf-8") as f:
        json.dump(candidates, f, ensure_ascii=False, indent=2)
    print(f"Wrote {CANDIDATES_PATH}")

    print(f"\nLoading verified manifest {manifest_path} ...")
    try:
        manifest_groups = load_verified_manifest(manifest_path)
    except ValueError as e:
        print(f"Manifest error: {e}", file=sys.stderr)
        return 1
    verified_output = apply_verified_manifest(profiles, manifest_groups)
    print(f"  verified groups written: {len(verified_output)}")

    assigned = sum(1 for p in profiles if p["group_id"] is not None)
    print(f"Investors with verified group: {assigned}/{len(profiles)}")

    profiles_path = OUTPUT_DIR / "investor_profiles.json"
    groups_path = OUTPUT_DIR / "investor_groups.json"
    with open(profiles_path, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {profiles_path}  ({len(profiles):,} profiles)")
    with open(groups_path, "w", encoding="utf-8") as f:
        json.dump(verified_output, f, ensure_ascii=False, indent=2)
    print(f"Wrote {groups_path}  ({len(verified_output):,} verified groups)")

    if args.write_group_audit:
        write_group_audit_strict_report()
    if args.export_member_locations:
        export_candidate_member_locations_csv()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
