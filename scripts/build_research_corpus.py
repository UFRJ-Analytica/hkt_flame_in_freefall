#!/usr/bin/env python3
"""Build a small, page-cited NASA corpus without changing PSI source artifacts.

The API consumes the committed JSON snapshot; PDF extraction is a build-time task.
Source bytes, stable URLs, hashes and page positions are recorded for auditability.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import io
import json
import re
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "research"
OUTPUT = ROOT / "public" / "data" / "research-corpus.json"
SOURCES = [
    {"id": "nasa-guide-2015", "title": "NASA Researcher's Guide: Combustion Science in Reduced Gravity (2015)", "url": "https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf", "format": "pdf", "investigationIds": [], "topics": ["prevention", "detection", "suppression", "post-fire", "terrestrial"]},
    {"id": "nasa-bass", "title": "NASA: Burning and Suppression of Solids — BASS / BASS-II / BASS-M", "url": "https://www.nasa.gov/wp-content/uploads/2025/07/burning-and-suppression-of-solids-bass.pdf", "format": "pdf", "investigationIds": ["PSI-25", "PSI-26"], "topics": ["prevention", "suppression", "terrestrial"]},
    {"id": "nasa-saffire", "title": "NASA: Spacecraft Fire Safety Demonstration — Saffire", "url": "https://www.nasa.gov/wp-content/uploads/2025/07/spacecraft-fire-safety-demonstration-saffire.pdf", "format": "pdf", "investigationIds": ["PSI-98", "PSI-99", "PSI-100"], "topics": ["prevention", "detection", "suppression", "post-fire"]},
    {"id": "nasa-same", "title": "NASA: Smoke Aerosol Measurement Experiment — SAME / SAME-R", "url": "https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf", "format": "pdf", "investigationIds": ["PSI-101", "PSI-102"], "topics": ["detection", "terrestrial"]},
    {"id": "nasa-sofie", "title": "NASA: Solid Fuel Ignition and Extinction — SoFIE", "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/solid-fuel-ignition-and-extinction-sofie/", "format": "html", "investigationIds": [], "topics": ["prevention", "suppression"]},
    {"id": "nasa-flare", "title": "NASA: Flammability Limits at Reduced-g Experiment — FLARE", "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-limits-at-reduced-g-experiment-flare/", "format": "html", "investigationIds": [], "topics": ["prevention"]},
    {"id": "nasa-fm2", "title": "NASA: Flammability of Materials on the Moon — FM2", "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2/", "format": "html", "investigationIds": [], "topics": ["prevention"]},
    {"id": "nasa-spinoff-detector", "title": "NASA Spinoff: Fire Detector (Shuttle smoke detector, historical)", "url": "https://spinoff.nasa.gov/node/9407", "format": "html", "investigationIds": [], "topics": ["detection", "terrestrial"], "role": "spinoff"},
    # Challenge resources added 2026-11-15: program overview, mishap lessons and spinoffs.
    {"id": "nasa-combustion-science", "title": "NASA Glenn: Combustion Science program overview", "url": "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/", "format": "html", "investigationIds": [], "topics": ["prevention", "detection", "suppression", "post-fire", "terrestrial"], "role": "program"},
    {"id": "nasa-apollo-1", "title": "NASA: Apollo 1 — cabin fire, investigation and lessons learned (historical)", "url": "https://www.nasa.gov/mission/apollo-1/", "format": "html", "investigationIds": [], "topics": ["prevention", "detection", "suppression", "post-fire"], "role": "mishap"},
    {"id": "nasa-apollo-13", "title": "NASA: Apollo 13 — oxygen tank explosion, investigation and lessons learned (historical)", "url": "https://www.nasa.gov/mission/apollo-13/", "format": "html", "investigationIds": [], "topics": ["prevention", "post-fire"], "role": "mishap"},
    {"id": "nasa-mir-fire", "title": "NASA History: 25 Years Ago, Fire Aboard Space Station Mir (1997)", "url": "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/", "format": "html", "investigationIds": [], "topics": ["prevention", "detection", "suppression", "post-fire"], "role": "mishap"},
    {"id": "nasa-spinoff-air-tanks", "title": "NASA Spinoff: Fireman's Air Tanks (historical)", "url": "https://spinoff.nasa.gov/node/9582", "format": "html", "investigationIds": [], "topics": ["post-fire", "terrestrial"], "role": "spinoff"},
    {"id": "nasa-spinoff-fire-attire", "title": "NASA Spinoff: New Technology for the Fire Attire (historical)", "url": "https://spinoff.nasa.gov/node/9918", "format": "html", "investigationIds": [], "topics": ["post-fire", "terrestrial"], "role": "spinoff"},
]


class ArticleText(HTMLParser):
    """Extract rendered article text without executing page scripts."""
    def __init__(self):
        super().__init__()
        self.suppressed = 0
        self.parts: list[str] = []
        self.main: list[str] = []
        self.in_main = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "header", "footer", "noscript"):
            self.suppressed += 1
        if tag in ("main", "article"):
            self.in_main += 1
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "br") and not self.suppressed:
            self.parts.append("\n")
            if self.in_main:
                self.main.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer", "noscript"):
            self.suppressed = max(0, self.suppressed - 1)
        if tag in ("main", "article"):
            self.in_main = max(0, self.in_main - 1)
        if tag in ("p", "li", "h1", "h2", "h3", "div", "section"):
            self.parts.append("\n")
            if self.in_main:
                self.main.append("\n")

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(data)
            if self.in_main:
                self.main.append(data)

    def text(self):
        return " ".join(self.main or self.parts)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\x00", " ")).strip()


def passages(text: str, max_words: int = 180) -> list[str]:
    """Sentence-bounded excerpts; token-specific chunking belongs to the embedder."""
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", normalize(text))
    output, current, count = [], [], 0
    for sentence in sentences:
        words = sentence.split()
        # Bound even long figure/table runs; never claim this is model-token chunking.
        fragments = [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)]
        for fragment in fragments:
            size = len(fragment.split())
            if current and count + size > max_words:
                output.append(" ".join(current))
                current, count = [], 0
            current.append(fragment)
            count += size
    if current:
        output.append(" ".join(current))
    return [value for value in output if len(value.split()) >= 20]


def write_json_atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, suffix=".json.tmp", delete=False) as target:
        json.dump(value, target, ensure_ascii=False, indent=2)
        target.write("\n")
        staged = Path(target.name)
    staged.replace(path)


def build(offline=False, refresh=False):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF rebuild requires scripts/requirements-ingest.txt in a project virtualenv; normal API use does not.") from exc
    RAW.mkdir(parents=True, exist_ok=True)
    documents, manifest, errors = [], [], []
    old_manifest_path = RAW / "manifest.json"
    old = json.loads(old_manifest_path.read_text(encoding="utf-8")) if old_manifest_path.exists() else {"artifacts": []}
    old_by_id = {row["id"]: row for row in old.get("artifacts", [])}
    for source in SOURCES:
        path = RAW / (source["id"] + "." + source["format"])
        try:
            previous = old_by_id.get(source["id"])
            reuse = not refresh and previous and path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == previous.get("sha256")
            if not offline and not reuse:
                request = urllib.request.Request(source["url"], headers={"User-Agent": "HabitatFire research corpus/1.0 (NASA Space Apps)"})
                with urllib.request.urlopen(request, timeout=35) as response:
                    data = response.read(12_000_001)
                if len(data) > 12_000_000:
                    raise ValueError("Source exceeds corpus download size limit")
                if source["format"] == "pdf" and not data.startswith(b"%PDF"):
                    raise ValueError("Expected a PDF, did not receive PDF bytes")
                path.write_bytes(data)
            else:
                data = path.read_bytes()
                if not previous or hashlib.sha256(data).hexdigest() != previous.get("sha256"):
                    raise ValueError("Offline artifact has no matching provenance hash")
            pages = []
            if source["format"] == "pdf":
                reader = PdfReader(io.BytesIO(data))
                pages = [(f"PDF p. {index + 1}", page.extract_text() or "") for index, page in enumerate(reader.pages)]
            else:
                parser = ArticleText()
                parser.feed(data.decode("utf-8", errors="replace"))
                pages = [("Official page text" + (" (historical context)" if source.get("role") in {"mishap", "spinoff"} else ""), parser.text())]
            chunks = []
            for location, text in pages:
                # Site chrome on Spinoff pages: search menu prefix and the related-stories rail.
                text = re.sub(r"^\s*menu Search search Advanced Search\s*", "", normalize(text))
                text = text.split(" Related Stories ")[0]
                for part in passages(text):
                    chunks.append({"id": f"{source['id']}-{len(chunks) + 1}", "text": part, "location": location})
            if not chunks:
                raise ValueError("Source has no usable extracted text; not replacing it with invented content")
            digest = hashlib.sha256(data).hexdigest()
            artifact = {"id": source["id"], "url": source["url"], "path": path.relative_to(ROOT).as_posix(), "sha256": digest, "retrievedAt": previous["retrievedAt"] if (offline or reuse) else datetime.now(timezone.utc).isoformat(), "bytes": len(data)}
            manifest.append(artifact)
            documents.append({key: value for key, value in source.items() if key != "format"} | {"sourceHash": digest, "retrievedAt": artifact["retrievedAt"], "passages": chunks, "limitations": ["Extracted source text; not a per-test measurement. Historical sources are not current operational requirements."], "role": source.get("role", "investigation")})
            print(f"{source['id']}: {len(chunks)} passages", flush=True)
        except Exception as exc:
            errors.append({"id": source["id"], "error": str(exc)})
    # Fail closed on partial updates: keep the previous public corpus intact.
    if errors:
        for row in errors:
            print(json.dumps(row, ensure_ascii=False), file=sys.stderr)
        raise RuntimeError(f"{len(errors)} sources failed; previous public corpus was not replaced")
    canonical = json.dumps([(row["id"], row["sha256"]) for row in manifest], separators=(",", ":"))
    version = hashlib.sha256(canonical.encode()).hexdigest()[:16]
    result = {"schemaVersion": 1, "corpusVersion": version, "extractor": {"name": "pypdf", "version": importlib.metadata.version("pypdf"), "chunker": "sentence-180-words-v1"}, "documents": documents}
    write_json_atomic(OUTPUT, result)
    if not offline:
        write_json_atomic(old_manifest_path, {"schemaVersion": 1, "artifacts": manifest, "terms": "Retain NASA/source attribution. Item-level source terms apply; no blanket CC0 claim."})
    print(json.dumps({"corpusVersion": version, "documents": len(documents), "passages": sum(len(doc["passages"]) for doc in documents), "output": str(OUTPUT)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="re-download sources that are already stored")
    args = parser.parse_args()
    try:
        build(args.offline, args.refresh)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
