"""
Master Pipeline Orchestrator.
Orchestrates Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 end-to-end.
"""

from typing import Dict, Any, Union
import json
from pipeline.schema import (
    Phase1Output, Phase2Output, Phase3Output, Phase4Output, Phase5Output
)
from pipeline.phase1_extractor import Phase1ExtractorAgent
from pipeline.phase2_graph_rag import Phase2GraphRAGAgent
from pipeline.phase3_content_engine import Phase3ContentEngineAgent
from pipeline.phase4_compliance_audit import Phase4ComplianceAuditAgent
from pipeline.phase5_pim_export import Phase5PIMExportAgent


class IndustrialIntelligenceOrchestrator:
    """Master Orchestrator connecting all 5 Industrial Product Intelligence Pipeline Agents."""

    def __init__(self):
        self.phase1_agent = Phase1ExtractorAgent()
        self.phase2_agent = Phase2GraphRAGAgent()
        self.phase3_agent = Phase3ContentEngineAgent()
        self.phase4_agent = Phase4ComplianceAuditAgent()
        self.phase5_agent = Phase5PIMExportAgent()

    def run_phase1(self, raw_input: Dict[str, Any]) -> Phase1Output:
        """Run Phase 1 Data Intelligence & Extraction."""
        return self.phase1_agent.process(raw_input)

    def run_phase2(self, phase1_output: Union[Phase1Output, Dict[str, Any]]) -> Phase2Output:
        """Run Phase 2 Knowledge Graph & Vector RAG Generator."""
        if isinstance(phase1_output, dict):
            phase1_output = Phase1Output(**phase1_output)
        return self.phase2_agent.process(phase1_output)

    def run_phase3(self, phase1_output: Union[Phase1Output, Dict[str, Any]], phase2_output: Union[Phase2Output, Dict[str, Any]]) -> Phase3Output:
        """Run Phase 3 Multi-Agent Content Engine."""
        if isinstance(phase1_output, dict):
            phase1_output = Phase1Output(**phase1_output)
        if isinstance(phase2_output, dict):
            phase2_output = Phase2Output(**phase2_output)
        return self.phase3_agent.process(phase1_output, phase2_output)

    def run_phase4(
        self,
        phase1_output: Union[Phase1Output, Dict[str, Any]],
        phase2_output: Union[Phase2Output, Dict[str, Any]],
        phase3_output: Union[Phase3Output, Dict[str, Any]]
    ) -> Phase4Output:
        """Run Phase 4 Traceability, Compliance & HITL Audit Agent."""
        if isinstance(phase1_output, dict):
            phase1_output = Phase1Output(**phase1_output)
        if isinstance(phase2_output, dict):
            phase2_output = Phase2Output(**phase2_output)
        if isinstance(phase3_output, dict):
            phase3_output = Phase3Output(**phase3_output)
        return self.phase4_agent.process(phase1_output, phase2_output, phase3_output)

    def run_phase5(
        self,
        phase1_output: Union[Phase1Output, Dict[str, Any]],
        phase2_output: Union[Phase2Output, Dict[str, Any]],
        phase3_output: Union[Phase3Output, Dict[str, Any]],
        phase4_output: Union[Phase4Output, Dict[str, Any]]
    ) -> Phase5Output:
        """Run Phase 5 Catalog Integration & PIM Export Agent."""
        if isinstance(phase1_output, dict):
            phase1_output = Phase1Output(**phase1_output)
        if isinstance(phase2_output, dict):
            phase2_output = Phase2Output(**phase2_output)
        if isinstance(phase3_output, dict):
            phase3_output = Phase3Output(**phase3_output)
        if isinstance(phase4_output, dict):
            phase4_output = Phase4Output(**phase4_output)
        return self.phase5_agent.process(phase1_output, phase2_output, phase3_output, phase4_output)

    def run_full_pipeline(self, raw_input: Dict[str, Any]) -> Dict[str, Any]:
        """Run complete Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 pipeline."""
        p1 = self.run_phase1(raw_input)
        p2 = self.run_phase2(p1)
        p3 = self.run_phase3(p1, p2)
        p4 = self.run_phase4(p1, p2, p3)
        p5 = self.run_phase5(p1, p2, p3, p4)

        return {
            "phase1_extraction": p1.model_dump(),
            "phase2_graph_rag": p2.model_dump(),
            "phase3_content_engine": p3.model_dump(),
            "phase4_compliance_audit": p4.model_dump(),
            "phase5_pim_export": p5.model_dump()
        }
