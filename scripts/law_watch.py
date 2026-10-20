#!/usr/bin/env python3
"""Check Taiwan official labor law revision dates. Never infer effectiveness from amendment date.

The output is a source-status report, NOT an automated interpretation of amendments.
On source errors, retain the last known date and flag the failure.
"""
from __future__ import annotations
import datetime as dt
import html
import json
import pathlib
import re
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

BASE = pathlib.Path(__file__).resolve().parents[1]
FILE = BASE / "data" / "law-status.json"
LAWS = {
    "N0060022": ("2026-06-26", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060022"),
    "N0060027": ("2026-06-29", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060027"),
    "N0060001": ("2025-12-19", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060001"),
    "N0060009": ("2026-06-30", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060009"),
    "N0060040": ("2022-08-12", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060040"),
}

def date_from_source(raw: str) -> str:
    plain = re.sub(r"<[^>]*>", " ", raw)
    plain = html.unescape(plain)
    plain = re.sub(r"\s+", " ", plain)
    hit = re.search(r"修正日期\s*[：:]\s*民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", plain)
    if not hit:
        raise ValueError("official page's amended-date field not found; markup may have changed")
    y, m, d = map(int, hit.groups())
    return f"{y + 1911:04d}-{m:02d}-{d:02d}"

def fetch_page(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; OSHA-study-revision-watcher/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-TW,zh;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=22) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read(1_500_000).decode(charset, errors="replace")

def main():
    try:
        previous = json.loads(FILE.read_text("utf-8"))
    except (OSError, ValueError):
        previous = {}
    now = dt.datetime.now(ZoneInfo("Asia/Taipei")).strftime("%Y-%m-%d %H:%M (台灣)")
    observed = {}
    changes = []
    errors = []
    success = 0
    for code, (baseline, url) in LAWS.items():
        old_date = previous.get("laws", {}).get(code, {}).get("amended", baseline)
        date_value = old_date
        try:
            fetched = date_from_source(fetch_page(url))
            if fetched < baseline:
                raise ValueError("source reported an older date than verified baseline")
            date_value = fetched
            success += 1
        except (ValueError, OSError, UnicodeError, urllib.error.URLError) as exc:
            errors.append({"code": code, "message": str(exc)[:180]})
        observed[code] = {"amended": date_value, "source": url}
        if date_value != baseline:
            changes.append({"code": code, "verified_baseline": baseline, "observed_amended": date_value})
        time.sleep(0.6)
    result = {
        "checked_at": now if success else "",
        "checked_scope": "僅比對官方頁面的「修正日期」，不判定條文施行日或題目答案是否過時；需人工複核。",
        "successful_sources": success,
        "laws": observed, "changes": changes, "errors": errors,
    }
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("source checks:", success, "of", len(LAWS), "; changed since baseline:", len(changes), "; errors:", len(errors))
    for e in errors:
        print("source error:", e["code"], e["message"])
    if success == 0:
        print("WARNING: No law source could be verified this run; do not treat this as 'no amendments'.")

if __name__ == "__main__":
    main()
