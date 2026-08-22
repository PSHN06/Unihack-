"""
uom_normalizer.py
-----------------
Deterministic Unit-of-Measure normalization engine for industrial product specs.
Handles: Pressure, Temperature, Dimensions (length/bore), Voltage, Flow Rate,
         Weight, Torque, and Tolerance parsing.

Returns every value in both SI canonical form AND a human-preferred dual-unit
representation (e.g. "10.3 bar / 150 PSI").
"""

from __future__ import annotations

import re
import math
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional

# ─────────────────────────────────────────────
# 1. DATA STRUCTURES
# ─────────────────────────────────────────────

class Dimension(str, Enum):
    PRESSURE    = "pressure"
    TEMPERATURE = "temperature"
    LENGTH      = "length"
    VOLTAGE     = "voltage"
    FLOW_RATE   = "flow_rate"
    WEIGHT      = "weight"
    TORQUE      = "torque"
    FREQUENCY   = "frequency"
    CURRENT     = "current"
    POWER       = "power"
    UNKNOWN     = "unknown"


@dataclass
class NormalizedValue:
    raw_text:       str
    dimension:      Dimension
    si_value:       float                   # canonical SI numeric value
    si_unit:        str                     # SI unit symbol
    imperial_value: Optional[float] = None
    imperial_unit:  Optional[str]   = None
    tolerance_plus: Optional[float] = None  # ±/+ tolerance in SI
    tolerance_minus:Optional[float] = None
    confidence:     float = 1.0             # 0–1 parse confidence
    dual_label:     str = ""                # human-readable "X SI / Y Imp"

    def __post_init__(self):
        if not self.dual_label:
            self.dual_label = self._build_dual_label()

    def _build_dual_label(self) -> str:
        si_part = f"{_fmt(self.si_value)} {self.si_unit}"
        if self.tolerance_plus is not None:
            si_part += f" ±{_fmt(self.tolerance_plus)} {self.si_unit}"
        if self.imperial_value is not None:
            imp_part = f"{_fmt(self.imperial_value)} {self.imperial_unit}"
            return f"{si_part} / {imp_part}"
        return si_part

    def to_dict(self) -> dict:
        d = asdict(self)
        d["dimension"] = self.dimension.value
        return d


def _fmt(v: float) -> str:
    """Format a float with minimal trailing zeros."""
    if v == int(v):
        return str(int(v))
    return f"{v:.4g}"


# ─────────────────────────────────────────────
# 2. CONVERSION TABLES
# ─────────────────────────────────────────────

