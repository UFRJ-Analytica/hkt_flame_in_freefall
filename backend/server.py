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

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 32768


def make_handler(service, root=ROOT):
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
                self._send(200, service.status())
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
                self._send(404, {"error": "Endpoint desconhecido."})
                return
            if any(part.startswith(".") for part in Path(path).parts if part not in {"/", "\\"}):
                self._send(404, {"error": "Recurso não encontrado."})
                return
            target = (dist / path.lstrip("/\\")).resolve()
            if not target.is_relative_to(dist):
                self._send(404, {"error": "Recurso não encontrado."})
                return
            if path in {"/", "/design", "/experiments", "/sources"}:
                target = dist / "index.html"
            if not target.is_file():
                self._send(404, {"error": "Recurso não encontrado. Use npm run dev ou gere dist com npm run build."})
                return
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix == ".js":
                content_type = "text/javascript"
            self._send(200, target.read_bytes(), content_type)

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in {"/api/research/search", "/api/research/synthesize"}:
                self._send(404, {"error": "Endpoint desconhecido."})
                return
            origin = self.headers.get("Origin")
            host = self.headers.get("Host", "")
            if origin and urlsplit(origin).netloc != host:
                self._send(403, {"error": "Requisições devem usar a mesma origem da aplicação."})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY:
                    self._send(413, {"error": "Corpo JSON ausente ou acima do limite."})
                    return
                if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    self._send(415, {"error": "Use Content-Type application/json."})
                    return
                payload = json.loads(self.rfile.read(size).decode("utf-8"))
                result = service.search(payload, synthesize=path.endswith("/synthesize"))
                self._send(200, result)
            except (ValueError, UnicodeDecodeError) as exc:
                self._send(400, {"error": str(exc)[:200]})
            except Exception:
                self._send(500, {"error": "Falha interna de pesquisa. O catálogo e o cenário ilustrativo permanecem disponíveis."})

    return Handler


def main():
    load_env(ROOT / ".env")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    service = ResearchService(ROOT)
    server = ThreadingHTTPServer((host, port), make_handler(service))
    server.daemon_threads = True
    status = service.status()
    print(f"HabitatFire API http://{host}:{port} — {status['investigationCount']} investigações, {status['documentCount']} documentos; geração {status['generationModel'] or 'desativada'}; embeddings {status['embeddingModel'] or 'desativados'} ({status['vectorStore'] or 'sem índice vetorial'})", flush=True)

    def warm():
        try:
            service.warm_up()
            print(f"[HabitatFire] Índice vetorial pronto ({service.status()['vectorStore']}).", flush=True)
        except Exception as exc:
            print(f"[HabitatFire] Índice vetorial indisponível ({type(exc).__name__}); busca lexical segue ativa.", flush=True)

    threading.Thread(target=warm, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
