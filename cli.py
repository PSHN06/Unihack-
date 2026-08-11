"""
CLI Runner for Industrial Commerce Product Data Intelligence Platform.
Supports executing --phase 1, 2, 3, 4, 5, or --full against raw JSON/files.
"""

import sys
import argparse
import json
from pipeline.orchestrator import IndustrialIntelligenceOrchestrator

SAMPLE_INDUSTRIAL_VALVE = {
    "brand": "Rexroth",
    "part_number": "4WE6E6X/EG24N9K4",
    "product_name": "Directional Control Valve 4WE6",
    "category": "Industrial Control Valves",
    "text_datasheet": """
Brand: Rexroth
Part Number: 4WE6E6X/EG24N9K4
Category: Industrial Control Valves
Operating Pressure: 315 bar
Maximum Flow Rate: 80 L/min
Supply Voltage: 24 VDC
Operating Temperature: -20 to 80 °C
Body Material: Cast Iron
Port Size: G 1/4 inch
Thread Size: M14x1.5
    """.strip(),
    "attributes": [
        {"attribute_name": "Operating Pressure", "raw_value": "315 bar", "source_evidence": "Page 1, Spec Table Row 3", "confidence": 0.98},
        {"attribute_name": "Maximum Flow Rate", "raw_value": "80 L/min", "source_evidence": "Page 1, Spec Table Row 4", "confidence": 0.95},
        {"attribute_name": "Supply Voltage", "raw_value": "24 VDC", "source_evidence": "Page 2, Solenoid Data", "confidence": 0.99},
        {"attribute_name": "Min Operating Temperature", "raw_value": "-20 °C", "source_evidence": "Page 2, Environmental Specs", "confidence": 0.92},
        {"attribute_name": "Max Operating Temperature", "raw_value": "80 °C", "source_evidence": "Page 2, Environmental Specs", "confidence": 0.92},
        {"attribute_name": "Body Material", "raw_value": "Cast Iron", "source_evidence": "Page 1, Material List", "confidence": 0.96},
        {"attribute_name": "Port Size", "raw_value": "0.25 inch", "source_evidence": "Page 3, Port Dimensions", "confidence": 0.90}
    ],
    "visual_context": {
        "schematic_dimensions_found": True,
        "labels_detected": ["CE", "RoHS", "Laser-Etched Model 4WE6"],
        "visual_notes": "Solenoid coil label reads 24VDC 30W. Port A/B/P/T dimensioned drawing parsed."
    }
}

def main():
    parser = argparse.ArgumentParser(description="Industrial Commerce Product Data Intelligence Agent CLI")
    parser.add_argument("--phase", choices=["1", "2", "3", "4", "5", "full"], default="full", help="Pipeline phase to execute")
    parser.add_argument("--input", type=str, help="Path to input JSON file. Uses sample dataset if omitted.")
    parser.add_argument("--output", type=str, help="Path to write JSON output.")

    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            raw_input = json.load(f)
    else:
        raw_input = SAMPLE_INDUSTRIAL_VALVE

    orchestrator = IndustrialIntelligenceOrchestrator()

    if args.phase == "1":
        res = orchestrator.run_phase1(raw_input).model_dump()
    elif args.phase == "2":
        p1 = orchestrator.run_phase1(raw_input)
        res = orchestrator.run_phase2(p1).model_dump()
    elif args.phase == "3":
        p1 = orchestrator.run_phase1(raw_input)
        p2 = orchestrator.run_phase2(p1)
        res = orchestrator.run_phase3(p1, p2).model_dump()
    elif args.phase == "4":
        p1 = orchestrator.run_phase1(raw_input)
        p2 = orchestrator.run_phase2(p1)
        p3 = orchestrator.run_phase3(p1, p2)
        res = orchestrator.run_phase4(p1, p2, p3).model_dump()
    elif args.phase == "5":
        p1 = orchestrator.run_phase1(raw_input)
        p2 = orchestrator.run_phase2(p1)
        p3 = orchestrator.run_phase3(p1, p2)
        p4 = orchestrator.run_phase4(p1, p2, p3)
        res = orchestrator.run_phase5(p1, p2, p3, p4).model_dump()
    else:
        res = orchestrator.run_full_pipeline(raw_input)

    output_str = json.dumps(res, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_str)
        print(f"Pipeline output successfully written to {args.output}")
    else:
        print(output_str)

if __name__ == "__main__":
    main()
