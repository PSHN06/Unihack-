"""
taxonomy_engine.py
------------------
Hybrid deterministic + LLM taxonomy resolver for industrial product classification.

Outputs:
  - UNSPSC segment → family → class → commodity (8-digit code)
  - ETIM class code (EC######)
  - ETIM feature codes (EF######) and permitted values
  - Classification confidence score per level
  - Recommended ETIM feature extraction targets from spec dict

Strategy:
  1. FAST PATH  – keyword-tree lookup (deterministic, zero latency)
  2. SLOW PATH  – Gemini gemini-2.5-pro via Gemini API (when fast-path confidence < 0.75)
  3. MERGE      – reconcile both sources; prefer LLM if it scores higher

UNSPSC reference: unspsc.org v25 (subset covering industrial MRO)
ETIM reference:   ETIM 9.0 model (subset for fluid control, electro-mechanical)
"""

from __future__ import annotations

import os
import json
import re
import time
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Optional
import google.generativeai as genai

# ─────────────────────────────────────────────
# 1. DATA STRUCTURES
# ─────────────────────────────────────────────

@dataclass
class UNSPSCCode:
    segment_code:   str   # 2-digit
    segment_name:   str
    family_code:    str   # 4-digit
    family_name:    str
    class_code:     str   # 6-digit
    class_name:     str
    commodity_code: str   # 8-digit
    commodity_name: str
    confidence:     float = 0.0

    @property
    def full_code(self) -> str:
        return self.commodity_code.zfill(8)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ETIMFeature:
    code:        str        # EF######
    name:        str
    data_type:   str        # "Numeric", "Logical", "Range", "AlphaNumeric"
    unit:        str = ""
    value:       Optional[str] = None   # extracted from spec, if available
    confidence:  float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ETIMClass:
    class_code:  str        # EC######
    class_name:  str
    version:     str = "9.0"
    features:    list[ETIMFeature] = field(default_factory=list)
    confidence:  float = 0.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d["features"] = [f.to_dict() for f in self.features]
        return d


@dataclass
class TaxonomyResult:
    unspsc:         Optional[UNSPSCCode] = None
    etim:           Optional[ETIMClass]  = None
    overall_confidence: float = 0.0
    resolution_path:    str   = "none"  # "deterministic" | "llm" | "hybrid"
    raw_llm_response:   Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "unspsc": self.unspsc.to_dict() if self.unspsc else None,
            "etim":   self.etim.to_dict()   if self.etim   else None,
            "overall_confidence": self.overall_confidence,
            "resolution_path":    self.resolution_path,
        }


# ─────────────────────────────────────────────
# 2. DETERMINISTIC KEYWORD TREE
# ─────────────────────────────────────────────
# Format: {keyword: (UNSPSC commodity tuple, ETIM class code, ETIM class name)}
# UNSPSC tuple: (seg, seg_name, fam, fam_name, cls, cls_name, com, com_name)

