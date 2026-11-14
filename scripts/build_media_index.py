"""Index raw experiment videos listed in already-downloaded PSI metadata (no network).

Writes public/data/nasa-media.json. Videos are linked to tabular records only by
explicit, investigation-specific filename rules:
  - "test": the video name carries the record's own test code (exact match);
  - "day":  the record summarises a test day and the video was recorded that day.
Anything else stays an investigation-level count with a link to the PSI portal.
Signed download URLs expire, so only stable (investigation, file) pairs are stored;
the API resolves them on demand.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/psi"
SNAPSHOT = ROOT / "public/data/nasa-experiments.json"
OUT = ROOT / "public/data/nasa-media.json"
VIDEO = (".mp4", ".mov", ".avi", ".ts")
PORTAL = "https://psi.nasa.gov/physci/repo/data/investigations"


def compact(value):
    return re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()


def current_videos(metadata):
    """Replay the add/modify/remove log; keep files whose latest event is not a removal."""
    latest = {}
    for kind in ("added", "modified", "removed"):
        for item in metadata.get(kind) or []:
            path = item.get("remote_path") or item.get("file_name")
            stamp = item.get("date_modified")
            stamp = stamp.get("$date", 0) if isinstance(stamp, dict) else 0
            if path and (path not in latest or stamp >= latest[path][0]):
                latest[path] = (stamp, kind, item)
    videos = []
    for stamp, kind, item in latest.values():
        name = item.get("file_name", "")
        if kind != "removed" and name.lower().endswith(VIDEO) and not item.get("restricted"):
            folder = Path(item.get("remote_path", "")).parent.name
            videos.append({"file": name, "bytes": int(float(item.get("file_size") or 0)), "folder": folder})
    # Prefer browser-playable mp4 over .ts transport-stream duplicates in listings.
    return sorted(videos, key=lambda v: (not v["file"].lower().endswith(".mp4"), v["file"]))


def bass2_key(record):
    raw = record["raw"]
    sample = re.sub(r"\D", "", str(raw.get("Sample #") or ""))  # "153m" -> "153"
    return compact(f"GMT{raw.get('GMT')}SAMPLE{sample}TEST{raw.get('Test #')}")


def acme_test_code(name):
    match = re.search(r"_(\d{5}\s?[A-Z]\d+[a-z]?)(?:_[^.]*)?\.(?:mp4|ts)$", name)
    return compact(match.group(1)) if match else None


def rule_bass2(videos, records):
    index = defaultdict(list)
    for video in videos:
        match = re.search(r"GMT(\d+)_SAMPLE_(\d+)_TEST_?([A-Za-z]+\d+)(?:_|\.)", video["file"])
        if match:
            index[compact(f"GMT{match.group(1)}SAMPLE{match.group(2)}TEST{match.group(3)}")].append(video)
    return {record["id"]: ("test", index[bass2_key(record)]) for record in records if index.get(bass2_key(record))}


def rule_acme_tests(videos, records):
    index = defaultdict(list)
    for video in videos:
        code = acme_test_code(video["file"])
        if code:
            index[code].append(video)
    links = {}
    for record in records:
        code = compact(record["raw"].get("Test"))
        if code and index.get(code):
            links[record["id"]] = ("test", index[code])
    return links


def rule_acme_days(videos, records):
    index = defaultdict(list)
    for video in videos:
        code = acme_test_code(video["file"])
        if code:
            index[code[:5]].append(video)
    links = {}
    for record in records:
        day = compact(record["raw"].get("Test Day*") or record["raw"].get("Test Day"))
        if len(day) == 5 and index.get(day):
            links[record["id"]] = ("day", index[day])
    return links


def rule_cfi(videos, records):
    by_cir, by_flex = defaultdict(list), defaultdict(list)
    for video in videos:
        cir = re.search(r"_(F\d{3}[A-Z]\d{2})(?:_|\.)", video["file"], re.IGNORECASE)
        flex = re.search(r"FLEX-(\d{4})", video["file"])
        if cir:
            by_cir[cir.group(1).upper()].append(video)
        if flex:
            by_flex[flex.group(1)].append(video)
    links = {}
    for record in records:
        cir = compact(record["raw"].get("CIR ") or record["raw"].get("CIR")).upper()
        found = by_cir.get(cir) or by_flex.get(str(record["raw"].get("Flex Number") or "").strip())
        if found:
            links[record["id"]] = ("test", found)
    return links


RULES = {"PSI-25": rule_bass2, "PSI-10": rule_acme_tests, "PSI-159": rule_acme_tests, "PSI-39": rule_cfi,
         "PSI-20": rule_acme_days, "PSI-21": rule_acme_days, "PSI-22": rule_acme_days, "PSI-23": rule_acme_days}


def main():
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    investigations, records = {}, {}
    for investigation in snapshot["investigations"]:
        accession = investigation["id"]
        path = RAW / accession / "metadata.json"
        if not path.exists():
            continue
        videos = current_videos(json.loads(path.read_text(encoding="utf-8")))
        if not videos:
            continue
        rule = RULES.get(accession)
        links = rule(videos, investigation.get("tests", [])) if rule else {}
        for record_id, (precision, found) in links.items():
            records[record_id] = {"investigationId": accession, "precision": precision, "videos": [v["file"] for v in found[:12]], "count": len(found)}
        linked = {name for entry in records.values() if entry["investigationId"] == accession for name in entry["videos"]}
        investigations[accession] = {"videoCount": len(videos), "linkedRecords": len(links), "linkedVideos": len(linked),
                                     "portalUrl": f"{PORTAL}/{accession}", "sample": [v["file"] for v in videos[:6]],
                                     "files": {v["file"]: v["bytes"] for v in videos}}
        print(f"{accession}: {len(videos)} vídeos; {len(links)}/{len(investigation.get('tests', []))} registros ligados ({rule.__name__ if rule else 'só nível investigação'})")
    OUT.write_text(json.dumps({"schemaVersion": 1, "sourceRetrievedAt": snapshot.get("retrievedAt"),
                               "note": "Vídeos brutos do NASA PSI referenciados pelos metadados; não redistribuídos. Ligação a registros apenas por regra explícita de nome de arquivo.",
                               "investigations": investigations, "records": records}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{sum(i['videoCount'] for i in investigations.values())} vídeos; {len(records)} registros com vídeo -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
