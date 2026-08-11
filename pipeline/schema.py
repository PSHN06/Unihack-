"""
Pipeline Schemas for Phases 1 through 5.
Defines data structures and JSON validation models for the entire platform.
"""

from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field


# ==========================================
# PHASE 1: Data Intelligence & Extraction
# ==========================================

class BrandField(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_evidence: str

class PartNumberField(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_evidence: str

class ProductNameField(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_evidence: str

class CategoryGuessField(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_evidence: str

class ProductMetadata(BaseModel):
    brand: BrandField
    part_number: PartNumberField
    product_name: ProductNameField
    category_guess: CategoryGuessField

class TechnicalAttribute(BaseModel):
    attribute_name: str
    raw_value: str
    normalized_value: Union[str, float, int]
    normalized_unit: str
    confidence: float = Field(ge=0.0, le=1.0)
    source_evidence: str

class VisualInsights(BaseModel):
    schematic_dimensions_found: bool = False
    labels_detected: List[str] = Field(default_factory=list)
    visual_notes: str = ""

class EnrichmentStatus(BaseModel):
    is_data_complete: bool = False
    missing_critical_attributes: List[str] = Field(default_factory=list)
    requires_web_crawl: bool = False

class Phase1Output(BaseModel):
    product_metadata: ProductMetadata
    technical_attributes: List[TechnicalAttribute]
    visual_insights: VisualInsights
    enrichment_status: EnrichmentStatus


# ==========================================
# PHASE 2: Knowledge Graph & Hybrid RAG
# ==========================================

class GraphNode(BaseModel):
    id: str
    label: str
    properties: Dict[str, Any] = Field(default_factory=dict)

class GraphRelationship(BaseModel):
    from_: str = Field(alias="from")
    to: str
    type: str
    properties: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True

class GraphStructure(BaseModel):
    cypher_queries: List[str]
    nodes: List[GraphNode]
    relationships: List[GraphRelationship]

class UnspscMapping(BaseModel):
    code: Optional[str] = None
    title: Optional[str] = None

class EtimMapping(BaseModel):
    class_id: Optional[str] = None
    class_name: Optional[str] = None

class StandardizedAttributes(BaseModel):
    key_value_pairs: Dict[str, Any] = Field(default_factory=dict)

class TaxonomyMapping(BaseModel):
    unspsc: UnspscMapping
    etim: EtimMapping
    standardized_attributes: StandardizedAttributes

class FilterableMetadata(BaseModel):
    brand: str
    part_number: str
    category: str
    spec_filters: Dict[str, Any] = Field(default_factory=dict)

class VectorDBPayload(BaseModel):
    searchable_chunk_text: str
    filterable_metadata: FilterableMetadata

class Phase2Output(BaseModel):
    graph_structure: GraphStructure
    taxonomy_mapping: TaxonomyMapping
    vector_db_payload: VectorDBPayload


# ==========================================
# PHASE 3: Multi-Agent Content Engine
# ==========================================

class NormalizedSpecification(BaseModel):
    attribute_name: str
    original_value: str
    metric_value: Union[str, float, int]
    metric_unit: str
    imperial_value: Union[str, float, int]
    imperial_unit: str

class GapAnalysis(BaseModel):
    completeness_score_percent: float = Field(ge=0.0, le=100.0)
    missing_attributes: List[str] = Field(default_factory=list)
    web_enrichment_queries: List[str] = Field(default_factory=list)

class CommerceAssets(BaseModel):
    seo_short_title: str
    seo_long_title: str
    marketing_description: str
    feature_bullets: List[str]

class AuditResults(BaseModel):
    hallucination_check: str  # "passed" or "failed"
    unsupported_claims_detected: List[str] = Field(default_factory=list)
    audit_notes: str

class Phase3Output(BaseModel):
    normalized_specifications: List[NormalizedSpecification]
    gap_analysis: GapAnalysis
    commerce_assets: CommerceAssets
    audit_results: AuditResults


# ==========================================
# PHASE 4: Traceability & Compliance Audit
# ==========================================

class TraceabilityEntry(BaseModel):
    attribute: str
    final_value: Union[str, float, int]
    source_type: str  # "PDF_TEXT" | "IMAGE_VLM" | "WEB_SEARCH" | "INFERRED"
    provenance_citation: str
    verification_status: str  # "VERIFIED" | "UNVERIFIED" | "CONTRADICTED"

class Contradiction(BaseModel):
    attribute: str
    issue_description: str

class QualityAndRiskMetrics(BaseModel):
    overall_quality_score: float = Field(ge=0.0, le=100.0)
    risk_level: str  # "LOW" | "MEDIUM" | "HIGH"
    contradictions_found: List[Contradiction] = Field(default_factory=list)
    missing_compliance_certs: List[str] = Field(default_factory=list)

class HITLRouting(BaseModel):
    requires_human_review: bool
    hitl_priority: str  # "AUTO_APPROVED" | "NEEDS_REVIEW" | "CRITICAL_OVERRIDE"
    human_action_items: List[str] = Field(default_factory=list)

class Phase4Output(BaseModel):
    traceability_matrix: List[TraceabilityEntry]
    quality_and_risk_metrics: QualityAndRiskMetrics
    hitl_routing: HITLRouting


# ==========================================
# PHASE 5: PIM Export & UI Workbench
# ==========================================

class PIMExportPayload(BaseModel):
    identifier: str
    family: str
    categories: List[str]
    enabled: bool
    values: Dict[str, Any]

class SpecificationTabItem(BaseModel):
    attribute_key: str
    raw_value: str
    normalized_value: str
    status: str  # "APPROVED" | "WARNING" | "FLAGGED"

class UIGraphNode(BaseModel):
    id: str
    label: str
    group: str

class UIGraphEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    label: str

    class Config:
        populate_by_name = True

class KnowledgeGraphTab(BaseModel):
    nodes: List[UIGraphNode]
    edges: List[UIGraphEdge]

class CommercePreviewTab(BaseModel):
    pdp_title: str
    pdp_bullets: List[str]
    pdp_description: str
    spec_summary_table: Dict[str, Any]

class FlaggedFieldItem(BaseModel):
    field: str
    current_value: str
    reason: str
    action_required: str

class AuditWorkbenchTab(BaseModel):
    flagged_fields: List[FlaggedFieldItem]

class UIStatePayload(BaseModel):
    specifications_tab: List[SpecificationTabItem]
    knowledge_graph_tab: KnowledgeGraphTab
    commerce_preview_tab: CommercePreviewTab
    audit_workbench_tab: AuditWorkbenchTab

class SyndicationStatus(BaseModel):
    publish_state: str  # "AUTO_PUBLISHED" | "PENDING_HUMAN_APPROVAL" | "REJECTED"
    target_channel: str
    webhook_event: str

class Phase5Output(BaseModel):
    pim_export_payload: PIMExportPayload
    ui_state_payload: UIStatePayload
    syndication_status: SyndicationStatus