_KEYWORD_TREE: list[tuple[list[str], tuple, str, str, list[ETIMFeature]]] = [
    # ── Ball Valves ────────────────────────────────────────────────────────────
    (
        ["ball valve", "ballvalve", "ball-valve"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4015", "Flow control",
         "401515", "Valves",
         "40151501", "Ball valves"),
        "EC002714", "Ball valve",
        [
            ETIMFeature("EF001595", "Connection type (inlet)",      "AlphaNumeric"),
            ETIMFeature("EF001596", "Connection type (outlet)",     "AlphaNumeric"),
            ETIMFeature("EF002157", "Nominal diameter",             "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. operating pressure",      "Numeric", "bar"),
            ETIMFeature("EF000041", "Max. operating temperature",   "Numeric", "°C"),
            ETIMFeature("EF017445", "Body material",                "AlphaNumeric"),
            ETIMFeature("EF017446", "Seal/seat material",           "AlphaNumeric"),
            ETIMFeature("EF002060", "Actuation type",               "AlphaNumeric"),
            ETIMFeature("EF001598", "Number of ports",              "Numeric"),
        ]
    ),
    # ── Gate Valves ────────────────────────────────────────────────────────────
    (
        ["gate valve", "gatevalve", "gate-valve", "sluice valve"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4015", "Flow control",
         "401515", "Valves",
         "40151502", "Gate valves"),
        "EC002716", "Gate valve",
        [
            ETIMFeature("EF002157", "Nominal diameter",           "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. operating pressure",    "Numeric", "bar"),
            ETIMFeature("EF000041", "Max. operating temperature", "Numeric", "°C"),
            ETIMFeature("EF017445", "Body material",              "AlphaNumeric"),
        ]
    ),
    # ── Check Valves ───────────────────────────────────────────────────────────
    (
        ["check valve", "non-return", "non return", "backflow"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4015", "Flow control",
         "401515", "Valves",
         "40151504", "Check valves"),
        "EC002718", "Check valve",
        [
            ETIMFeature("EF002157", "Nominal diameter",        "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. operating pressure", "Numeric", "bar"),
            ETIMFeature("EF017445", "Body material",           "AlphaNumeric"),
        ]
    ),
    # ── Butterfly Valves ───────────────────────────────────────────────────────
    (
        ["butterfly valve", "butterflyvalve"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4015", "Flow control",
         "401515", "Valves",
         "40151505", "Butterfly valves"),
        "EC002717", "Butterfly valve",
        [
            ETIMFeature("EF002157", "Nominal diameter",        "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. operating pressure", "Numeric", "bar"),
            ETIMFeature("EF000041", "Max. temp",               "Numeric", "°C"),
            ETIMFeature("EF017445", "Body material",           "AlphaNumeric"),
            ETIMFeature("EF002060", "Actuation type",          "AlphaNumeric"),
        ]
    ),
    # ── Pressure Gauges ────────────────────────────────────────────────────────
    (
        ["pressure gauge", "manometer", "piezometer"],
        ("41", "Laboratory and Measuring and Observing and Testing Equipment",
         "4111", "Measuring instruments",
         "411115", "Pressure instruments",
         "41111508", "Pressure gauges"),
        "EC001437", "Pressure gauge",
        [
            ETIMFeature("EF000040", "Measuring range (max)", "Numeric", "bar"),
            ETIMFeature("EF002158", "Dial diameter",         "Numeric", "mm"),
            ETIMFeature("EF001595", "Connection type",       "AlphaNumeric"),
            ETIMFeature("EF002060", "Display type",          "AlphaNumeric"),
        ]
    ),
    # ── Pressure Transmitters ──────────────────────────────────────────────────
    (
        ["pressure transmitter", "pressure sensor", "pressure transducer"],
        ("41", "Laboratory and Measuring and Observing and Testing Equipment",
         "4111", "Measuring instruments",
         "411115", "Pressure instruments",
         "41111514", "Pressure transmitters"),
        "EC001438", "Pressure transmitter",
        [
            ETIMFeature("EF000040", "Measuring range (max)", "Numeric", "bar"),
            ETIMFeature("EF001030", "Output signal",         "AlphaNumeric"),
            ETIMFeature("EF000030", "Supply voltage",        "Numeric", "V"),
            ETIMFeature("EF001595", "Process connection",    "AlphaNumeric"),
        ]
    ),
    # ── Centrifugal Pumps ──────────────────────────────────────────────────────
    (
        ["centrifugal pump", "impeller pump", "circulator pump"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4011", "Pumping",
         "401111", "Pumps",
         "40111104", "Centrifugal pumps"),
        "EC001430", "Centrifugal pump",
        [
            ETIMFeature("EF000087", "Max. flow rate",          "Numeric", "m³/h"),
            ETIMFeature("EF000040", "Max. discharge pressure",  "Numeric", "bar"),
            ETIMFeature("EF000039", "Rated power",             "Numeric", "kW"),
            ETIMFeature("EF002060", "Installation type",        "AlphaNumeric"),
            ETIMFeature("EF017445", "Pump casing material",    "AlphaNumeric"),
        ]
    ),
    # ── Electric Motors ────────────────────────────────────────────────────────
    (
        ["electric motor", "induction motor", "servo motor", "stepper motor"],
        ("26", "Electrical Systems and Lighting and Components",
         "2611", "Electric motors",
         "261116", "AC and DC motors",
         "26111601", "AC induction motors"),
        "EC001431", "AC motor",
        [
            ETIMFeature("EF000039", "Rated power",           "Numeric", "kW"),
            ETIMFeature("EF001500", "Rated voltage",         "Numeric", "V"),
            ETIMFeature("EF001503", "Rated frequency",       "Numeric", "Hz"),
            ETIMFeature("EF001504", "Rated speed",           "Numeric", "RPM"),
            ETIMFeature("EF001506", "Frame size",            "AlphaNumeric"),
            ETIMFeature("EF001507", "Protection class (IP)", "AlphaNumeric"),
            ETIMFeature("EF001508", "Insulation class",      "AlphaNumeric"),
        ]
    ),
    # ── Flow Meters ────────────────────────────────────────────────────────────
    (
        ["flow meter", "flowmeter", "flow sensor", "electromagnetic flow",
         "ultrasonic flow", "turbine flow", "vortex flow"],
        ("41", "Laboratory and Measuring and Observing and Testing Equipment",
         "4111", "Measuring instruments",
         "411114", "Flow instruments",
         "41111401", "Flow meters"),
        "EC002580", "Flow meter",
        [
            ETIMFeature("EF000087", "Measuring range (max)", "Numeric", "m³/h"),
            ETIMFeature("EF002157", "Nominal diameter",      "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. pressure",         "Numeric", "bar"),
            ETIMFeature("EF001030", "Output signal",         "AlphaNumeric"),
        ]
    ),
    # ── Pipe Fittings ──────────────────────────────────────────────────────────
    (
        ["elbow", "tee", "pipe fitting", "reducer", "coupling", "union fitting",
         "nipple", "flange fitting"],
        ("40", "Distribution and Conditioning Systems and Instruments",
         "4003", "Pipe piping and pipe fittings",
         "400317", "Fittings",
         "40031701", "Pipe fittings"),
        "EC001462", "Pipe fitting",
        [
            ETIMFeature("EF002157", "Nominal diameter",  "Numeric", "mm"),
            ETIMFeature("EF000040", "Max. pressure",     "Numeric", "bar"),
            ETIMFeature("EF017445", "Material",          "AlphaNumeric"),
            ETIMFeature("EF001595", "Connection type",   "AlphaNumeric"),
        ]
    ),
    # ── Bearings ───────────────────────────────────────────────────────────────
    (
        ["bearing", "ball bearing", "roller bearing", "thrust bearing"],
        ("31", "Manufacturing Components and Supplies",
         "3120", "Bearings and bushings and wheels and gears",
         "312000", "Bearings",
         "31200000", "Bearings"),
        "EC001080", "Rolling bearing",
        [
            ETIMFeature("EF002157", "Bore diameter",     "Numeric", "mm"),
            ETIMFeature("EF001598", "Outer diameter",    "Numeric", "mm"),
            ETIMFeature("EF001599", "Width",             "Numeric", "mm"),
            ETIMFeature("EF001507", "Bearing type",      "AlphaNumeric"),
            ETIMFeature("EF017445", "Material",          "AlphaNumeric"),
        ]
    ),
]


