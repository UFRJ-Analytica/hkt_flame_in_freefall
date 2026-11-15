"""Checks of the B1 spatial registration rules (synthetic points) and of the versioned verdict."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from calibrate_b1 import DOCUMENTED, REGISTRATION, fit_axis, to_mm  # noqa: E402


def point(x_px, x_mm, sigma_mm=0.0, sigma_px=0.0):
    return {'px': {'x': x_px}, 'mm': {'x': x_mm}, 'sigma_mm': sigma_mm, 'sigma_px': sigma_px}


class Transform(unittest.TestCase):
    def test_exact_points_give_scale_origin_and_zero_residual(self):
        fit = fit_axis([point(100, 0.0), point(300, 50.0), point(500, 100.0)], 'x')
        self.assertAlmostEqual(fit['scale_mm_per_px'], 0.25)
        self.assertAlmostEqual(fit['origin_px'], 100.0)
        self.assertLess(fit['residualRms_mm'], 1e-9)
        validated = {'status': 'validated', 'transformation': {'axes': {'x': fit}}}
        self.assertAlmostEqual(to_mm(validated, 220)[0], 30.0)

    def test_residuals_report_inconsistent_references(self):
        fit = fit_axis([point(0, 0.0), point(100, 10.0), point(200, 21.0)], 'x')
        self.assertGreater(fit['residualRms_mm'], 0.1)
        self.assertEqual(len(fit['residuals_mm']), 3)

    def test_uncertainty_is_kept_and_grows_with_edge_picking_error(self):
        sharp = fit_axis([point(100, 0.0, 0.1, 0.5), point(500, 95.0, 0.1, 0.5)], 'x')
        blurred = fit_axis([point(100, 0.0, 0.1, 3.0), point(500, 95.0, 0.1, 3.0)], 'x')
        self.assertGreater(sharp['scaleUncertainty_mm_per_px'], 0)
        self.assertGreater(blurred['scaleUncertainty_mm_per_px'], sharp['scaleUncertainty_mm_per_px'])
        # ~95 mm over 400 px with 3 px picking error on both ends: about 1 % relative.
        self.assertAlmostEqual(blurred['relativeUncertainty'], (2 * 9 / 400 ** 2 + 2 * 0.01 / 95 ** 2) ** 0.5, places=4)

    def test_a_single_or_degenerate_reference_is_refused(self):
        with self.assertRaises(ValueError):
            fit_axis([point(100, 0.0)], 'x')
        with self.assertRaises(ValueError):
            fit_axis([point(100, 0.0), point(100, 20.0)], 'x')
        with self.assertRaises(ValueError):
            fit_axis([point(100, 0.0), {'px': {'y': 5}, 'mm': {'y': 1}}], 'x')

    def test_conversion_is_refused_without_a_validated_registration(self):
        for status in ('insufficient', 'candidate', None):
            with self.assertRaises(ValueError):
                to_mm({'status': status, 'transformation': None}, 200, 100)


class Verdict(unittest.TestCase):
    @unittest.skipUnless(REGISTRATION.exists(), 'registration.json ainda não gerado')
    def test_insufficient_registration_carries_no_invented_scale(self):
        registration = json.loads(REGISTRATION.read_text(encoding='utf-8'))
        self.assertEqual(registration['status'], 'insufficient')
        for key in ('transformation', 'scale_mm_per_px', 'origin_px', 'residuals_mm', 'uncertainty'):
            self.assertIsNone(registration[key], key)
        self.assertEqual(registration['referencePoints'], [])
        self.assertFalse(registration['pixelObservationsWithoutScale']['litStructures']['usableAsReference'])
        with self.assertRaises(ValueError):
            to_mm(registration, 100, 100)

    def test_documented_dimensions_cite_their_sources(self):
        self.assertTrue(all(item['sources'] for item in DOCUMENTED))
        width = next(item for item in DOCUMENTED if item['quantity'] == 'largura da amostra')
        thickness = next(item for item in DOCUMENTED if item['quantity'] == 'espessura da amostra')
        self.assertEqual((width['value_mm'], thickness['value_mm']), (20.0, 0.1))
        self.assertFalse(width['visibleInSideView'])


if __name__ == '__main__':
    unittest.main()
