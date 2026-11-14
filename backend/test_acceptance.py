"""Small hand-checked acceptance set (PROJECT.md §13.1). Lexical path only: no paid calls.

Each case asserts that an investigation a domain reader would expect appears near
the top. This is a smoke set for regressions, not a benchmark of retrieval accuracy.
"""
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.research import ResearchService
from backend.test_research import question

ROOT = Path(__file__).resolve().parents[1]

CASES = [
    # (question, intent, context changes, acceptable ids, top-k)
    ("PMMA em baixo fluxo", "prevention", {}, {"PSI-25", "PSI-26"}, 2),
    ("Como detectar fumaça de Kapton?", "detection", {"material": "Kapton"}, {"PSI-102", "PSI-101"}, 2),
    ("Gotículas de combustível e chamas frias", "prevention", {}, {"PSI-68", "PSI-69", "PSI-39", "PSI-117"}, 2),
    ("Chamas de gás em queimador com campo elétrico", "prevention", {}, {"PSI-22"}, 1),
    ("Large-scale fire test Saffire oxygen", "prevention", {"surfaceId": "wall_panels", "material": "SIBAL"}, {"PSI-98", "PSI-99", "PSI-100"}, 3),
    ("What happens to flame spread on Nomex seat fabric at low ventilation?", "prevention", {"surfaceId": "crew_seats", "material": "Nomex"}, {"PSI-25", "PSI-26", "PSI-98", "PSI-99", "PSI-100"}, 3),
]


class AcceptanceChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict("os.environ", {"HABITATFIRE_ENABLE_AI": "0"}):
            cls.service = ResearchService(ROOT)

    def test_expected_investigations_rank_near_top(self):
        for text, intent, changes, expected, k in CASES:
            with self.subTest(question=text):
                result = self.service.search(question(text, intent, **changes))
                top = [row["investigation"]["id"] for row in result["investigations"][:k]]
                self.assertTrue(expected & set(top), f"{text!r}: top-{k} {top} has none of {sorted(expected)}")

    def test_unsupported_partial_gravity_question_reports_gap(self):
        result = self.service.search(question("Isso vale para um habitat em Marte?", "prevention", gravityG=0.38))
        self.assertTrue(any("gravidade" in gap.lower() for gap in result["gaps"]))

    def test_unknown_material_reports_gap_instead_of_inventing(self):
        result = self.service.search(question("Como queima este tecido?", "prevention", material="Tecido experimental XYZ"))
        self.assertTrue(any("XYZ" in gap for gap in result["gaps"]))


if __name__ == "__main__":
    unittest.main()