def _keyword_score(text_lower: str, keywords: list[str]) -> float:
    """Return a simple score based on keyword presence."""
    for kw in keywords:
        if kw in text_lower:
            return 0.92 if len(kw.split()) > 1 else 0.78
    return 0.0


# ─────────────────────────────────────────────
# 3. FAST-PATH DETERMINISTIC RESOLVER
# ─────────────────────────────────────────────

def _resolve_deterministic(
    product_text: str,
    spec_dict:    dict[str, str],
) -> Optional[TaxonomyResult]:
    """Keyword-tree lookup. Returns result only if confidence ≥ 0.70."""
    combined = (product_text + " " + " ".join(spec_dict.values())).lower()

    best_score = 0.0
    best_entry = None

    for entry in _KEYWORD_TREE:
        keywords, unspsc_tuple, etim_code, etim_name, features = entry
        score = _keyword_score(combined, keywords)
        if score > best_score:
            best_score = score
            best_entry = (unspsc_tuple, etim_code, etim_name, features)

    if best_score < 0.70 or best_entry is None:
        return None

    unspsc_tuple, etim_code, etim_name, features = best_entry

    unspsc = UNSPSCCode(
        segment_code=unspsc_tuple[0],  segment_name=unspsc_tuple[1],
        family_code=unspsc_tuple[2],   family_name=unspsc_tuple[3],
        class_code=unspsc_tuple[4],    class_name=unspsc_tuple[5],
        commodity_code=unspsc_tuple[6],commodity_name=unspsc_tuple[7],
        confidence=round(best_score, 3),
    )
    etim = ETIMClass(
        class_code=etim_code,
        class_name=etim_name,
        features=features,
        confidence=round(best_score, 3),
    )
    return TaxonomyResult(
        unspsc=unspsc,
        etim=etim,
        overall_confidence=round(best_score, 3),
        resolution_path="deterministic",
    )


