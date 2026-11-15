"""Exercise the real HTTP boundary on an isolated ephemeral local port."""
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.research import ResearchService
from backend.server import make_handler
from backend.test_research import question


class HttpChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parents[1]
        with patch.dict("os.environ", {"HABITATFIRE_ENABLE_AI": "0"}):
            service = ResearchService(root)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(service, root))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_health_and_status_reflect_loaded_real_sources(self):
        with urlopen(self.base + "/api/health") as response:
            self.assertEqual(json.load(response)["service"], "habitatfire-research")
        with urlopen(self.base + "/api/research/status") as response:
            status = json.load(response)
        self.assertEqual(status["investigationCount"], 24)
        self.assertEqual(status["documentCount"], 14)
        self.assertFalse(status["siConfigured"])
        self.assertEqual(len(status["documents"]), 14)
        self.assertFalse(status["generationConfigured"])

    def test_search_and_unconfigured_synthesis_preserve_real_extractive_mode(self):
        for path in ["search", "synthesize"]:
            request = Request(self.base + "/api/research/" + path, data=json.dumps(question("PSI-25 PMMA baixo fluxo")).encode(), headers={"Content-Type": "application/json"})
            with urlopen(request) as response:
                bundle = json.load(response)
            self.assertEqual(bundle["investigations"][0]["investigation"]["id"], "PSI-25")
            self.assertEqual(bundle["synthesisMode"], "extractive")

    def test_bad_json_and_repository_paths_are_not_served(self):
        request = Request(self.base + "/api/research/search", data=b'{invalid', headers={"Content-Type": "application/json"})
        with self.assertRaises(HTTPError) as invalid:
            urlopen(request)
        self.assertEqual(invalid.exception.code, 400)
        for path in ["/.env", "/backend/providers.py", "/../PROJECT.md"]:
            with self.assertRaises(HTTPError) as missing:
                urlopen(self.base + path)
            self.assertEqual(missing.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
