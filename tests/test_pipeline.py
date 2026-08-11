"""
Automated Unit Test Suite for Industrial Commerce Product Data Intelligence Platform.
Tests Phase 1 through Phase 5 pipeline operations.
"""

import unittest
import json
from pipeline.orchestrator import IndustrialIntelligenceOrchestrator
from pipeline.schema import Phase1Output, Phase2Output, Phase3Output, Phase4Output, Phase5Output


class TestIndustrialPipeline(unittest.TestCase):

    def setUp(self):
        self.orchestrator = IndustrialIntelligenceOrchestrator()
        self.sample_input = {
            "brand": "Danfoss",
            "part_number": "KPS 31",
            "product_name": "Pressure Switch KPS 31",
            "category": "Pressure Sensors",
            "text_datasheet": """
Brand: Danfoss
Part Number: KPS 31
Category: Pressure Sensors
Operating Pressure: 60 bar
Min Operating Temperature: -40 °C
Max Operating Temperature: 85 °C
Enclosure Rating: IP67
            """.strip(),
            "attributes": [
                {"attribute_name": "Operating Pressure", "raw_value": "60 bar", "source_evidence": "Page 1, Spec Table", "confidence": 0.98},
                {"attribute_name": "Min Operating Temperature", "raw_value": "-40 °C", "source_evidence": "Page 1, Temp Specs", "confidence": 0.95},
                {"attribute_name": "Max Operating Temperature", "raw_value": "85 °C", "source_evidence": "Page 1, Temp Specs", "confidence": 0.95},
                {"attribute_name": "Pressure Connection", "raw_value": "G 1/4 inch", "source_evidence": "Page 2, Port Spec", "confidence": 0.90}
            ],
            "visual_context": {
                "schematic_dimensions_found": True,
                "labels_detected": ["CE", "ATEX", "RoHS", "IP67"],
                "visual_notes": "IP67 switch enclosure and G 1/4 thread parsed from drawing."
            }
        }

    def test_phase1_extraction_and_si_normalization(self):
        p1 = self.orchestrator.run_phase1(self.sample_input)
        self.assertIsInstance(p1, Phase1Output)
        self.assertEqual(p1.product_metadata.brand.value, "Danfoss")
        self.assertEqual(p1.product_metadata.part_number.value, "KPS 31")
        self.assertTrue(len(p1.technical_attributes) > 0)
        
        # Test unit normalization
        press_attr = next(a for a in p1.technical_attributes if a.attribute_name == "Operating Pressure")
        self.assertEqual(press_attr.normalized_unit, "bar")
        self.assertEqual(press_attr.normalized_value, 60.0)

    def test_phase2_knowledge_graph_and_rag(self):
        p1 = self.orchestrator.run_phase1(self.sample_input)
        p2 = self.orchestrator.run_phase2(p1)
        self.assertIsInstance(p2, Phase2Output)
        
        # Verify node-relationship cross reference integrity
        node_ids = {n.id for n in p2.graph_structure.nodes}
        for rel in p2.graph_structure.relationships:
            self.assertIn(rel.from_, node_ids, f"Edge source {rel.from_} not found in node set")
            self.assertIn(rel.to, node_ids, f"Edge target {rel.to} not found in node set")

        # Verify Cypher queries contain MERGE
        for query in p2.graph_structure.cypher_queries:
            self.assertTrue(query.startswith("MERGE") or "MERGE" in query, f"Cypher query does not use MERGE: {query}")

        # Verify taxonomy mapping
        self.assertIsNotNone(p2.taxonomy_mapping.unspsc.code)
        self.assertIsNotNone(p2.taxonomy_mapping.etim.class_id)

    def test_phase3_content_engine_and_character_constraints(self):
        p1 = self.orchestrator.run_phase1(self.sample_input)
        p2 = self.orchestrator.run_phase2(p1)
        p3 = self.orchestrator.run_phase3(p1, p2)
        self.assertIsInstance(p3, Phase3Output)

        # Verify character hard constraints
        short_title = p3.commerce_assets.seo_short_title
        long_title = p3.commerce_assets.seo_long_title
        self.assertLessEqual(len(short_title), 80, f"SEO Short Title exceeds 80 chars: {len(short_title)}")
        self.assertLessEqual(len(long_title), 150, f"SEO Long Title exceeds 150 chars: {len(long_title)}")

        # Verify dual imperial/metric specs
        self.assertTrue(len(p3.normalized_specifications) > 0)
        spec = p3.normalized_specifications[0]
        self.assertIsNotNone(spec.metric_unit)
        self.assertIsNotNone(spec.imperial_unit)

        # Verify quality audit result
        self.assertIn(p3.audit_results.hallucination_check, ["passed", "failed"])

    def test_phase4_compliance_and_hitl_routing(self):
        p1 = self.orchestrator.run_phase1(self.sample_input)
        p2 = self.orchestrator.run_phase2(p1)
        p3 = self.orchestrator.run_phase3(p1, p2)
        p4 = self.orchestrator.run_phase4(p1, p2, p3)
        self.assertIsInstance(p4, Phase4Output)

        self.assertTrue(len(p4.traceability_matrix) > 0)
        for entry in p4.traceability_matrix:
            self.assertTrue(len(entry.provenance_citation) > 0, "Provenance citation cannot be empty")

        self.assertIn(p4.hitl_routing.hitl_priority, ["AUTO_APPROVED", "NEEDS_REVIEW", "CRITICAL_OVERRIDE"])

    def test_phase5_pim_export_and_deterministic_syndication(self):
        p1 = self.orchestrator.run_phase1(self.sample_input)
        p2 = self.orchestrator.run_phase2(p1)
        p3 = self.orchestrator.run_phase3(p1, p2)
        p4 = self.orchestrator.run_phase4(p1, p2, p3)
        p5 = self.orchestrator.run_phase5(p1, p2, p3, p4)
        self.assertIsInstance(p5, Phase5Output)

        # Verify deterministic publish mapping
        hitl = p4.hitl_routing.hitl_priority
        pub = p5.syndication_status.publish_state
        if hitl == "AUTO_APPROVED":
            self.assertEqual(pub, "AUTO_PUBLISHED")
            self.assertTrue(p5.pim_export_payload.enabled)
        elif hitl == "NEEDS_REVIEW":
            self.assertEqual(pub, "PENDING_HUMAN_APPROVAL")
            self.assertFalse(p5.pim_export_payload.enabled)
        elif hitl == "CRITICAL_OVERRIDE":
            self.assertEqual(pub, "REJECTED")
            self.assertFalse(p5.pim_export_payload.enabled)

        # Verify localized en_US and en_EU in PIM values
        self.assertIn("en_US", str(p5.pim_export_payload.values))
        self.assertIn("en_EU", str(p5.pim_export_payload.values))

    def test_full_end_to_end_pipeline(self):
        res = self.orchestrator.run_full_pipeline(self.sample_input)
        self.assertIn("phase1_extraction", res)
        self.assertIn("phase2_graph_rag", res)
        self.assertIn("phase3_content_engine", res)
        self.assertIn("phase4_compliance_audit", res)
        self.assertIn("phase5_pim_export", res)


if __name__ == "__main__":
    unittest.main()
