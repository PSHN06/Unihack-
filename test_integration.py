#!/usr/bin/env python3
"""
tests/test_integration.py
--------------------------
End-to-end integration tests for the UniHack 2026 pipeline.

Tests three layers independently:
  1. UOM Normalizer unit tests
  2. Taxonomy Engine classification tests
  3. FastAPI endpoint smoke tests (requires running server)

Run:
  # Unit + taxonomy tests only (no server needed):
  python tests/test_integration.py --unit

  # Full end-to-end (requires: uvicorn backend.app:app running on :8000):
  python tests/test_integration.py --e2e

  # Both:
  python tests/test_integration.py
"""

import sys
import json
import time
import unittest
import argparse
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

# ─────────────────────────────────────────────
# MOCK PAYLOADS
# ─────────────────────────────────────────────

BALL_VALVE_PAYLOAD = {
    "product_name": "Stainless Steel Full-Bore Ball Valve",
    "description":  "Industrial 316 SS ball valve for high-pressure steam and chemical service.",
    "Body Material":    "316 Stainless Steel",
    "Seat Material":    "PTFE",
    "Max Pressure":     "1000 PSI",
    "Max Temperature":  "200 °C",
    "Port Size":        "1/2 inch",
    "End Connection":   "Threaded NPT",
    "Bore Size":        "12.7 mm",
    "Cv Value":         "24.0",
    "Actuation":        "Manual lever",
    "Standards":        "ASME B16.34, CE, RoHS",
    "Weight":           "0.65 kg",
}

PRESSURE_TX_PAYLOAD = {
    "product_name": "Industrial Gauge Pressure Transmitter",
    "description":  "High-accuracy 4-20 mA pressure transmitter for process automation.",
    "Measuring Range": "0-100 bar",
    "Output Signal":   "4-20 mA HART",
    "Supply Voltage":  "24 VDC",
    "Process Connection": "1/2 NPT male",
    "Accuracy":        "±0.075%",
    "Housing":         "316L SS, IP67",
    "Ambient Temp":    "-40 to 85 °C",
    "Operating Temp":  "-40 to 125 °C",
    "Weight":          "0.45 kg",
}

CENTRIFUGAL_PUMP_PAYLOAD = {
    "product_name": "End-Suction Centrifugal Pump",
    "description":  "Back pull-out ANSI centrifugal pump for water and mild chemical service.",
    "Max Flow Rate":      "500 GPM",
    "Max Head":           "150 ft",
    "Motor Power":        "15 kW",
    "Speed":              "1750 RPM",
    "Impeller Material":  "316 SS",
    "Casing Material":    "Cast Iron",
    "Shaft Seal":         "Mechanical seal",
    "Flange Size":        "3 inch",
    "Max Pressure":       "150 PSI",
    "Ambient Temp":       "0 to 40 °C",
}


# ─────────────────────────────────────────────
# 1. UOM NORMALIZER TESTS
# ─────────────────────────────────────────────