# ─────────────────────────────────────────────
# 4. LLM RESOLVER (Gemini gemini-2.5-pro)
# ─────────────────────────────────────────────

_LLM_SYSTEM = """You are an expert industrial taxonomy classifier.
Given a product description and its technical specifications, output a JSON object
with the following schema – nothing else, no prose:

{
  "unspsc": {
    "segment_code":    "<2-digit>",
    "segment_name":    "<name>",
    "family_code":     "<4-digit>",
    "family_name":     "<name>",
    "class_code":      "<6-digit>",
    "class_name":      "<name>",
    "commodity_code":  "<8-digit>",
    "commodity_name":  "<name>",
    "confidence":      <0.0–1.0>
  },
  "etim": {
    "class_code":  "<EC######>",
    "class_name":  "<name>",
    "version":     "9.0",
    "confidence":  <0.0–1.0>,
    "features": [
      { "code": "<EF######>", "name": "<name>", "data_type": "<Numeric|Logical|Range|AlphaNumeric>", "unit": "<unit or empty>", "value": "<extracted value or null>" }
    ]
  },
  "overall_confidence": <0.0–1.0>,
  "reasoning": "<one sentence>"
}

Use UNSPSC v25 and ETIM 9.0 codes only. If uncertain, lower the confidence score.
Extract feature values from the provided spec dict wherever possible."""


def _resolve_llm(
    product_text: str,
    spec_dict:    dict[str, str],
    api_key:      Optional[str] = None,
) -> Optional[TaxonomyResult]:
    """Call Gemini gemini-2.5-pro for taxonomy resolution."""
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return None

    genai.configure(api_key=key)

    user_msg = (
        f"Product description: {product_text}\n\n"
        f"Technical specifications:\n{json.dumps(spec_dict, indent=2)}"
    )

    try:
        model = genai.GenerativeModel("gemini-2.5-pro", system_instruction=_LLM_SYSTEM)
        response = model.generate_content(user_msg)
        raw = response.text.strip()

        # Strip potential markdown fences
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        data = json.loads(raw)

        u = data.get("unspsc", {})
        unspsc = UNSPSCCode(
            segment_code=u.get("segment_code", ""),
            segment_name=u.get("segment_name", ""),
            family_code=u.get("family_code", ""),
            family_name=u.get("family_name", ""),
            class_code=u.get("class_code", ""),
            class_name=u.get("class_name", ""),
            commodity_code=u.get("commodity_code", ""),
            commodity_name=u.get("commodity_name", ""),
            confidence=float(u.get("confidence", 0.0)),
        )

        e = data.get("etim", {})
        features = [
            ETIMFeature(
                code=f.get("code", ""),
                name=f.get("name", ""),
                data_type=f.get("data_type", "AlphaNumeric"),
                unit=f.get("unit", ""),
                value=f.get("value"),
                confidence=float(data.get("overall_confidence", 0.0)),
            )
            for f in e.get("features", [])
        ]
        etim = ETIMClass(
            class_code=e.get("class_code", ""),
            class_name=e.get("class_name", ""),
            version=e.get("version", "9.0"),
            features=features,
            confidence=float(e.get("confidence", 0.0)),
        )

        return TaxonomyResult(
            unspsc=unspsc,
            etim=etim,
            overall_confidence=float(data.get("overall_confidence", 0.0)),
            resolution_path="llm",
            raw_llm_response=raw,
        )
    except Exception as exc:
        print(f"[taxonomy_engine] LLM call failed: {exc}")
        return None


