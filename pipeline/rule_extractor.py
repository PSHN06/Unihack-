import csv
import os
from collections import defaultdict
from pathlib import Path

# Try to find the Expected Output CSV (which acts as our proxy for the massive LOV and Brand files)
CSV_PATH = Path(__file__).parent.parent / "Unihack_ Expected Output - Delivery Format.csv"

def load_canonical_data():
    """
    Parses the ground-truth Delivery Format CSV to build:
    1. canonical_brands: A list of dicts with {"manuf": ..., "brand": ...}
    2. allowed_lovs: A dict mapping Classpath -> set of (Attribute Label, Attribute Value)
       Actually, since we want to restrict Gemini, let's map Classpath -> dict of Label -> list[Values]
    """
    canonical_brands = []
    allowed_lovs = defaultdict(lambda: defaultdict(set))
    
    if not CSV_PATH.exists():
        # Fallback if running from somewhere else or file is missing
        return canonical_brands, allowed_lovs

    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Extract Manufacturer and Brand
            manuf = row.get("MANUFACTURER_NAME", "").strip()
            brand = row.get("BRAND_NAME", "").strip()
            if manuf or brand:
                canonical_brands.append({"manuf": manuf, "brand": brand})
                
            # Extract LOVs based on Classpath
            classpath = row.get("Classpath", "").strip()
            if not classpath:
                continue
                
            # There are 50 potential attribute label/value pairs
            for i in range(1, 51):
                lbl_key = f"ATTRIBUTE_LABEL {i}"
                val_key = f"ATTRIBUTE_VALUE {i}"
                
                label = row.get(lbl_key, "").strip()
                val = row.get(val_key, "").strip()
                
                if label and val:
                    allowed_lovs[classpath][label].add(val)
                    
    # Convert sets to lists for JSON serialization later if needed
    lov_dict = {}
    for cp, labels in allowed_lovs.items():
        lov_dict[cp] = {lbl: list(vals) for lbl, vals in labels.items()}
        
    return canonical_brands, lov_dict

# Singleton instance to be imported by batch_enricher
CANONICAL_BRANDS, ALLOWED_LOVS = load_canonical_data()

def get_lovs_for_classpath(classpath: str) -> str:
    """Returns a formatted string of allowed labels and values for a given classpath."""
    if not classpath or classpath not in ALLOWED_LOVS:
        return ""
    
    lines = []
    for lbl, vals in ALLOWED_LOVS[classpath].items():
        lines.append(f"- {lbl}: {', '.join(vals)}")
    return "\n".join(lines)