# All conversions TO SI (multiply raw value by factor)
_TO_SI: dict[str, tuple[Dimension, float, str]] = {
    # ── Pressure → Pascal (Pa) ──────────────────────────────
    "pa":   (Dimension.PRESSURE, 1.0,          "Pa"),
    "kpa":  (Dimension.PRESSURE, 1_000.0,      "Pa"),
    "mpa":  (Dimension.PRESSURE, 1_000_000.0,  "Pa"),
    "bar":  (Dimension.PRESSURE, 100_000.0,    "Pa"),
    "mbar": (Dimension.PRESSURE, 100.0,        "Pa"),
    "psi":  (Dimension.PRESSURE, 6_894.757,    "Pa"),
    "atm":  (Dimension.PRESSURE, 101_325.0,    "Pa"),
    "torr": (Dimension.PRESSURE, 133.322,      "Pa"),
    "mmhg": (Dimension.PRESSURE, 133.322,      "Pa"),
    "inchh2o": (Dimension.PRESSURE, 249.089,   "Pa"),
    "inh2o":   (Dimension.PRESSURE, 249.089,   "Pa"),

    # ── Temperature → Kelvin (K) ────────────────────────────
    # handled specially (offset conversions) – entries here just flag unit
    "k":   (Dimension.TEMPERATURE, 1.0,   "K"),
    "°c":  (Dimension.TEMPERATURE, 1.0,   "K"),   # offset applied in code
    "°f":  (Dimension.TEMPERATURE, 1.0,   "K"),   # offset applied in code
    "c":   (Dimension.TEMPERATURE, 1.0,   "K"),
    "f":   (Dimension.TEMPERATURE, 1.0,   "K"),
    "celsius":    (Dimension.TEMPERATURE, 1.0, "K"),
    "fahrenheit": (Dimension.TEMPERATURE, 1.0, "K"),

    # ── Length/Dimension → meter (m) ────────────────────────
    "m":   (Dimension.LENGTH, 1.0,          "m"),
    "cm":  (Dimension.LENGTH, 0.01,         "m"),
    "mm":  (Dimension.LENGTH, 0.001,        "m"),
    "µm":  (Dimension.LENGTH, 1e-6,         "m"),
    "um":  (Dimension.LENGTH, 1e-6,         "m"),
    "nm":  (Dimension.LENGTH, 1e-9,         "m"),
    "km":  (Dimension.LENGTH, 1000.0,       "m"),
    "in":  (Dimension.LENGTH, 0.0254,       "m"),
    '"':   (Dimension.LENGTH, 0.0254,       "m"),
    "inch":(Dimension.LENGTH, 0.0254,       "m"),
    "inches":(Dimension.LENGTH, 0.0254,     "m"),
    "ft":  (Dimension.LENGTH, 0.3048,       "m"),
    "feet":(Dimension.LENGTH, 0.3048,       "m"),
    "'":   (Dimension.LENGTH, 0.3048,       "m"),
    "yd":  (Dimension.LENGTH, 0.9144,       "m"),
    "mi":  (Dimension.LENGTH, 1609.344,     "m"),

    # ── Voltage → Volt (V) ──────────────────────────────────
    "v":   (Dimension.VOLTAGE, 1.0,         "V"),
    "kv":  (Dimension.VOLTAGE, 1000.0,      "V"),
    "mv":  (Dimension.VOLTAGE, 0.001,       "V"),
    "vac": (Dimension.VOLTAGE, 1.0,         "V"),
    "vdc": (Dimension.VOLTAGE, 1.0,         "V"),

    # ── Flow Rate → m³/s ────────────────────────────────────
    "m3/s":    (Dimension.FLOW_RATE, 1.0,            "m³/s"),
    "m³/s":    (Dimension.FLOW_RATE, 1.0,            "m³/s"),
    "l/s":     (Dimension.FLOW_RATE, 0.001,          "m³/s"),
    "l/min":   (Dimension.FLOW_RATE, 1/60_000,       "m³/s"),
    "l/h":     (Dimension.FLOW_RATE, 1/3_600_000,    "m³/s"),
    "m3/h":    (Dimension.FLOW_RATE, 1/3600,         "m³/s"),
    "m³/h":    (Dimension.FLOW_RATE, 1/3600,         "m³/s"),
    "gpm":     (Dimension.FLOW_RATE, 6.30902e-5,     "m³/s"),
    "gph":     (Dimension.FLOW_RATE, 1.05150e-6,     "m³/s"),
    "cfm":     (Dimension.FLOW_RATE, 4.71947e-4,     "m³/s"),
    "cfs":     (Dimension.FLOW_RATE, 0.028317,       "m³/s"),
    "scfm":    (Dimension.FLOW_RATE, 4.71947e-4,     "m³/s"),

    # ── Weight/Mass → kg ────────────────────────────────────
    "kg":  (Dimension.WEIGHT, 1.0,          "kg"),
    "g":   (Dimension.WEIGHT, 0.001,        "kg"),
    "mg":  (Dimension.WEIGHT, 1e-6,         "kg"),
    "t":   (Dimension.WEIGHT, 1000.0,       "kg"),
    "lb":  (Dimension.WEIGHT, 0.453592,     "kg"),
    "lbs": (Dimension.WEIGHT, 0.453592,     "kg"),
    "oz":  (Dimension.WEIGHT, 0.0283495,    "kg"),
    "ton": (Dimension.WEIGHT, 907.185,      "kg"),   # US short ton

    # ── Torque → N·m ────────────────────────────────────────
    "nm":     (Dimension.TORQUE, 1.0,       "N·m"),
    "n·m":    (Dimension.TORQUE, 1.0,       "N·m"),
    "knm":    (Dimension.TORQUE, 1000.0,    "N·m"),
    "lbft":   (Dimension.TORQUE, 1.35582,   "N·m"),
    "lb-ft":  (Dimension.TORQUE, 1.35582,   "N·m"),
    "lb·ft":  (Dimension.TORQUE, 1.35582,   "N·m"),
    "ft-lb":  (Dimension.TORQUE, 1.35582,   "N·m"),
    "ft·lb":  (Dimension.TORQUE, 1.35582,   "N·m"),
    "lbin":   (Dimension.TORQUE, 0.112985,  "N·m"),
    "lb-in":  (Dimension.TORQUE, 0.112985,  "N·m"),
    "in-lb":  (Dimension.TORQUE, 0.112985,  "N·m"),
    "ozin":   (Dimension.TORQUE, 0.00706155,"N·m"),

    # ── Frequency → Hz ──────────────────────────────────────
    "hz":  (Dimension.FREQUENCY, 1.0,       "Hz"),
    "khz": (Dimension.FREQUENCY, 1000.0,    "Hz"),
    "mhz": (Dimension.FREQUENCY, 1e6,       "Hz"),
    "ghz": (Dimension.FREQUENCY, 1e9,       "Hz"),
    "rpm": (Dimension.FREQUENCY, 1/60,      "Hz"),

    # ── Current → Ampere ────────────────────────────────────
    "a":   (Dimension.CURRENT, 1.0,         "A"),
    "ma":  (Dimension.CURRENT, 0.001,       "A"),
    "µa":  (Dimension.CURRENT, 1e-6,        "A"),
    "ka":  (Dimension.CURRENT, 1000.0,      "A"),

    # ── Power → Watt ────────────────────────────────────────
    "w":   (Dimension.POWER, 1.0,           "W"),
    "kw":  (Dimension.POWER, 1000.0,        "W"),
    "mw":  (Dimension.POWER, 1e6,           "W"),
    "hp":  (Dimension.POWER, 745.7,         "W"),
    "btu/h": (Dimension.POWER, 0.29307,     "W"),
}