# ─────────────────────────────────────────────
# 5. MERGE / RECONCILE
# ─────────────────────────────────────────────

def _merge(det: TaxonomyResult, llm: TaxonomyResult) -> TaxonomyResult:
    """
    Hybrid merge: pick highest-confidence source per field.
    Augment ETIM feature values from LLM into deterministic feature list.
    """
    if llm.overall_confidence > det.overall_confidence:
        winner = llm
    else:
        winner = det

    # Augment feature values from LLM into deterministic skeleton
    if det.etim and llm.etim:
        llm_feat_map = {f.code: f.value for f in llm.etim.features if f.value}
        for feat in det.etim.features:
            if feat.code in llm_feat_map and not feat.value:
                feat.value = llm_feat_map[feat.code]
        winner.etim = det.etim  # prefer deterministic skeleton + LLM values

    winner.resolution_path = "hybrid"
    winner.overall_confidence = max(det.overall_confidence, llm.overall_confidence)
    return winner


# ─────────────────────────────────────────────
# 6. PUBLIC API
# ─────────────────────────────────────────────

def classify(
    product_text: str,
    spec_dict:    dict[str, str] | None = None,
    api_key:      Optional[str]   = None,
    force_llm:    bool            = False,
) -> TaxonomyResult:
    """
    Main entry point.

    Args:
        product_text: Free-text product name / short description.
        spec_dict:    Dict of raw attribute → value strings.
        api_key:      Gemini API key (falls back to GEMINI_API_KEY env).
        force_llm:    Skip fast-path and go straight to LLM.

    Returns:
        TaxonomyResult with UNSPSC + ETIM classification and confidence scores.
    """
    spec_dict = spec_dict or {}

    det_result = None if force_llm else _resolve_deterministic(product_text, spec_dict)

    # If deterministic is confident enough, skip expensive LLM call
    if det_result and det_result.overall_confidence >= 0.88 and not force_llm:
        return det_result

    llm_result = _resolve_llm(product_text, spec_dict, api_key)

    if det_result and llm_result:
        return _merge(det_result, llm_result)
    if llm_result:
        return llm_result
    if det_result:
        return det_result

    # Total failure fallback
    return TaxonomyResult(
        overall_confidence=0.0,
        resolution_path="none",
    )


# ─────────────────────────────────────────────
# 7. CLI DEMO
# ─────────────────────────────────────────────

if __name__ == "__main__":
    product = "Stainless Steel Full-Bore Ball Valve 1/2 inch"
    specs = {
        "Body Material": "316 Stainless Steel",
        "Seat Material": "PTFE",
        "Max Pressure":  "1000 PSI",
        "Max Temp":      "200 °C",
        "Port Size":     "1/2 inch",
        "End Connection":"Threaded NPT",
        "Actuation":     "Manual lever",
    }

    result = classify(product, specs)
    print(json.dumps(result.to_dict(), indent=2))
