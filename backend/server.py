"""Local HTTP API + optional built frontend. Run: python -m backend.server."""
from __future__ import annotations

import json
import mimetypes
import os
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from backend.env import load_env
from backend.media import MediaResolver
from backend.research import ResearchService
from backend.si import MODEL as SI_MODEL, ScienceIntelligence

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 131072


def make_handler(service, root=ROOT, si=None):
    si = si if si is not None else ScienceIntelligence(service, service.provider)
    dist = (Path(root) / "dist").resolve()
    media = MediaResolver(root)

    class Handler(BaseHTTPRequestHandler):
        server_version = "HabitatFire/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def _send(self, status, body, content_type="application/json; charset=utf-8"):
            encoded = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json") else "no-cache")
            self.end_headers()
            try:
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # A cancelled stale UI request is not a server failure.

        def log_message(self, format, *args):
            # No query text, request payload, provider error body or credentials.
            print(f"[HabitatFire] {self.command} {urlsplit(self.path).path}", flush=True)

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path in {"/api/health", "/health"}:
                self._send(200, {"status": "ready", "service": "habitatfire-research"})
                return
            if path == "/api/research/status":
                self._send(200, service.status() | {"siConfigured": si.configured, "siModel": SI_MODEL if si.configured else None, "documents": [{"id": d["id"], "title": d["title"], "url": d["url"], "role": d.get("role", "investigation"), "passages": len(d.get("passages", []))} for d in service.documents]})
                return
            if path == "/api/media":
                query = parse_qs(urlsplit(self.path).query)
                try:
                    location = media.resolve(query.get("investigation", [""])[0], query.get("file", [""])[0])
                except LookupError as exc:
                    self._send(404, {"error": str(exc)})
                    return
                except ConnectionError as exc:
                    self._send(502, {"error": str(exc)})
                    return
                self.send_response(302)
                self.send_header("Location", location)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if path.startswith("/api/"):
                self._send(404, {"error": "Unknown endpoint."})
                return
            if any(part.startswith(".") for part in Path(path).parts if part not in {"/", "\\"}):
                self._send(404, {"error": "Resource not found."})
                return
            target = (dist / path.lstrip("/\\")).resolve()
            if not target.is_relative_to(dist):
                self._send(404, {"error": "Resource not found."})
                return
            if path in {"/", "/design", "/experiments", "/sources"}:
                target = dist / "index.html"
            if not target.is_file():
                self._send(404, {"error": "Resource not found. Use npm run dev or generate dist with npm run build."})
                return
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix == ".js":
                content_type = "text/javascript"
            self._send(200, target.read_bytes(), content_type)

        def _client_key(self):
            forwarded = self.headers.get("X-Forwarded-For", "")
            return forwarded.split(",")[0].strip() or self.client_address[0]

        def _si(self, payload):
            if not si.limiter.allow(self._client_key()):
                self._send(429, {"error": "Too many SI questions from this address; try again in a few minutes."})
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            self.connection.settimeout(180)

            def emit(event):
                data = json.dumps(event, ensure_ascii=False, allow_nan=False, default=str)
                self.wfile.write(b"data: " + data.encode("utf-8") + b"\n\n")
                self.wfile.flush()

            try:
                si.ask(payload, emit)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            except ValueError as exc:
                try:
                    emit({"type": "error", "message": str(exc)[:200]})
                except OSError:
                    pass
            except Exception as exc:
                print(f"[HabitatFire] SI failure ({type(exc).__name__})", flush=True)
                try:
                    emit({"type": "error", "message": "SI is unavailable right now. Semantic search and the catalog still work."})
                except OSError:
                    pass

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in {"/api/research/search", "/api/research/synthesize", "/api/research/retrieve", "/api/si/ask"}:
                self._send(404, {"error": "Unknown endpoint."})
                return
            origin = self.headers.get("Origin")
            host = self.headers.get("Host", "")
            if origin and urlsplit(origin).netloc != host:
                self._send(403, {"error": "Requests must use the same origin as the application."})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY:
                    self._send(413, {"error": "JSON body is missing or exceeds the limit."})
                    return
                if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    self._send(415, {"error": "Use Content-Type application/json."})
                    return
                payload = json.loads(self.rfile.read(size).decode("utf-8"))
                if path == "/api/si/ask":
                    self._si(payload)
                    return
                if path == "/api/research/retrieve":
                    if not isinstance(payload, dict):
                        raise ValueError("Send a JSON object.")
                    hits, mode = service.retrieve(payload.get("query"), payload.get("limit", 10) if isinstance(payload.get("limit"), int) else 10, payload.get("scope") if payload.get("scope") in {"any", "documents", "investigations"} else "any")
                    self._send(200, {"query": payload.get("query"), "retrieval": mode, "passages": hits})
                    return
                result = service.search(payload, synthesize=path.endswith("/synthesize"))
                self._send(200, result)
            except (ValueError, UnicodeDecodeError) as exc:
                self._send(400, {"error": str(exc)[:200]})
            except Exception:
                self._send(500, {"error": "Internal research failure. The catalog and illustrative scenario remain available."})

    return Handler


def main():
    load_env(ROOT / ".env")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    service = ResearchService(ROOT)
    server = ThreadingHTTPServer((host, port), make_handler(service))
    server.daemon_threads = True
    status = service.status()
    print(f"HabitatFire API http://{host}:{port} — {status['investigationCount']} investigations, {status['documentCount']} documents; generation {status['generationModel'] or 'disabled'}; embeddings {status['embeddingModel'] or 'disabled'} ({status['vectorStore'] or 'no vector index'})", flush=True)

    def warm():
        try:
            service.warm_up()
            print(f"[HabitatFire] Vector index ready ({service.status()['vectorStore']}).", flush=True)
        except Exception as exc:
            print(f"[HabitatFire] Vector index unavailable ({type(exc).__name__}); lexical search remains active.", flush=True)

    threading.Thread(target=warm, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
