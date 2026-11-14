"""Checks for the curated modeling targets (stdlib only, no network)."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "modeling-targets.json"


class ModelingTargets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = OUT.read_bytes()
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_modeling_targets.py")], check=True, capture_output=True)
        cls.data = json.loads(OUT.read_text(encoding="utf-8"))

    def test_published_file_is_reproducible(self):
        self.assertEqual(self.before, OUT.read_bytes(), "public/data/modeling-targets.json is stale; rerun the build script")

    def test_every_record_is_traceable(self):
        for record in self.data["records"]:
            with self.subTest(record=record["id"]):
                self.assertTrue(record["raw"], "raw CSV cells must be preserved")
                self.assertRegex(record["source"]["sha256"], r"^[0-9a-f]{64}$")
                self.assertIn(record["outcome"], {None, *self.data["outcomeLabels"]})

    def test_rates_have_a_source_and_match_raw_cells(self):
        for record in self.data["records"]:
            if record["spreadRateMmS"] is None:
                continue
            with self.subTest(record=record["id"]):
                self.assertTrue(record["spreadRateSource"])
                if record["investigation"] == "PSI-99":
                    self.assertEqual(record["raw"]["?-g Spread Length"], f"{record['spreadRateMmS']} mm/s")

    def test_ambiguous_cells_stay_null(self):
        by_id = {r["id"]: r for r in self.data["records"]}
        self.assertIsNone(by_id["PSI-99:2-4"]["thicknessMm"])
        self.assertIsNone(by_id["PSI-100:S1"]["thicknessMm"])
        self.assertIsNone(by_id["PSI-100:S1"]["oxygenPct"])
        self.assertIsNone(by_id["PSI-100:S2"]["thicknessMm"])

    def test_all_records_are_microgravity(self):
        self.assertTrue(all(r["gravity"] == "microgravity" for r in self.data["records"]))


if __name__ == "__main__":
    unittest.main()