class TestUOMNormalizer(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from uom_normalizer import parse, normalize_spec_dict
        cls.parse = staticmethod(parse)
        cls.normalize = staticmethod(normalize_spec_dict)

    # ── Pressure ──────────────────────────────────────────────────────────────

    def test_psi_to_pa(self):
        nv = self.parse("150 PSI")
        self.assertIsNotNone(nv)
        self.assertEqual(nv.dimension.value, "pressure")
        self.assertAlmostEqual(nv.si_value, 1_034_213.55, delta=1.0)
        self.assertEqual(nv.si_unit, "Pa")
        self.assertIsNotNone(nv.imperial_value)

    def test_bar_to_pa(self):
        nv = self.parse("10.3 bar")
        self.assertAlmostEqual(nv.si_value, 1_030_000.0, delta=100.0)

    def test_dual_label_present(self):
        nv = self.parse("100 PSI")
        self.assertIn("PSI", nv.dual_label)
        self.assertIn("Pa", nv.dual_label)

    # ── Temperature ────────────────────────────────────────────────────────────

    def test_celsius_to_kelvin(self):
        nv = self.parse("200 °C")
        self.assertAlmostEqual(nv.si_value, 473.15, delta=0.01)
        self.assertEqual(nv.si_unit, "K")

    def test_fahrenheit_to_kelvin(self):
        nv = self.parse("212 °F")
        self.assertAlmostEqual(nv.si_value, 373.15, delta=0.01)

    def test_negative_celsius(self):
        nv = self.parse("-40 °C")
        self.assertAlmostEqual(nv.si_value, 233.15, delta=0.01)

    def test_celsius_fahrenheit_equivalence(self):
        c = self.parse("-40 °C")
        f = self.parse("-40 °F")
        # -40°C == -40°F
        self.assertAlmostEqual(c.si_value, f.si_value, delta=0.01)

    # ── Dimensions ─────────────────────────────────────────────────────────────

    def test_fractional_half_inch(self):
        nv = self.parse('1/2"')
        self.assertIsNotNone(nv)
        self.assertAlmostEqual(nv.si_value, 0.0127, delta=0.0001)
        self.assertAlmostEqual(nv.imperial_value, 0.5, delta=0.001)

    def test_fractional_one_and_half_inch(self):
        nv = self.parse("1 1/2 inch")
        self.assertAlmostEqual(nv.imperial_value, 1.5, delta=0.001)

    def test_millimeter_to_meter(self):
        nv = self.parse("12.7 mm")
        self.assertAlmostEqual(nv.si_value, 0.0127, delta=0.00001)

    # ── Voltage ────────────────────────────────────────────────────────────────

    def test_vdc(self):
        nv = self.parse("24 VDC")
        self.assertIsNotNone(nv)
        self.assertEqual(nv.si_value, 24.0)

    # ── Flow Rate ──────────────────────────────────────────────────────────────

    def test_gpm_to_m3s(self):
        nv = self.parse("100 GPM")
        self.assertIsNotNone(nv)
        self.assertAlmostEqual(nv.si_value, 0.006309, delta=0.0001)

    def test_l_per_min(self):
        nv = self.parse("500 L/min")
        self.assertIsNotNone(nv)

    # ── Tolerance ──────────────────────────────────────────────────────────────

    def test_percent_tolerance(self):
        nv = self.parse("100 PSI ±5%")
        self.assertIsNotNone(nv.tolerance_plus)
        expected_tol = 100 * 6894.757 * 0.05
        self.assertAlmostEqual(nv.tolerance_plus, expected_tol, delta=10)

    def test_absolute_tolerance(self):
        nv = self.parse("10 bar ±0.2 bar")
        self.assertIsNotNone(nv.tolerance_plus)
        self.assertAlmostEqual(nv.tolerance_plus, 20_000.0, delta=100)

    # ── Batch normalizer ───────────────────────────────────────────────────────

    def test_batch_normalize(self):
        specs = {
            "Pressure":    "1000 PSI",
            "Temperature": "200 °C",
            "Bore":        "1/2 inch",
            "Voltage":     "24 VDC",
            "Flow":        "500 GPM",
        }
        result = self.normalize(specs)
        self.assertEqual(len(result), 5)
        for key in specs:
            self.assertIn(key, result)
            self.assertGreater(result[key].get("confidence", 0), 0.5)

    def test_non_numeric_returns_unknown(self):
        nv = self.parse("316 Stainless Steel")
        # Should either return None or an unknown-dimension result
        if nv:
            self.assertIn(nv.dimension.value, ("unknown",))

    def test_high_confidence_known_units(self):
        for raw in ["150 PSI", "10.3 bar", "24 VDC", "200 °C", "12.7 mm"]:
            nv = self.parse(raw)
            self.assertIsNotNone(nv, f"parse() returned None for: {raw}")
            self.assertGreaterEqual(nv.confidence, 0.95,
                f"Low confidence for: {raw} → {nv.confidence}")


# ─────────────────────────────────────────────
# 2. TAXONOMY ENGINE TESTS (deterministic path only)
# ─────────────────────────────────────────────

class TestTaxonomyEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from taxonomy_engine import classify
        cls.classify = staticmethod(classify)

    def _classify_no_llm(self, product_text, specs=None):
        """Force deterministic path by not providing API key."""
        return self.classify(product_text, specs or {}, api_key="DISABLED_FOR_TESTS")

    def test_ball_valve_unspsc(self):
        r = self._classify_no_llm("Stainless Steel Ball Valve 1/2 inch",
                                   {"Body Material": "316 SS", "Max Pressure": "1000 PSI"})
        self.assertIsNotNone(r.unspsc)
        self.assertIn("40151501", r.unspsc.commodity_code)

    def test_ball_valve_etim(self):
        r = self._classify_no_llm("Ball Valve")
        self.assertIsNotNone(r.etim)
        self.assertEqual(r.etim.class_code, "EC002714")

    def test_pressure_gauge(self):
        r = self._classify_no_llm("Bourdon Tube Pressure Gauge 0-160 bar")
        self.assertIsNotNone(r.unspsc)
        self.assertIn("41111508", r.unspsc.commodity_code)

    def test_centrifugal_pump(self):
        r = self._classify_no_llm("End-Suction Centrifugal Pump 15kW",
                                   {"Max Flow Rate": "500 GPM"})
        self.assertIsNotNone(r.unspsc)
        self.assertIn("40111104", r.unspsc.commodity_code)

    def test_unknown_product_low_confidence(self):
        r = self._classify_no_llm("XYZ-9001 Widget Assembly")
        # Should return low or zero confidence from deterministic path
        self.assertLessEqual(r.overall_confidence, 0.70)

    def test_etim_features_present(self):
        r = self._classify_no_llm("Ball Valve 1 inch NPT")
        if r.etim:
            self.assertGreater(len(r.etim.features), 0)

    def test_resolution_path_deterministic(self):
        r = self._classify_no_llm("Ball Valve")
        self.assertEqual(r.resolution_path, "deterministic")


# ─────────────────────────────────────────────
# 3. FASTAPI SMOKE TESTS (requires running server)
# ─────────────────────────────────────────────

class TestFastAPIEndpoints(unittest.TestCase):
    BASE = "http://localhost:8000"

    @classmethod
    def setUpClass(cls):
        try:
            import httpx
            cls.client = httpx.Client(base_url=cls.BASE, timeout=60.0)
            # Quick health check
            r = cls.client.get("/health")
            if r.status_code != 200:
                raise RuntimeError("Server not healthy")
        except Exception as e:
            raise unittest.SkipTest(f"Server not reachable at {cls.BASE}: {e}")

    def test_health_endpoint(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertIn("status", r.json())

    def test_process_json_ball_valve(self):
        payload = {
            "product_name": BALL_VALVE_PAYLOAD["product_name"],
            "description":  BALL_VALVE_PAYLOAD["description"],
            "specs": {k: v for k, v in BALL_VALVE_PAYLOAD.items()
                      if k not in ("product_name", "description")},
        }
        r = self.client.post("/api/pipeline/process", json=payload)
        self.assertEqual(r.status_code, 202)
        data = r.json()
        self.assertIn("job_id", data)
        self.assertIn("stream_url", data)
        return data["job_id"]

    def test_full_pipeline_e2e_ball_valve(self):
        """Submit job, stream events, fetch final result."""
        import httpx

        payload = {
            "product_name": BALL_VALVE_PAYLOAD["product_name"],
            "description":  BALL_VALVE_PAYLOAD["description"],
            "specs": {k: v for k, v in BALL_VALVE_PAYLOAD.items()
                      if k not in ("product_name", "description")},
        }
        r = self.client.post("/api/pipeline/process", json=payload)
        self.assertEqual(r.status_code, 202)
        job_id = r.json()["job_id"]

        # Poll for completion (max 60s)
        result = None
        for _ in range(60):
            time.sleep(1)
            res = self.client.get(f"/api/pipeline/results/{job_id}")
            if res.status_code == 200:
                result = res.json()
                break
            # 202 means still processing – keep waiting

        self.assertIsNotNone(result, "Pipeline did not complete within 60s")

        # Validate PIM structure
        self.assertIn("product",       result)
        self.assertIn("classification",result)
        self.assertIn("specifications",result)
        self.assertIn("compliance",    result)
        self.assertIn("quality",       result)

        # UNSPSC should be present for a ball valve
        unspsc = result["classification"]["unspsc"]
        self.assertIsNotNone(unspsc)
        self.assertNotEqual(unspsc.get("commodity_code", ""), "")

        # At least one spec should be normalized
        norm = result["specifications"]["normalized"]
        self.assertGreater(len(norm), 0)

        print(f"\n✅ E2E test passed for job {job_id}")
        print(f"   UNSPSC: {unspsc.get('commodity_code')} – {unspsc.get('commodity_name')}")
        print(f"   ETIM:   {result['classification']['etim'].get('class_code')}")
        print(f"   Confidence: {result['quality']['overall_confidence']:.0%}")

    def test_jobs_list(self):
        r = self.client.get("/api/pipeline/jobs")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_404_on_unknown_job(self):
        r = self.client.get("/api/pipeline/results/nonexistent-job-id")
        self.assertEqual(r.status_code, 404)

    def test_process_pressure_transmitter(self):
        payload = {
            "product_name": PRESSURE_TX_PAYLOAD["product_name"],
            "description":  PRESSURE_TX_PAYLOAD["description"],
            "specs": {k: v for k, v in PRESSURE_TX_PAYLOAD.items()
                      if k not in ("product_name", "description")},
        }
        r = self.client.post("/api/pipeline/process", json=payload)
        self.assertEqual(r.status_code, 202)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()


# ─────────────────────────────────────────────
# RUNNER
# ─────────────────────────────────────────────

def run_suite(test_classes, verbosity=2):
    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    for cls in test_classes:
        suite.addTests(loader.loadTestsFromTestCase(cls))
    runner = unittest.TextTestRunner(verbosity=verbosity)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--unit", action="store_true", help="Run unit tests only")
    parser.add_argument("--e2e",  action="store_true", help="Run e2e API tests only")
    args = parser.parse_args()

    success = True
    if args.e2e:
        success = run_suite([TestFastAPIEndpoints])
    elif args.unit:
        success = run_suite([TestUOMNormalizer, TestTaxonomyEngine])
    else:
        success = run_suite([TestUOMNormalizer, TestTaxonomyEngine, TestFastAPIEndpoints])

    sys.exit(0 if success else 1)
