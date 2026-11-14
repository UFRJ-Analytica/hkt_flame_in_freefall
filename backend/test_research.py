"""Focused public-seam checks; no paid API/network calls."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.research import ResearchService, validate_request

ROOT = Path(__file__).resolve().parents[1]
CONTEXT = {"vehicle": "orion", "surfaceId": "console_main", "surfaceName": "Console de comando", "structureKind": "Equipamento", "material": "PMMA", "oxygenPct": 21, "pressureKpa": 101.3, "flowCmS": 2, "gravityG": 0}


def question(text, intent="prevention", **changes):
    return {"question": text, "intent": intent, "context": CONTEXT | changes}


class ResearchChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict("os.environ", {"HABITATFIRE_ENABLE_AI": "0"}):
            cls.service = ResearchService(ROOT)

    def test_pmmaa_low_flow_returns_real_records_with_unknowns(self):
        result = self.service.search(question("PMMA em baixo fluxo"))
        self.assertEqual(result["retrievalMode"], "lexical-structured")
        self.assertEqual(result["synthesisMode"], "extractive")
        self.assertIn("PSI-25", [row["investigation"]["id"] for row in result["investigations"][:3]])
        bass = next(row for row in result["investigations"] if row["investigation"]["id"] == "PSI-25")
        self.assertTrue(bass["records"])
        self.assertTrue(bass["unknowns"])
        self.assertIsNone(bass["records"][0]["flowCmS"])
        self.assertFalse(result["visualization"]["predictionAvailable"])
        self.assertTrue(all(record["sourceFile"] for record in bass["records"]))

    def test_detection_prioritizes_aerosol_studies_not_solid_color(self):
        result = self.service.search(question("Como detectar fumaça de Kapton?", "detection"))
        self.assertIn(result["investigations"][0]["investigation"]["id"], {"PSI-101", "PSI-102", "PSI-47"})
        self.assertTrue(result["findings"])
        ids = {source["id"] for source in result["sources"]}
        self.assertTrue(all(set(finding["sourceIds"]) <= ids for finding in result["findings"]))

    def test_explicit_accession_is_not_silently_broadened(self):
        result = self.service.search(question("PSI-69", "prevention"))
        self.assertEqual([item["investigation"]["id"] for item in result["investigations"]], ["PSI-69"])
        self.assertTrue(result["investigations"][0]["mismatches"])
        missing = self.service.search(question("PSI-999999"))
        self.assertEqual(missing["investigations"], [])
        self.assertTrue(missing["gaps"])

    def test_lunar_transfer_is_a_gap_not_a_prediction(self):
        result = self.service.search(question("Este material serve para habitat lunar?"))
        self.assertTrue(any("gravidade" in gap.lower() for gap in result["gaps"]))
        self.assertFalse(result["visualization"]["replayAvailable"])
        self.assertNotIn("riskProbability", result)

    def test_context_and_corpus_participate_in_identity(self):
        first = self.service.search(question("PMMA"))
        second = self.service.search(question("PMMA", vehicle="iss"))
        self.assertNotEqual(first["contextKey"], second["contextKey"])
        self.assertEqual(first["corpusVersion"], second["corpusVersion"])
        self.assertGreater(self.service.status()["passageCount"], 0)

    def test_invalid_values_are_rejected_at_public_boundary(self):
        for value in [float("nan"), float("inf"), -1, 101]:
            with self.assertRaises(ValueError):
                validate_request(question("PMMA", oxygenPct=value))
        with self.assertRaises(ValueError):
            validate_request({"question": "PMMA", "intent": "invented", "context": CONTEXT})

    def test_injected_generation_fallback_rejects_unknown_citations(self):
        class UntrustedGenerator:
            generation_configured = True
            embeddings_configured = False
            def generate(self, bundle):
                return {"summary": "Resposta não sustentada", "findings": [{"text": "Garantia de segurança", "sourceIds": ["invented-source"]}]}
        service = ResearchService(ROOT, provider=UntrustedGenerator())
        result = service.search(question("PMMA"), synthesize=True)
        self.assertEqual(result["synthesisMode"], "extractive")
        self.assertTrue(result["warnings"])

    def test_injected_valid_generation_and_vectors_execute_real_branches(self):
        class ConfiguredProvider:
            generation_configured = True
            embeddings_configured = True
            embedding_model = "injected-test-only"
            def embed(self, texts, task):
                return [[1.0, 0.0] for _ in texts]
            def generate(self, bundle):
                source = bundle["sources"][0]
                return {"summary": "Consulte os trechos e as condições originais.", "findings": [{"text": source["text"], "sourceIds": [source["id"]]}]}
        service = ResearchService(ROOT, provider=ConfiguredProvider())
        result = service.search(question("PMMA"), synthesize=True)
        self.assertEqual(result["retrievalMode"], "hybrid")
        self.assertEqual(result["synthesisMode"], "claude")
        self.assertTrue(result["findings"][0]["sourceIds"])


if __name__ == "__main__":
    unittest.main()
