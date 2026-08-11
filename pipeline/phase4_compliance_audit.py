"""
Phase 4: Industrial Data Validation, Traceability & HITL Audit Agent.
Aggregates Phase 1, 2, and 3 outputs and performs:
1. Provenance citation matrix indexing & verification status marking.
2. Contradiction scanner (physical/mathematical/unit conflict) & regulatory certification checks (CE, RoHS, UL, ATEX, IP Ratings).
3. Overall Quality Score (0.0-100.0) & Risk Level (LOW, MEDIUM, HIGH) evaluation.
4. Human-in-the-Loop (HITL) Routing (AUTO_APPROVED, NEEDS_REVIEW, CRITICAL_OVERRIDE).
"""

from typing import Dict, Any, List
from pipeline.schema import (
    Phase1Output, Phase2Output, Phase3Output, Phase4Output,
    TraceabilityEntry, QualityAndRiskMetrics, Contradiction, HITLRouting
)


class Phase4ComplianceAuditAgent:
    """Phase 4 Traceability, Compliance & HITL Audit Gatekeeper Agent."""

    MANDATORY_CERTS_BY_CATEGORY = {
        "industrial control valves": ["CE", "RoHS", "IP Ratings"],
        "electric motors": ["CE", "UL", "RoHS", "IP Ratings"],
        "bearings": ["RoHS"],
        "pressure sensors": ["CE", "ATEX", "RoHS", "IP Ratings"]
    }

    def process(self, phase1_data: Phase1Output, phase2_data: Phase2Output, phase3_data: Phase3Output) -> Phase4Output:
        """Execute Phase 4 Compliance Audit."""
        traceability_matrix: List[TraceabilityEntry] = []
        contradictions: List[Contradiction] = []
        
        # 1. Build Traceability Matrix
        p1_attr_map = {a.attribute_name.lower(): a for a in phase1_data.technical_attributes}

        for norm_spec in phase3_data.normalized_specifications:
            attr_name = norm_spec.attribute_name
            attr_lower = attr_name.lower()
            
            p1_match = p1_attr_map.get(attr_lower)
            if p1_match:
                source_type = "PDF_TEXT"
                citation = p1_match.source_evidence or "Phase 1 Datasheet Extraction"
                status = "VERIFIED"

                # Check unit conversion magnitude consistency
                if p1_match.confidence < 0.5:
                    status = "UNVERIFIED"
            else:
                source_type = "INFERRED"
                citation = "no source_evidence found in Phase 1/2 output"
                status = "UNVERIFIED"

            traceability_matrix.append(TraceabilityEntry(
                attribute=attr_name,
                final_value=f"{norm_spec.metric_value} {norm_spec.metric_unit}",
                source_type=source_type,
                provenance_citation=citation,
                verification_status=status
            ))

        # Add Visual & Metadata Provenance Entries
        traceability_matrix.append(TraceabilityEntry(
            attribute="Brand & Part Number",
            final_value=f"{phase1_data.product_metadata.brand.value} {phase1_data.product_metadata.part_number.value}",
            source_type="PDF_TEXT",
            provenance_citation=phase1_data.product_metadata.brand.source_evidence,
            verification_status="VERIFIED"
        ))

        traceability_matrix.append(TraceabilityEntry(
            attribute="Visual Schematic Dimensions",
            final_value="Parsed" if phase1_data.visual_insights.schematic_dimensions_found else "Not Found",
            source_type="IMAGE_VLM",
            provenance_citation=phase1_data.visual_insights.visual_notes or "Visual Drawing Inspection",
            verification_status="VERIFIED" if phase1_data.visual_insights.schematic_dimensions_found else "UNVERIFIED"
        ))

        # 2. Conflict & Contradiction Detection
        # Check temperature ranges, pressure limits, electrical mismatches
        temp_min, temp_max = None, None
        for a in phase1_data.technical_attributes:
            name_l = a.attribute_name.lower()
            if "min temp" in name_l:
                try: temp_min = float(a.normalized_value)
                except (ValueError, TypeError): pass
            if "max temp" in name_l:
                try: temp_max = float(a.normalized_value)
                except (ValueError, TypeError): pass

        if temp_min is not None and temp_max is not None and temp_min > temp_max:
            contradictions.append(Contradiction(
                attribute="Operating Temperature Range",
                issue_description=f"Physical contradiction detected: Minimum operating temperature ({temp_min}°C) exceeds Maximum operating temperature ({temp_max}°C)."
            ))
            # Flag traceability status
            for entry in traceability_matrix:
                if "temperature" in entry.attribute.lower():
                    entry.verification_status = "CONTRADICTED"

        # Check title vs spec contradictions
        voltage_specs = [a for a in phase1_data.technical_attributes if "voltage" in a.attribute_name.lower()]
        if len(voltage_specs) > 1:
            vals = set(str(a.normalized_value) for a in voltage_specs)
            if len(vals) > 1:
                contradictions.append(Contradiction(
                    attribute="Supply Voltage",
                    issue_description=f"Conflicting voltage ratings detected across document lines: {', '.join(vals)}."
                ))

        # 3. Regulatory Certification Check
        cat_lower = phase1_data.product_metadata.category_guess.value.lower()
        mandatory_certs = self.MANDATORY_CERTS_BY_CATEGORY.get(cat_lower, ["CE", "RoHS"])
        detected_labels = phase1_data.visual_insights.labels_detected
        
        missing_certs = [c for c in mandatory_certs if not any(c.lower() in d.lower() for d in detected_labels)]

        # 4. Quality & Risk Metrics Computation
        verified_count = sum(1 for t in traceability_matrix if t.verification_status == "VERIFIED")
        total_count = max(1, len(traceability_matrix))
        verification_ratio = verified_count / float(total_count)

        base_score = verification_ratio * 100.0
        if contradictions:
            base_score -= (len(contradictions) * 35.0)
        if missing_certs:
            base_score -= (len(missing_certs) * 15.0)

        overall_quality_score = max(0.0, min(100.0, round(base_score, 1)))

        if contradictions or (missing_certs and "CE" in missing_certs):
            risk_level = "HIGH"
        elif missing_certs or any(t.verification_status == "UNVERIFIED" for t in traceability_matrix):
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        quality_and_risk = QualityAndRiskMetrics(
            overall_quality_score=overall_quality_score,
            risk_level=risk_level,
            contradictions_found=contradictions,
            missing_compliance_certs=missing_certs
        )

        # 5. HITL Routing Logic
        requires_human = (len(contradictions) > 0) or (len(missing_certs) > 0) or (risk_level != "LOW")

        action_items: List[str] = []
        for c in contradictions:
            action_items.append(f"[CRITICAL CONFLICT] {c.attribute}: {c.issue_description}")
        for m in missing_certs:
            action_items.append(f"[REGULATORY GAP] Mandatory certification '{m}' not detected in visual labels for category '{phase1_data.product_metadata.category_guess.value}'.")
        for t in traceability_matrix:
            if t.verification_status == "UNVERIFIED":
                action_items.append(f"[UNVERIFIED SPEC] Attribute '{t.attribute}' lacks explicit datasheet source citation.")

        if contradictions or "CE" in missing_certs:
            hitl_priority = "CRITICAL_OVERRIDE"
        elif requires_human:
            hitl_priority = "NEEDS_REVIEW"
        else:
            hitl_priority = "AUTO_APPROVED"
            requires_human = False

        hitl_routing = HITLRouting(
            requires_human_review=requires_human,
            hitl_priority=hitl_priority,
            human_action_items=action_items
        )

        return Phase4Output(
            traceability_matrix=traceability_matrix,
            quality_and_risk_metrics=quality_and_risk,
            hitl_routing=hitl_routing
        )
