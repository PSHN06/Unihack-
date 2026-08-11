"""
Phase 5: Industrial Commerce Catalog Integration & PIM Export Agent.
Transforms Phase 4 validated, audited product intelligence into:
1. Enterprise PIM Export Payloads (Akeneo/InRiver/Shopify B2B) with localized en_US (imperial) & en_EU (metric) attributes.
2. UI Workbench frontend state payloads (specifications_tab, knowledge_graph_tab, commerce_preview_tab, audit_workbench_tab).
3. Deterministic Syndication Status & Webhooks (AUTO_PUBLISHED, PENDING_HUMAN_APPROVAL, REJECTED).
"""

from typing import Dict, Any, List
from pipeline.schema import (
    Phase1Output, Phase2Output, Phase3Output, Phase4Output, Phase5Output,
    PIMExportPayload, SpecificationTabItem, UIGraphNode, UIGraphEdge,
    KnowledgeGraphTab, CommercePreviewTab, FlaggedFieldItem, AuditWorkbenchTab,
    UIStatePayload, SyndicationStatus
)


class Phase5PIMExportAgent:
    """Phase 5 Catalog Integration & Enterprise PIM Export Agent."""

    HITL_TO_PUBLISH_MAP = {
        "AUTO_APPROVED": ("AUTO_PUBLISHED", "product.auto_published"),
        "NEEDS_REVIEW": ("PENDING_HUMAN_APPROVAL", "product.pending_approval"),
        "CRITICAL_OVERRIDE": ("REJECTED", "product.rejected")
    }

    def process(self, phase1_data: Phase1Output, phase2_data: Phase2Output, phase3_data: Phase3Output, phase4_data: Phase4Output) -> Phase5Output:
        """Execute Phase 5 Catalog Packaging."""

        part_no = phase1_data.product_metadata.part_number.value or "SKU-001"
        brand = phase1_data.product_metadata.brand.value or "Industrial"
        category = phase1_data.product_metadata.category_guess.value or "General Industrial"

        # 1. Deterministic Syndication Mapping
        hitl_priority = phase4_data.hitl_routing.hitl_priority
        pub_state, webhook_evt = self.HITL_TO_PUBLISH_MAP.get(hitl_priority, ("PENDING_HUMAN_APPROVAL", "product.pending_approval"))

        is_enabled = (pub_state == "AUTO_PUBLISHED")

        # 2. Enterprise PIM Export Payload (Akeneo / InRiver / Shopify B2B)
        pim_values: Dict[str, Any] = {
            "brand": {"data": brand, "locale": None, "scope": "global"},
            "part_number": {"data": part_no, "locale": None, "scope": "global"},
            "category": {"data": category, "locale": None, "scope": "global"},
            "unspsc_code": {"data": phase2_data.taxonomy_mapping.unspsc.code, "locale": None, "scope": "global"},
            "etim_class": {"data": phase2_data.taxonomy_mapping.etim.class_id, "locale": None, "scope": "global"}
        }

        for spec in phase3_data.normalized_specifications:
            key_slug = spec.attribute_name.lower().replace(' ', '_')
            pim_values[key_slug] = {
                "values": {
                    "en_US": f"{spec.imperial_value} {spec.imperial_unit}",
                    "en_EU": f"{spec.metric_value} {spec.metric_unit}"
                },
                "scope": "channel"
            }

        pim_export = PIMExportPayload(
            identifier=part_no,
            family=phase2_data.taxonomy_mapping.etim.class_name or "Industrial Components",
            categories=[category, phase2_data.taxonomy_mapping.unspsc.title or "Industrial Equipment"],
            enabled=is_enabled,
            values=pim_values
        )

        # 3. UI Workbench Payload Generation
        # Tab 1: Specifications Tab
        specs_tab: List[SpecificationTabItem] = []
        for t_entry in phase4_data.traceability_matrix:
            if t_entry.verification_status == "VERIFIED":
                status = "APPROVED"
            elif t_entry.verification_status == "CONTRADICTED":
                status = "FLAGGED"
            else:
                status = "WARNING"

            # Find matching raw value
            raw_val = "N/A"
            for a in phase1_data.technical_attributes:
                if a.attribute_name == t_entry.attribute:
                    raw_val = a.raw_value
                    break

            specs_tab.append(SpecificationTabItem(
                attribute_key=t_entry.attribute,
                raw_value=raw_val if raw_val != "N/A" else str(t_entry.final_value),
                normalized_value=str(t_entry.final_value),
                status=status
            ))

        # Tab 2: Knowledge Graph Tab (React Flow / Vis.js compliant)
        ui_nodes: List[UIGraphNode] = []
        ui_edges: List[UIGraphEdge] = []

        for node in phase2_data.graph_structure.nodes:
            ui_nodes.append(UIGraphNode(
                id=node.id,
                label=node.properties.get("name", node.id),
                group=node.label
            ))

        for rel in phase2_data.graph_structure.relationships:
            ui_edges.append(UIGraphEdge(
                from_=rel.from_,
                to=rel.to,
                label=rel.type
            ))

        kg_tab = KnowledgeGraphTab(nodes=ui_nodes, edges=ui_edges)

        # Tab 3: Commerce Preview Tab (PDP Layout)
        spec_summary = {
            s.attribute_name: f"{s.metric_value} {s.metric_unit} ({s.imperial_value} {s.imperial_unit})"
            for s in phase3_data.normalized_specifications
        }

        commerce_tab = CommercePreviewTab(
            pdp_title=phase3_data.commerce_assets.seo_long_title,
            pdp_bullets=phase3_data.commerce_assets.feature_bullets,
            pdp_description=phase3_data.commerce_assets.marketing_description,
            spec_summary_table=spec_summary
        )

        # Tab 4: Audit Workbench Tab
        flagged_fields: List[FlaggedFieldItem] = []
        for c in phase4_data.quality_and_risk_metrics.contradictions_found:
            flagged_fields.append(FlaggedFieldItem(
                field=c.attribute,
                current_value="CONTRADICTED IN SOURCE",
                reason=c.issue_description,
                action_required=f"Manually review page 1 text datasheet and visual schematic tag to resolve {c.attribute} mismatch."
            ))

        for m in phase4_data.quality_and_risk_metrics.missing_compliance_certs:
            flagged_fields.append(FlaggedFieldItem(
                field="Regulatory Certifications",
                current_value="Missing Certification",
                reason=f"Mandatory safety certification '{m}' not detected in visual label extractions.",
                action_required=f"Upload updated nameplate photo or compliance datasheet confirming '{m}' certification."
            ))

        for t in phase4_data.traceability_matrix:
            if t.verification_status == "UNVERIFIED":
                flagged_fields.append(FlaggedFieldItem(
                    field=t.attribute,
                    current_value=str(t.final_value),
                    reason=f"Attribute provenance is unverified (citation: '{t.provenance_citation}').",
                    action_required=f"Confirm {t.attribute} against official OEM specification document."
                ))

        # Hard constraint check: audit_workbench_tab.flagged_fields must never be empty when review required
        if not is_enabled and not flagged_fields:
            flagged_fields.append(FlaggedFieldItem(
                field="Catalog Approval Routing",
                current_value="PENDING_HUMAN_APPROVAL",
                reason="Product requires human review prior to automated PIM syndication.",
                action_required="Perform catalog manager approval sign-off in PIM workbench."
            ))

        audit_tab = AuditWorkbenchTab(flagged_fields=flagged_fields)

        ui_state = UIStatePayload(
            specifications_tab=specs_tab,
            knowledge_graph_tab=kg_tab,
            commerce_preview_tab=commerce_tab,
            audit_workbench_tab=audit_tab
        )

        syndication = SyndicationStatus(
            publish_state=pub_state,
            target_channel="Akeneo / Shopify B2B Multi-Region",
            webhook_event=webhook_evt
        )

        return Phase5Output(
            pim_export_payload=pim_export,
            ui_state_payload=ui_state,
            syndication_status=syndication
        )
