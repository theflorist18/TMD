#!/bin/sh
set -e
curl -sfS "http://tmd/health" | grep -q ok
curl -sfSo /dev/null "http://tmd/"
if curl -sfSo /dev/null "http://tmd/output/one_percent_holders.csv"; then
  echo "smoke-test: OK (/, /health, /output/one_percent_holders.csv)"
else
  echo "smoke-test: OK (/, /health) — add output/one_percent_holders.csv for full data check"
fi
