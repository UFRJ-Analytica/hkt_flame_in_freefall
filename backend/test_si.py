"""SI tools, validation and audit; offline (no Claude or embedding calls)."""
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.research import ResearchService
import tempfile

from backend.si import AnswerCache, RateLimiter, ScienceIntelligence, validate

ROOT = Path(__file__).resolve().parents[1]


class SIChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict("os.environ", {"HABITATFIRE_ENABLE_AI": "0"}):
            cls.service = ResearchService(ROOT)
        cls.si = ScienceIntelligence(cls.service, cls.service.provider)

    def state(self, stage="identify", facets=None):
        return {"stage": stage, "environment": "lunar-habitat", "facets": facets or {"quantities": [], "materials": [], "datasets": []},
                "sources": {}, "records": set(), "retrieval": None, "outputs": []}

    def test_corpus_includes_challenge_resources(self):
        ids = {doc["id"] for doc in self.service.documents}
        for expected in ["nasa-guide-2015", "nasa-combustion-science", "nasa-apollo-1", "nasa-apollo-13", "nasa-mir-fire",
                         "nasa-spinoff-detector", "nasa-spinoff-air-tanks", "nasa-spinoff-fire-attire"]:
            self.assertIn(expected, ids)

    def test_retrieve_finds_mir_fire_passage_with_role(self):
        hits, mode = self.service.retrieve("Mir solid fuel oxygen generator fire", 5, "documents")
        self.assertEqual(mode, "lexical")
        self.assertTrue(any(hit["id"].startswith("nasa-mir-fire") and hit["role"] == "mishap" for hit in hits))
        self.assertTrue(all(hit["kind"] == "document" for hit in hits))

    def test_retrieve_scope_investigations_returns_metadata_only(self):
        hits, _ = self.service.retrieve("smoke aerosol particle size", 5, "investigations")
        self.assertTrue(hits)
        self.assertTrue(all(hit["kind"] == "metadata" for hit in hits))

    def test_validate_rejects_unknown_stage_and_environment(self):
        with self.assertRaises(ValueError):
            validate({"question": "x", "stage": "deploy"})
        with self.assertRaises(ValueError):
            validate({"question": "x", "stage": "identify", "environment": "mars-base"})
        ok = validate({"question": " What burns? ", "stage": "catalog", "investigation": "PSI-25"})
        self.assertEqual(ok["question"], "What burns?")

    def test_record_query_counts_and_registers_records(self):
        state = self.state("catalog")
        out = self.si._records({"material_contains": "Kapton", "limit": 5}, state)
        self.assertGreater(out["total"], 5)
        self.assertEqual(sum(out["totalByInvestigation"].values()), out["total"])
        self.assertEqual(len(state["records"]), 5)

    def test_selection_rejects_values_outside_facets(self):
        events = []
        state = self.state("extract", {"quantities": ["Flame spread rate"], "materials": ["SIBAL"], "datasets": []})
        bad = self.si._select({"materials": ["Unobtainium"], "explanation": "x"}, state, events.append)
        self.assertIn("error", bad)
        self.assertEqual(events, [])
        good = self.si._select({"quantities": ["Flame spread rate"], "oxygen_min": 30, "explanation": "rates"}, state, events.append)
        self.assertTrue(good["applied"])
        self.assertEqual(events[0]["oxygenMin"], 30)

    def test_client_effect_tools_are_stage_bound(self):
        with self.assertRaises(ValueError):
            self.si._run_tool("open_investigation", {"id": "PSI-25"}, self.state("identify"), lambda e: None)

    def test_audit_flags_unretrieved_citations_and_invented_numbers(self):
        state = self.state()
        self.si._semantic_search({"query": "Mir oxygen generator fire canister", "limit": 3, "scope": "documents"}, state)
        cited = next(iter(state["sources"]))
        text = f"A three-foot flame occurred [[{cited}]]. It burned at 987.6 K [[made-up-id]]."
        audit = self.si.audit(text, "question", state)
        self.assertIn("made-up-id", audit["invalidCitations"])
        self.assertNotIn(cited, audit["invalidCitations"])
        self.assertIn("987.6", audit["unverifiedNumbers"])

    def test_audit_accepts_rounded_tool_values(self):
        state = self.state()
        state["outputs"].append('{"pressureKpa": 71.8693}')
        self.assertEqual(self.si.audit("Pressure was 71.87 kPa.", "q", state)["unverifiedNumbers"], [])

    def test_answer_cache_replays_only_clean_answers(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = AnswerCache(tmp)
            request = validate({"question": "Which  tests burned SIBAL?", "stage": "identify", "environment": "lunar-habitat"})
            same = validate({"question": "which tests burned sibal?", "stage": "identify", "environment": "lunar-habitat"})
            other = validate({"question": "which tests burned sibal?", "stage": "catalog"})
            key = cache.key(request, "v1")
            self.assertEqual(key, cache.key(same, "v1"))
            self.assertNotEqual(key, cache.key(other, "v1"))
            self.assertNotEqual(key, cache.key(request, "v2"))
            cache.put(key, "q", [{"type": "text", "delta": "x"}, {"type": "error", "message": "boom"}])
            self.assertIsNone(cache.get(key))
            events = [{"type": "step", "label": "s"}, {"type": "text", "delta": "Hello"}, {"type": "done", "cited": []}]
            cache.put(key, "q", events)
            replayed = []
            cache.replay(cache.get(key), replayed.append, sleep=lambda _: None)
            self.assertEqual(replayed, events)

    def test_rate_limiter(self):
        limiter = RateLimiter(limit=2, window=60)
        self.assertTrue(limiter.allow("a"))
        self.assertTrue(limiter.allow("a"))
        self.assertFalse(limiter.allow("a"))
        self.assertTrue(limiter.allow("b"))


if __name__ == "__main__":
    unittest.main()
