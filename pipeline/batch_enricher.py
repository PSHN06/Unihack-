"""
Batch Enricher — processes raw industrial catalogue rows and maps them
to the full 252-column Unilog Delivery Format.
"""

import os
import re
import json
import time
import asyncio
import csv
import io
from typing import List, Dict, Any

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# --------------------------------------------------------------------------- #
# 252-column output header list (exact order from Delivery Format)
# --------------------------------------------------------------------------- #
OUTPUT_HEADERS = [
    'MFR URL','Ref URL 1','Ref URL 2','Ref URL 3','Ref URL 4','Ref URL 5',
    'PART_NUMBER','Dept','Class','Fine','SKU - MY_PART_NUMBER',
    'Mfg_Part_Num','Part_Desc','E1_Brand','Unilog_Brand','DIB_Brand','Part_Manuf',
    'MANUFACTURER_NAME','BRAND_NAME','TRADE_NAME','MANUFACTURER_PART_NUMBER',
    'ALTERNATE_PART_NUMBER','Classpath',
    'MOBILE_DESC','INVOICE_DESC','SHORT_DESC','LONG_DESC1',
    'RETAIL_DESC','MARKETING_DESCRIPTION',
    'ITEM_FEATURES_1','ITEM_FEATURES_2','ITEM_FEATURES_3','ITEM_FEATURES_4',
    'ITEM_FEATURES_5','ITEM_FEATURES_6','ITEM_FEATURES_7','ITEM_FEATURES_8',
    'ITEM_FEATURES_9','ITEM_FEATURES_10','ITEM_FEATURES_11','ITEM_FEATURES_12',
    'ITEM_FEATURES_13','ITEM_FEATURES_14','ITEM_FEATURES_15','ITEM_FEATURES_16',
    'ITEM_FEATURES_17','ITEM_FEATURES_18','ITEM_FEATURES_19','ITEM_FEATURES_20',
    'With','Standard/Approvals','Prop 65','Application','Includes','Product Name',
]
# Attribute triplets 1-50
for i in range(1, 51):
    OUTPUT_HEADERS += [f'ATTRIBUTE_LABEL {i}', f'ATTRIBUTE_VALUE {i}', f'ATTRIBUTE_UOM {i}']

OUTPUT_HEADERS += [
    'UPC','EAN','GTIN','UNSPSC','Warranty','List Price','Selling Qty','Selling UOM',
    'Standard Packaging Information',
    'LENGTH','LENGTH_UOM','HEIGHT','HEIGHT_UOM','WIDTH','WIDTH_UOM',
    'WEIGHT','WEIGHT_UOM','VOLUME','VOLUME_UOM',
    'Product Image','Alternate Image 1','Alternate Image 2','Alternate Image 3',
    'Alternate Image 4','SDS','SDS_1','Warranty Information','Catalog',
    'Specification Sheet','Instruction/Installation Manual','Service Manual',
    'Owners/User Manual','Line Drawing','MTR','RoHS','Full Engineering Drawing',
    'Energy Star Guide','Technical Bulletin','Submittal','Compatibility Chart',
    'Size Chart','Product Label/Insert','Video Link','Video Link 1',
    'Country Of Origin','Discontinued','Actual Image (Yes/No)',
]


# --------------------------------------------------------------------------- #
# Input cleaning helpers
# --------------------------------------------------------------------------- #
PLACEHOLDER_BRANDS = {
    '-- unbranded --', '-- no unilog brand --', '-- no dib brand --',
    '--unbranded--', '--no unilog brand--', '--no dib brand--',
}

def clean_brand(value: str) -> str:
    """Return empty string if value is a placeholder, else return stripped value."""
    if value.strip().lower() in PLACEHOLDER_BRANDS:
        return ''
    return value.strip()

def clean_manuf(value: str) -> str:
    """Strip trailing codes like '(2435)' from manufacturer field."""
    return re.sub(r'\s*\(\w+\)\s*$', '', value.strip()).strip()

def build_clean_brand(row: dict) -> str:
    """Return the best non-placeholder brand from the three brand fields."""
    for field in ('E1_Brand', 'Unilog_Brand', 'DIB_Brand'):
        val = clean_brand(row.get(field, ''))
        if val:
            return val
    return ''