# SI → preferred imperial output unit
_SI_TO_IMP: dict[str, tuple[float, str]] = {
    "Pa":    (1/6894.757, "PSI"),
    "K":     (None,       "°F"),     # handled specially
    "m":     (39.3701,    "in"),
    "V":     (1.0,        "V"),      # same
    "m³/s":  (15850.3,    "GPM"),
    "kg":    (2.20462,    "lb"),
    "N·m":   (0.737562,   "ft·lb"),
    "Hz":    (60.0,       "RPM"),    # only valid for line freq
    "A":     (1.0,        "A"),
    "W":     (1/745.7,    "hp"),
}


# ─────────────────────────────────────────────
# 3. TOLERANCE PARSING
# ─────────────────────────────────────────────

_TOL_SYMMETRIC = re.compile(
    r'±\s*(\d+\.?\d*)\s*(%|[a-zA-Z°µ/³·]+)?'
)
_TOL_PLUS_MINUS = re.compile(
    r'\+\s*(\d+\.?\d*)\s*/\s*-\s*(\d+\.?\d*)\s*(%|[a-zA-Z°µ/³·]+)?'
)
_TOL_PERCENT = re.compile(
    r'(\d+\.?\d*)\s*%'
)


def _parse_tolerance(text: str, si_value: float, unit_key: str
                     ) -> tuple[Optional[float], Optional[float]]:
    """Return (plus, minus) tolerance in SI units."""
    m = _TOL_PLUS_MINUS.search(text)
    if m:
        plus_raw, minus_raw, tol_unit = float(m.group(1)), float(m.group(2)), (m.group(3) or unit_key).strip().lower()
        factor = _TO_SI.get(tol_unit, (None, 1.0, None))[1]
        return plus_raw * factor, minus_raw * factor

    m = _TOL_SYMMETRIC.search(text)
    if m:
        val_raw, tol_unit = float(m.group(1)), (m.group(2) or unit_key).strip().lower()
        if tol_unit == "%":
            delta = si_value * val_raw / 100
        else:
            factor = _TO_SI.get(tol_unit, (None, 1.0, None))[1]
            delta = val_raw * factor
        return delta, delta

    m = _TOL_PERCENT.search(text)
    if m:
        pct = float(m.group(1))
        delta = si_value * pct / 100
        return delta, delta

    return None, None


