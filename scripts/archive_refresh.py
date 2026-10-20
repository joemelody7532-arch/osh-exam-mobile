#!/usr/bin/env python3
"""Refresh links to publicly indexed historical skills-test PDFs.

This does not copy exam papers or third-party explanations. The training app
continues to load its independently maintained live question bank on open.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "archive-index.json"
SITES = [
    ("職安幫", "https://www.oshbon.com.tw/license/OshSkillTest/QuestionBank"),
    ("職安一點通", "https://www.osh-soeasy.com/exam"),
]
session = requests.Session()
session.headers.update({"User-Agent": "OSHExamStudyLinkChecker/1.0 (public-source index only)"})
THIS_YEAR = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).year


def cert_of(value: str) -> str | None:
    t = re.sub(r"\s+", "", value)
    if "22200" in t or "職業安全衛生管理員" in t or "乙級職業安全衛生" in t:
        return "22200"
    if "22100" in t or "職業衛生管理" in t or "甲衛" in t:
        return "22100"
    if "22000" in t or "職業安全管理" in t or "甲安" in t:
        return "22000"
    return None


def roc_year(value: str) -> int | None:
    # A historical ROC year must be recognizable within a row or link title.
    for m in re.finditer(r"(?<!\d)(9\d|10\d|11\d)(?!\d)", value):
        y = int(m.group(1)) + 1911
        if 2010 <= y <= THIS_YEAR:
            return y
    return None


def public_pdf(base: str, href: str) -> str | None:
    url = urljoin(base, href)
    p = urlparse(url)
    if p.scheme != "https" or not p.netloc or not p.path.lower().endswith(".pdf"):
        return None
    return url


def record(url: str, year: int, cert: str, provider: str, kind: str, session_no: int | None = None) -> dict:
    yy = year - 1911
    turn = ("第" + str(session_no) + "梯 ") if session_no else ""
    return {
        "year": year,
        "roc_year": yy,
        "certificate": cert,
        "session": session_no,
        "category": kind,
        "title": f"{yy}年 {turn}{kind}試題",
        "publisher": f"{provider}公開索引（外部 PDF）",
        "url": url,
        "source_type": "public_reference_link",
    }


def scan_oshbon(soup: BeautifulSoup, base: str) -> list[dict]:
    output = []
    for table in soup.find_all("table"):
        h = table.find_previous(["h1", "h2", "h3", "h4", "h5", "strong"])
        nearby = h.get_text(" ", strip=True) if h else ""
        cert = cert_of(nearby)
        sample = table.find("tr")
        print(f"OSHBon section: heading={nearby[:65]!r}, cert={cert}, row_count={len(table.find_all('tr'))}, first_row={(sample.get_text(' ',strip=True)[:170] if sample else 'none')!r}")
        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"], recursive=False)
            if len(cells) < 2:
                continue
            year = roc_year(cells[0].get_text(" ", strip=True))
            if not year:
                continue
            for pos, cell in enumerate(cells[1:], start=1):
                for a in cell.find_all("a", href=True):
                    title = a.get_text(" ", strip=True)
                    kind = "術科" if "術科" in title else "學科" if "學科" in title else None
                    url = public_pdf(base, a["href"])
                    inferred = cert or cert_of(str(a["href"]) + " " + title)
                    if kind and url and inferred:
                        output.append(record(url, year, inferred, "職安幫", kind, pos))
    return output


def scan_soeasy(soup: BeautifulSoup, base: str) -> list[dict]:
    output = []
    for a in soup.find_all("a", href=True):
        url = public_pdf(base, a["href"])
        if not url:
            continue
        context = a.get_text(" ", strip=True) + " " + unquote(url)
        parent = a.find_parent(["tr", "li", "p", "div"])
        context += " " + (parent.get_text(" ", strip=True)[:160] if parent else "")
        cert, year = cert_of(context), roc_year(context)
        if not cert or not year:
            continue
        kind = "術科" if "術科" in context else "學科" if "學科" in context else "歷屆"
        output.append(record(url, year, cert, "職安一點通", kind))
    return output


def main() -> None:
    if DEST.exists():
        try:
            old = json.loads(DEST.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            old = {}
    else:
        old = {}
    indexed: dict[str, dict] = {}
    for r in old.get("entries", []):
        if isinstance(r, dict) and isinstance(r.get("url"), str):
            indexed[r["url"]] = r
    count_before = len(indexed)
    errors = []
    successes = 0
    for provider, url in SITES:
        try:
            reply = session.get(url, timeout=25)
            reply.raise_for_status()
            # These pages are UTF-8, but some hosts omit charset from HTTP headers.
            soup = BeautifulSoup(reply.content.decode("utf-8", errors="replace"), "html.parser")
            print(f"{provider} HTML info: length={len(reply.text)}, tables={len(soup.find_all('table'))}, anchors={len(soup.find_all('a'))}, PDF links={sum(1 for a in soup.find_all('a', href=True) if '.pdf' in a['href'].lower())}, page_title={(soup.title.get_text(' ',strip=True)[:100] if soup.title else 'none')}")
            found = scan_oshbon(soup, url) if provider == "職安幫" else scan_soeasy(soup, url)
            successes += 1
            for r in found:
                indexed.setdefault(r["url"], r)
            print(f"{provider}: located {len(found)} historical-PDF links")
        except (requests.RequestException, ValueError) as exc:
            errors.append(f"{provider}: {type(exc).__name__}: {str(exc)[:170]}")
    # Preserve prior links if a website is temporarily unavailable.
    ordered = sorted(indexed.values(), key=lambda r: (int(r.get("year") or 0), r.get("certificate") or "", r.get("url") or ""), reverse=True)
    data = {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sources_checked": successes,
        "new_links": max(0, len(indexed) - count_before),
        "entries": ordered[:650],
        "scan_errors": errors,
        "note": "Link index only; historical PDF files are not automatically converted into interactive questions.",
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Total known historical links: {len(ordered)}; new {data['new_links']}; errors {len(errors)}")


if __name__ == "__main__":
    main()