# --------------------------------------------------------------------------- #
# Gemini enrichment
# --------------------------------------------------------------------------- #
ENRICHMENT_PROMPT = """You are a senior product content specialist for industrial distributors.
Your job is to enrich a raw catalogue row into a structured product record.

INPUT ROW:
  Part Number : {part_num}
  Description : {part_desc}
  Manufacturer: {manuf}
  Brand       : {brand}

OUTPUT RULES (strictly follow every rule):
1. invoice_desc  — ≤40 characters, ALL CAPS, use standard abbreviations (DISHWASHER not DSHWSHR; SST for Stainless Steel; SS for Single Speed; V for Volt; A for Amp; W for Watt; IN for inch; LB for pound; PC for piece; BLT for belt; CTR for cartridge; etc). Must be a dense shorthand label a warehouse worker would read.
2. mobile_desc   — 60-80 characters exactly: "{{Manufacturer}} {{Brand}}, {{ItemType}}, {{Series if any}}, {{PartNum}}"
3. short_desc    — "{{Brand}}® {{Series}} {{PartNum}} {{ItemType}} {{With key feature}}, {{key feature 2}}" — 80–140 chars
4. long_desc     — Full professional 120-200 word description with all extractable specs, dimensions, ratings in the format used in B2B industrial catalogues. Include fractions for inch measurements (e.g. 1/2 in, 3/8 in).
5. retail_desc   — 1–2 punchy sentences for retail display (60–100 chars each)
6. marketing_desc — 3–4 sentence brand-voice marketing paragraph
7. classpath     — Category>Subcategory>Item Type (3 levels, use standard industrial taxonomy)
8. unspsc        — 8-digit UNSPSC code matching the item type (e.g. 27112000 for abrasives)
9. manufacturer  — Canonical legal name (proper case, no codes)
10. brand        — Brand name, add ® if it is a registered trademark of that manufacturer
11. product_name — Generic item type name (e.g. "Sanding Belt", "Ball Valve", "Pipe Fitting")
12. application  — Specific use case or application environment
13. with_feature — Single "With [notable feature or technology]" string, or empty
14. standards    — Pipe-separated list of standards/approvals (e.g. "UL Listed|CE Marked|RoHS"), or empty
15. features     — Array of 5-10 short bullet-point feature strings
16. attributes   — Array of up to 20 objects: {{label, value, uom}}. Extract every measurable spec. uom = unit string (V, A, in, mm, kg, lb, dBA, etc.) or "" if not applicable.
17. warranty     — Warranty string (e.g. "1 Year Manufacturer") or empty if unknown
18. country_of_origin — ISO country name if determinable, else empty

Return ONLY a single valid JSON object with these exact keys:
invoice_desc, mobile_desc, short_desc, long_desc, retail_desc, marketing_desc,
classpath, unspsc, manufacturer, brand, product_name, application, with_feature,
standards, features, attributes, warranty, country_of_origin
"""


def _configure_genai(api_key: str | None = None):
    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=key)
    return genai.GenerativeModel("gemini-3.6-flash")


def enrich_row(row: dict, model=None) -> dict:
    """
    Take one input CSV row dict and return a fully populated 252-column output dict.
    Raises on API failure.
    """
    manuf_raw = row.get("Part_Manuf", "")
    manuf = clean_manuf(manuf_raw)
    brand = build_clean_brand(row) or manuf
    part_num = row.get("Mfg_Part_Num", "")
    part_desc = row.get("Part_Desc", "")

    prompt = ENRICHMENT_PROMPT.format(
        part_num=part_num,
        part_desc=part_desc,
        manuf=manuf,
        brand=brand,
    )

    if model is None:
        model = _configure_genai()

    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"},
    )
    raw = response.text.strip()
    # Strip any accidental markdown fences
    raw = re.sub(r"^```json\s*|```$", "", raw, flags=re.MULTILINE).strip()
    enriched = json.loads(raw)

    # Build the 252-column output row
    out = {h: "" for h in OUTPUT_HEADERS}

    # Pass-through from input
    out["Mfg_Part_Num"] = part_num
    out["Part_Desc"] = part_desc
    out["E1_Brand"] = row.get("E1_Brand", "")
    out["Unilog_Brand"] = row.get("Unilog_Brand", "")
    out["DIB_Brand"] = row.get("DIB_Brand", "")
    out["Part_Manuf"] = manuf_raw
    out["MANUFACTURER_PART_NUMBER"] = part_num

    # Gemini-enriched fields
    out["MANUFACTURER_NAME"] = enriched.get("manufacturer", manuf)
    out["BRAND_NAME"] = enriched.get("brand", brand)
    out["Classpath"] = enriched.get("classpath", "")
    out["INVOICE_DESC"] = (enriched.get("invoice_desc", ""))[:40].upper()
    out["MOBILE_DESC"] = enriched.get("mobile_desc", "")[:80]
    out["SHORT_DESC"] = enriched.get("short_desc", "")
    out["LONG_DESC1"] = enriched.get("long_desc", "")
    out["RETAIL_DESC"] = enriched.get("retail_desc", "")
    out["MARKETING_DESCRIPTION"] = enriched.get("marketing_desc", "")
    out["Product Name"] = enriched.get("product_name", "")
    out["Application"] = enriched.get("application", "")
    out["With"] = enriched.get("with_feature", "")
    out["Standard/Approvals"] = enriched.get("standards", "")
    out["UNSPSC"] = enriched.get("unspsc", "")
    out["Warranty"] = enriched.get("warranty", "")
    out["Country Of Origin"] = enriched.get("country_of_origin", "")

    # Item features
    features = enriched.get("features", [])
    for i, feat in enumerate(features[:20], start=1):
        out[f"ITEM_FEATURES_{i}"] = feat

    # Attributes (up to 50)
    attributes = enriched.get("attributes", [])
    for i, attr in enumerate(attributes[:50], start=1):
        out[f"ATTRIBUTE_LABEL {i}"] = attr.get("label", "")
        out[f"ATTRIBUTE_VALUE {i}"] = str(attr.get("value", ""))
        out[f"ATTRIBUTE_UOM {i}"] = attr.get("uom", "")

    return out


async def enrich_row_async(row: dict, model=None, semaphore=None) -> dict:
    """Async wrapper — runs enrich_row in thread pool to avoid blocking event loop."""
    if semaphore:
        async with semaphore:
            return await asyncio.to_thread(enrich_row, row, model)
    return await asyncio.to_thread(enrich_row, row, model)


def rows_to_csv_bytes(output_rows: List[dict]) -> bytes:
    """Serialize list of output row dicts to CSV bytes (UTF-8 with BOM for Excel)."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=OUTPUT_HEADERS, extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(output_rows)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def parse_input_csv(file_bytes: bytes) -> List[dict]:
    """Parse raw CSV bytes from the uploaded input file."""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)
