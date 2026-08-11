"""
Phase 2: Knowledge Graph & Hybrid RAG Construction Agent.
Consumes Phase 1 output JSON and builds:
1. Neo4j Cypher queries using MERGE idempotency & node/edge relationships.
2. Industrial Taxonomy (UNSPSC & ETIM) mappings & standardized attribute keys.
3. Hybrid RAG vector database search chunks and metadata payloads.
"""

from typing import Dict, Any, List
from pipeline.schema import (
    Phase1Output, Phase2Output, GraphStructure, GraphNode, GraphRelationship,
    TaxonomyMapping, UnspscMapping, EtimMapping, StandardizedAttributes,
    VectorDBPayload, FilterableMetadata
)


class Phase2GraphRAGAgent:
    """Phase 2 Knowledge Graph & Vector RAG Generator Agent."""

    TAXONOMY_MAP = {
        "industrial control valves": {
            "unspsc": {"code": "40141600", "title": "Industrial Valves"},
            "etim": {"class_id": "EC011832", "class_name": "Hydraulic Directional Control Valve"},
        },
        "electric motors": {
            "unspsc": {"code": "26101100", "title": "Electric Motors"},
            "etim": {"class_id": "EC001851", "class_name": "Electric Motor / AC Motor"},
        },
        "bearings": {
            "unspsc": {"code": "31171504", "title": "Ball Bearings"},
            "etim": {"class_id": "EC000412", "class_name": "Deep Groove Ball Bearing"},
        },
        "pressure sensors": {
            "unspsc": {"code": "41111926", "title": "Pressure Transmitters"},
            "etim": {"class_id": "EC001099", "class_name": "Pressure Sensor / Transmitter"},
        }
    }

    KEY_STANDARDIZATIONS = {
        "operating temperature": "EC_OPERATING_TEMPERATURE",
        "working temperature": "EC_OPERATING_TEMPERATURE",
        "temp range": "EC_OPERATING_TEMPERATURE",
        "operating pressure": "EC_OPERATING_PRESSURE",
        "max pressure": "EC_MAX_PRESSURE",
        "working pressure": "EC_OPERATING_PRESSURE",
        "supply voltage": "EC_VOLTAGE_RATING",
        "voltage": "EC_VOLTAGE_RATING",
        "body material": "EC_HOUSING_MATERIAL",
        "material": "EC_HOUSING_MATERIAL",
        "flow rate": "EC_NOMINAL_FLOW_RATE",
        "thread size": "EC_THREAD_SIZE",
        "port diameter": "EC_PORT_SIZE"
    }

    def process(self, phase1_data: Phase1Output) -> Phase2Output:
        """Process Phase 1 output into Knowledge Graph, Taxonomy, and RAG payloads."""
        brand = phase1_data.product_metadata.brand.value or "UnknownBrand"
        part_no = phase1_data.product_metadata.part_number.value or "UnknownSKU"
        prod_name = phase1_data.product_metadata.product_name.value or f"{brand} {part_no}"
        category = phase1_data.product_metadata.category_guess.value or "Industrial Equipment"

        prod_id = f"PROD_{part_no.replace(' ', '_').replace('-', '_')}"
        brand_id = f"BRAND_{brand.replace(' ', '_')}"
        cat_id = f"CAT_{category.replace(' ', '_')}"

        nodes_map: Dict[str, GraphNode] = {}
        relationships: List[GraphRelationship] = []
        cypher_queries: List[str] = []

        # 1. Primary Nodes
        nodes_map[prod_id] = GraphNode(
            id=prod_id,
            label="Product",
            properties={"part_number": part_no, "name": prod_name}
        )
        cypher_queries.append(
            f"MERGE (p:Product {{id: '{prod_id}'}}) SET p.part_number = '{part_no}', p.name = '{prod_name}'"
        )

        nodes_map[brand_id] = GraphNode(
            id=brand_id,
            label="Brand",
            properties={"name": brand}
        )
        cypher_queries.append(
            f"MERGE (b:Brand {{id: '{brand_id}'}}) SET b.name = '{brand}'"
        )

        nodes_map[cat_id] = GraphNode(
            id=cat_id,
            label="Category",
            properties={"name": category}
        )
        cypher_queries.append(
            f"MERGE (c:Category {{id: '{cat_id}'}}) SET c.name = '{category}'"
        )

        # Edges for Brand & Category
        relationships.append(GraphRelationship(
            from_=prod_id, to=brand_id, type="MANUFACTURED_BY", properties={}
        ))
        cypher_queries.append(
            f"MATCH (p:Product {{id: '{prod_id}'}}), (b:Brand {{id: '{brand_id}'}}) MERGE (p)-[:MANUFACTURED_BY]->(b)"
        )

        relationships.append(GraphRelationship(
            from_=prod_id, to=cat_id, type="BELONGS_TO", properties={}
        ))
        cypher_queries.append(
            f"MATCH (p:Product {{id: '{prod_id}'}}), (c:Category {{id: '{cat_id}'}}) MERGE (p)-[:BELONGS_TO]->(c)"
        )

        # 2. SpecAttributes & Units
        for attr in phase1_data.technical_attributes:
            attr_slug = attr.attribute_name.replace(' ', '_').lower()
            attr_node_id = f"SPEC_{prod_id}_{attr_slug}"
            
            nodes_map[attr_node_id] = GraphNode(
                id=attr_node_id,
                label="SpecAttribute",
                properties={
                    "name": attr.attribute_name,
                    "raw_value": str(attr.raw_value),
                    "normalized_value": str(attr.normalized_value)
                }
            )
            cypher_queries.append(
                f"MERGE (s:SpecAttribute {{id: '{attr_node_id}'}}) SET s.name = '{attr.attribute_name}', s.normalized_value = '{attr.normalized_value}'"
            )

            relationships.append(GraphRelationship(
                from_=prod_id, to=attr_node_id, type="HAS_SPECIFICATION", properties={"confidence": attr.confidence}
            ))
            cypher_queries.append(
                f"MATCH (p:Product {{id: '{prod_id}'}}), (s:SpecAttribute {{id: '{attr_node_id}'}}) MERGE (p)-[:HAS_SPECIFICATION {{confidence: {attr.confidence}}}]->(s)"
            )

            if attr.normalized_unit:
                uom_node_id = f"UOM_{attr.normalized_unit.upper()}"
                if uom_node_id not in nodes_map:
                    nodes_map[uom_node_id] = GraphNode(
                        id=uom_node_id,
                        label="UnitOfMeasure",
                        properties={"unit": attr.normalized_unit}
                    )
                    cypher_queries.append(
                        f"MERGE (u:UnitOfMeasure {{id: '{uom_node_id}'}}) SET u.unit = '{attr.normalized_unit}'"
                    )

                relationships.append(GraphRelationship(
                    from_=attr_node_id, to=uom_node_id, type="USES_UOM", properties={}
                ))
                cypher_queries.append(
                    f"MATCH (s:SpecAttribute {{id: '{attr_node_id}'}}), (u:UnitOfMeasure {{id: '{uom_node_id}'}}) MERGE (s)-[:USES_UOM]->(u)"
                )

        # 3. CompatiblePart node link
        compat_sku = f"{part_no}-ACC"
        compat_id = f"PROD_{compat_sku.replace(' ', '_').replace('-', '_')}"
        nodes_map[compat_id] = GraphNode(
            id=compat_id,
            label="CompatiblePart",
            properties={"part_number": compat_sku, "relation": "Accessory/Sub-assembly"}
        )
        cypher_queries.append(
            f"MERGE (cp:Product {{id: '{compat_id}'}}) SET cp.part_number = '{compat_sku}'"
        )
        relationships.append(GraphRelationship(
            from_=prod_id, to=compat_id, type="COMPATIBLE_WITH", properties={"confidence": 0.85}
        ))
        cypher_queries.append(
            f"MATCH (p:Product {{id: '{prod_id}'}}), (cp:Product {{id: '{compat_id}'}}) MERGE (p)-[:COMPATIBLE_WITH {{confidence: 0.85}}]->(cp)"
        )

        nodes_list = list(nodes_map.values())
        graph_structure = GraphStructure(
            cypher_queries=cypher_queries,
            nodes=nodes_list,
            relationships=relationships
        )

        # 4. Taxonomy Standardization
        cat_lower = category.lower()
        tax_info = self.TAXONOMY_MAP.get(cat_lower, {
            "unspsc": {"code": "40140000", "title": "Fluid Flow & Distribution Devices"},
            "etim": {"class_id": "EC000000", "class_name": "Generic Industrial Component"}
        })

        unspsc = UnspscMapping(**tax_info["unspsc"])
        etim = EtimMapping(**tax_info["etim"])

        std_attr_pairs = {}
        for attr in phase1_data.technical_attributes:
            key_lower = attr.attribute_name.lower().strip()
            std_key = self.KEY_STANDARDIZATIONS.get(key_lower, f"EC_{key_lower.replace(' ', '_').upper()}")
            std_attr_pairs[std_key] = f"{attr.normalized_value} {attr.normalized_unit}".strip()

        taxonomy_mapping = TaxonomyMapping(
            unspsc=unspsc,
            etim=etim,
            standardized_attributes=StandardizedAttributes(key_value_pairs=std_attr_pairs)
        )

        # 5. Vector RAG Payload
        spec_summary = ", ".join([f"{a.attribute_name}: {a.normalized_value} {a.normalized_unit}".strip() for a in phase1_data.technical_attributes])
        chunk_text = (
            f"Product: {prod_name} | Brand: {brand} | Part Number: {part_no} | "
            f"Category: {category} (UNSPSC: {unspsc.code} - {unspsc.title}, ETIM: {etim.class_id}) | "
            f"Technical Specifications: {spec_summary}. Visual labels: {', '.join(phase1_data.visual_insights.labels_detected)}."
        )

        filterable_meta = FilterableMetadata(
            brand=brand,
            part_number=part_no,
            category=category,
            spec_filters={a.attribute_name: a.normalized_value for a in phase1_data.technical_attributes}
        )

        vector_db_payload = VectorDBPayload(
            searchable_chunk_text=chunk_text,
            filterable_metadata=filterable_meta
        )

        return Phase2Output(
            graph_structure=graph_structure,
            taxonomy_mapping=taxonomy_mapping,
            vector_db_payload=vector_db_payload
        )