# ─────────────────────────────────────────────
# 4. TEMPERATURE HELPERS
# ─────────────────────────────────────────────

def _to_kelvin(value: float, unit_key: str) -> float:
    if unit_key in ("°c", "c", "celsius"):
        return value + 273.15
    if unit_key in ("°f", "f", "fahrenheit"):
        return (value - 32) * 5/9 + 273.15
    return value  # already Kelvin


def _kelvin_to_celsius(k: float) -> float:
    return k - 273.15


def _kelvin_to_fahrenheit(k: float) -> float:
    return (k - 273.15) * 9/5 + 32


# ─────────────────────────────────────────────
# 5. FRACTIONAL INCH PARSER
# ─────────────────────────────────────────────

_FRACTION_RE = re.compile(
    r'(\d+)?\s*(\d+)\s*/\s*(\d+)'   # e.g. "1 1/2" or "3/4"
)


def _parse_fractional_inches(text: str) -> Optional[float]:
    """Parse '1 1/2 inch', '3/4"' etc. → decimal inches."""
    m = _FRACTION_RE.search(text)
    if not m:
        return None
    whole = int(m.group(1)) if m.group(1) else 0
    num, den = int(m.group(2)), int(m.group(3))
    return whole + num / den


# ─────────────────────────────────────────────
# 6. MAIN PARSING REGEX
# ─────────────────────────────────────────────

# Matches: optional "~", numeric (incl. commas), then unit token
_VALUE_UNIT_RE = re.compile(
    r'~?\s*'
    r'(-?\d[\d,]*\.?\d*)'           # numeric value
    r'\s*'
    r'(°?[a-zA-Z°µ³·/]+[a-zA-Z³·]?'  # unit (multi-char, may have °, µ, ³)
    r'|"|\''
    r')',
    re.IGNORECASE
)


def _clean_unit(raw: str) -> str:
    """Normalise unit string for lookup."""
    s = raw.strip().lower()
    s = s.replace("°", "°")   # normalise degree sign
    s = re.sub(r'\s+', '', s)
    return s


# ─────────────────────────────────────────────
# 7. PUBLIC API
# ─────────────────────────────────────────────

