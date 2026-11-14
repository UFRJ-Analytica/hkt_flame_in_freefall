"""Resolve NASA PSI raw-video links on demand.

PSI download links are short-lived signed S3 URLs, so only (investigation, file)
pairs from public/data/nasa-media.json are accepted and resolved per request.
This is a redirect, never a proxy: video bytes go straight from NASA to the browser.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode, urlsplit

API = "https://psi.nasa.gov/geode-py/ws/studies"
ALLOWED_HOSTS = {"psi-curation-prod.s3.amazonaws.com"}
TTL_SECONDS = 600


class MediaResolver:
    def __init__(self, root: Path):
        path = Path(root) / "public/data/nasa-media.json"
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"investigations": {}}
        self.allowed = {accession: set(row.get("files", {})) for accession, row in data["investigations"].items()}
        self._cache, self._lock = {}, threading.Lock()

    def resolve(self, accession, filename):
        if filename not in self.allowed.get(accession, set()):
            raise LookupError("Vídeo não indexado para esta investigação.")
        key = (accession, filename)
        with self._lock:
            hit = self._cache.get(key)
            if hit and hit[0] > time.monotonic():
                return hit[1]
        url = f"{API}/{accession}/download?" + urlencode({"file": filename, "version": 1, "redirect": "false"})
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "HabitatFire/1"}), timeout=20) as response:
                signed = response.read(8192).decode("utf-8").strip()
        except (urllib.error.URLError, OSError, TimeoutError):
            raise ConnectionError("NASA PSI indisponível.") from None
        parts = urlsplit(signed)
        if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
            raise ConnectionError("Resposta inesperada do NASA PSI.")
        with self._lock:
            self._cache[key] = (time.monotonic() + TTL_SECONDS, signed)
        return signed