def parse(raw_text: str) -> Optional[NormalizedValue]:
    """
    Parse a raw measurement string and return a NormalizedValue.

    Supports:
    - Plain values:         "150 PSI", "10.3 bar", "12.7 mm"
    - Fractional inches:    "1/2\"", "1 1/4 inch"
    - Temperature offsets:  "-40 °C", "212 °F"
    - Tolerances:           "100 PSI ±5%", "24V +10%/-15%", "10 bar ±0.2 bar"
    Returns None if the string cannot be parsed with confidence.
    """
    text = raw_text.strip()

    # ── Try fractional-inch first ──────────────────────────
    frac_in = _parse_fractional_inches(text)
    if frac_in is not None:
        si_val = frac_in * 0.0254
        imp_val = frac_in
        tol_p, tol_m = _parse_tolerance(text, si_val, "in")
        return NormalizedValue(
            raw_text=raw_text,
            dimension=Dimension.LENGTH,
            si_value=si_val,
            si_unit="m",
            imperial_value=imp_val,
            imperial_unit="in",
            tolerance_plus=tol_p,
            tolerance_minus=tol_m,
            confidence=0.97,
        )

    # ── General regex match ────────────────────────────────
    m = _VALUE_UNIT_RE.search(text)
    if not m:
        return None

    raw_num  = m.group(1).replace(",", "")
    raw_unit = m.group(2)
    unit_key = _clean_unit(raw_unit)

    try:
        value = float(raw_num)
    except ValueError:
        return None

    entry = _TO_SI.get(unit_key)
    if entry is None:
        # Unknown unit – return with low confidence
        return NormalizedValue(
            raw_text=raw_text,
            dimension=Dimension.UNKNOWN,
            si_value=value,
            si_unit=raw_unit,
            confidence=0.3,
        )

    dim, factor, si_unit = entry

    # Temperature offset conversion
    if dim == Dimension.TEMPERATURE:
        si_val = _to_kelvin(value, unit_key)
        # Dual: output in Celsius + Fahrenheit
        c_val = _kelvin_to_celsius(si_val)
        f_val = _kelvin_to_fahrenheit(si_val)
        tol_p, tol_m = _parse_tolerance(text, si_val, unit_key)
        nv = NormalizedValue(
            raw_text=raw_text,
            dimension=dim,
            si_value=round(si_val, 4),
            si_unit="K",
            imperial_value=round(f_val, 2),
            imperial_unit="°F",
            tolerance_plus=tol_p,
            tolerance_minus=tol_m,
            confidence=0.98,
        )
        # Override dual label for temperature readability
        nv.dual_label = f"{_fmt(round(c_val,2))} °C / {_fmt(round(f_val,2))} °F"
        return nv

    si_val = round(value * factor, 8)
    tol_p, tol_m = _parse_tolerance(text, si_val, unit_key)

    # Build imperial counterpart
    imp_entry = _SI_TO_IMP.get(si_unit)
    imp_value, imp_unit = None, None
    if imp_entry:
        imp_factor, imp_unit = imp_entry
        if imp_factor is not None:
            imp_value = round(si_val * imp_factor, 4)

    return NormalizedValue(
        raw_text=raw_text,
        dimension=dim,
        si_value=si_val,
        si_unit=si_unit,
        imperial_value=imp_value,
        imperial_unit=imp_unit,
        tolerance_plus=tol_p,
        tolerance_minus=tol_m,
        confidence=0.98,
    )


def normalize_spec_dict(raw_specs: dict[str, str]) -> dict[str, dict]:
    """
    Batch-normalize a dict of {attribute_name: raw_value_string}.
    Returns {attribute_name: NormalizedValue.to_dict()} for parseable
    values; original entry preserved under 'raw_text' for unparseable ones.
    """
    result = {}
    for key, val in raw_specs.items():
        nv = parse(str(val))
        if nv:
            result[key] = nv.to_dict()
        else:
            result[key] = {"raw_text": val, "dimension": "unknown", "confidence": 0.0}
    return result


# ─────────────────────────────────────────────
# 8. CLI DEMO
# ─────────────────────────────────────────────

if __name__ == "__main__":
    samples = [
        "150 PSI",
        "10.3 bar",
        "1/2\"",
        "1 1/4 inch",
        "12.7 mm",
        "-40 °C",
        "212 °F",
        "24 VDC",
        "100 GPM ±5%",
        "50 Hz",
        "1500 RPM",
        "2.5 kW",
        "30 ft·lb",
        "135 N·m",
        "15 SCFM",
        "500 L/min",
        "304 stainless steel",  # non-numeric → should return None
    ]

    print(f"{'Raw Input':<30} {'Dual Label':<40} {'Dimension':<15} {'Confidence'}")
    print("─" * 100)
    for s in samples:
        nv = parse(s)
        if nv:
            print(f"{s:<30} {nv.dual_label:<40} {nv.dimension.value:<15} {nv.confidence:.0%}")
        else:
            print(f"{s:<30} [NOT PARSEABLE]")
