import React, { useState, useMemo } from 'react';
import {
  Activity, Database, Cpu, ShieldCheck, Share2, Layers, Download, Copy,
  CheckCircle2, AlertTriangle, XCircle, Search, FileText, Image as ImageIcon,
  Tag, Compass, ArrowRight, ExternalLink, RefreshCw, Eye, Sparkles, Code,
  Globe, Check, Zap, HelpCircle, Layers3, Filter, AlertCircle, Play, Sliders,
  UserCheck, Lock, Unlock, CheckSquare, Wrench, User, ShieldAlert, PlusCircle, Send,
  LogOut, LogIn, Key, CheckSquare2, Upload, FileUp, Building2, ChevronDown, Bot
} from 'lucide-react';

import rexrothValves from '../datasets/rexroth_hydraulic_valves.json';
import abbMotors from '../datasets/abb_electric_motors.json';
import danfossSensors from '../datasets/danfoss_pressure_sensors.json';
import skfBearings from '../datasets/skf_bearing_catalog.json';
import siemensPlcs from '../datasets/siemens_automation_plcs.json';

const ALL_INITIAL_PRODUCTS = [
  ...rexrothValves,
  ...abbMotors,
  ...danfossSensors,
  ...skfBearings,
  ...siemensPlcs
];

export default function App() {
  const [authenticatedUser, setAuthenticatedUser] = useState(null); // null | user | admin
  const [allProducts, setAllProducts] = useState(ALL_INITIAL_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState(ALL_INITIAL_PRODUCTS[0]);
  
  const [activeTab, setActiveTab] = useState('phase1');
  const [unitMode, setUnitMode] = useState('metric');
  const [manualApprovalState, setManualApprovalState] = useState({});
  const [resolvedConflicts, setResolvedConflicts] = useState({});
  const [targetChannel, setTargetChannel] = useState('akeneo');
  const [copiedJson, setCopiedJson] = useState(false);
  
  // AI Web Crawl Agent Simulation State
  const [crawlingState, setCrawlingState] = useState({}); // productId -> boolean
  const [crawledGaps, setCrawledGaps] = useState({}); // productId -> list of retrieved specs

  // File Upload Modal State
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newSeries, setNewSeries] = useState('');
  const [newCategory, setNewCategory] = useState('Industrial Control Valves');
  const [newPressureVal, setNewPressureVal] = useState('250');
  const [newTempMinVal, setNewTempMinVal] = useState('-20');
  const [newTempMaxVal, setNewTempMaxVal] = useState('80');
  const [newVoltageVal, setNewVoltageVal] = useState('24 VDC');
  const [newBodyMaterial, setNewBodyMaterial] = useState('Stainless Steel 316L');

  // Filtered Products for Search Bar & Company Dropdown
  const filteredProducts = useMemo(() => {
    return allProducts.filter(p => {
      const matchCompany = companyFilter === 'ALL' || (p.company || p.brand).toLowerCase().includes(companyFilter.toLowerCase());
      const query = searchQuery.toLowerCase().trim();
      const matchQuery = !query ||
        p.brand.toLowerCase().includes(query) ||
        p.part_number.toLowerCase().includes(query) ||
        p.product_name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query);
      return matchCompany && matchQuery;
    });
  }, [allProducts, searchQuery, companyFilter]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const fileContent = event.target.result;
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(fileContent);
          const importedProd = Array.isArray(parsed) ? parsed[0] : parsed;
          if (importedProd.brand) setNewBrand(importedProd.brand);
          if (importedProd.part_number) setNewPartNumber(importedProd.part_number);
          if (importedProd.category) setNewCategory(importedProd.category);
          alert(`Successfully loaded dataset file: ${file.name}`);
        } else {
          alert(`File '${file.name}' attached! Auto-filling metadata.`);
          if (!newBrand) setNewBrand('Uploaded Brand');
          if (!newPartNumber) setNewPartNumber(`FILE-SKU-${Math.floor(Math.random()*1000)}`);
        }
      } catch (err) {
        alert("Error reading dataset file.");
      }
    };
    reader.readAsText(file);
  };

  const handleCreateSubmission = (e) => {
    e.preventDefault();
    if (!newBrand || !newPartNumber) return;

    const newProd = {
      id: `uploaded-${Date.now()}`,
      company: newBrand,
      brand: newBrand,
      part_number: newPartNumber,
      product_name: `${newBrand} ${newPartNumber} ${newSeries}`.trim(),
      series: newSeries || 'Custom Series',
      category: newCategory,
      text_datasheet: `Brand: ${newBrand}\nPart Number: ${newPartNumber}\nCategory: ${newCategory}\nPressure: ${newPressureVal} bar\nTemp: ${newTempMinVal} to ${newTempMaxVal} °C`,
      attributes: [
        { attribute_name: "Operating Pressure", raw_value: `${newPressureVal} bar`, norm_value: parseFloat(newPressureVal) || 100, norm_unit: "bar", confidence: 0.98, source_evidence: `Uploaded File: ${uploadFileName || 'Engineer Submission'}` },
        { attribute_name: "Min Operating Temp", raw_value: `${newTempMinVal} °C`, norm_value: parseFloat(newTempMinVal) || -20, norm_unit: "°C", confidence: 0.95, source_evidence: `Uploaded File: ${uploadFileName || 'Engineer Submission'}` },
        { attribute_name: "Max Operating Temp", raw_value: `${newTempMaxVal} °C`, norm_value: parseFloat(newTempMaxVal) || 80, norm_unit: "°C", confidence: 0.95, source_evidence: `Uploaded File: ${uploadFileName || 'Engineer Submission'}` },
        { attribute_name: "Supply Voltage", raw_value: newVoltageVal, norm_value: parseFloat(newVoltageVal) || 24, norm_unit: "V", confidence: 0.99, source_evidence: `Uploaded File: ${uploadFileName || 'Engineer Submission'}` },
        { attribute_name: "Body Material", raw_value: newBodyMaterial, norm_value: newBodyMaterial, norm_unit: "", confidence: 0.96, source_evidence: `Uploaded File: ${uploadFileName || 'Engineer Submission'}` }
      ],
      visual_context: {
        schematic_dimensions_found: true,
        labels_detected: ["CE", "RoHS"],
        visual_notes: `Parsed from uploaded file: ${uploadFileName || 'Engineer Portal'}`
      },
      has_conflict: false,
      missing_critical: []
    };

    setAllProducts(prev => [newProd, ...prev]);
    setSelectedProduct(newProd);
    setShowSubmissionForm(false);
    setUploadFileName('');

    alert(`Product ${newPartNumber} submitted successfully! Status set to PENDING_HUMAN_APPROVAL. A Compliance Admin must sign off.`);
  };

  const runAiCrawlAgent = (pid) => {
    setCrawlingState(prev => ({ ...prev, [pid]: true }));
    setTimeout(() => {
      setCrawlingState(prev => ({ ...prev, [pid]: false }));
      setCrawledGaps(prev => ({ ...prev, [pid]: true }));
      alert(`AI Web Crawling Agent completed! Retrieved ATEX Certificate #EX-2026-9918 and updated ETIM taxonomy.`);
    }, 2000);
  };

  const handleLogin = (role, name, email) => {
    setAuthenticatedUser({ role, name, email });
    if (role === 'user') setActiveTab('phase1');
    if (role === 'admin') setActiveTab('phase4');
  };

  const handleLogout = () => {
    setAuthenticatedUser(null);
  };

  // Compute Pipeline Data cleanly with zero undefined values
  const computePipelineData = (p) => {
    const isConflictActive = p.has_conflict && !resolvedConflicts[p.id];
    const isManuallyApproved = manualApprovalState[p.id] === true;
    const isCrawled = crawledGaps[p.id] === true;

    // Phase 1
    const p1 = {
      product_metadata: {
        brand: { value: p.brand, confidence: 0.98, source_evidence: `Company Header: '${p.company || p.brand}'` },
        part_number: { value: p.part_number, confidence: 0.99, source_evidence: `Spec Table Row 1: '${p.part_number}'` },
        product_name: { value: p.product_name || p.name, confidence: 0.95, source_evidence: `Document Title` },
        category_guess: { value: p.category, confidence: 0.90, source_evidence: `Classified Taxonomy` }
      },
      technical_attributes: p.attributes.map(a => {
        let normV = a.norm_value !== undefined ? a.norm_value : a.raw_value;
        let normU = a.norm_unit !== undefined ? a.norm_unit : '';

        if (p.id === 'danfoss-mbs-3000' && resolvedConflicts[p.id]) {
          if (a.attribute_name === 'Min Operating Temp') normV = -20;
          if (a.attribute_name === 'Max Operating Temp') normV = 85;
        }

        return {
          attribute_name: a.attribute_name,
          raw_value: a.raw_value,
          normalized_value: normV,
          normalized_unit: normU,
          confidence: a.confidence || 0.95,
          source_evidence: a.source_evidence || 'Datasheet Table'
        };
      }),
      visual_insights: {
        schematic_dimensions_found: true,
        labels_detected: isCrawled ? [...p.visual_context.labels_detected, 'ATEX EX-Zone1'] : p.visual_context.labels_detected,
        visual_notes: p.visual_context.visual_notes
      },
      enrichment_status: {
        is_data_complete: isCrawled || p.missing_critical.length === 0,
        missing_critical_attributes: isCrawled ? [] : p.missing_critical,
        requires_web_crawl: !isCrawled && p.missing_critical.length > 0
      }
    };

    // Phase 2
    const safeSku = p.part_number.replace(/[^a-zA-Z0-9]/g, '_');
    const prodId = `PROD_${safeSku}`;
    const brandId = `BRAND_${p.brand.replace(/\s+/g, '_')}`;
    const catId = `CAT_${p.category.replace(/\s+/g, '_')}`;

    const nodes = [
      { id: prodId, label: p.product_name || p.name, group: 'Product' },
      { id: brandId, label: p.brand, group: 'Brand' },
      { id: catId, label: p.category, group: 'Category' }
    ];

    p1.technical_attributes.forEach((a, i) => {
      nodes.push({
        id: `SPEC_${i}`,
        label: `${a.attribute_name}: ${a.normalized_value} ${a.normalized_unit}`.trim(),
        group: 'SpecAttribute'
      });
    });

    const edges = [
      { from: prodId, to: brandId, label: 'MANUFACTURED_BY' },
      { from: prodId, to: catId, label: 'BELONGS_TO' }
    ];
    p1.technical_attributes.forEach((a, i) => {
      edges.push({ from: prodId, to: `SPEC_${i}`, label: 'HAS_SPECIFICATION' });
    });

    const cypherQueries = [
      `MERGE (p:Product {id: '${prodId}'}) SET p.part_number = '${p.part_number}'`,
      `MERGE (b:Brand {id: '${brandId}'}) SET b.name = '${p.brand}'`,
      `MERGE (c:Category {id: '${catId}'}) SET c.name = '${p.category}'`,
      `MATCH (p:Product {id: '${prodId}'}), (b:Brand {id: '${brandId}'}) MERGE (p)-[:MANUFACTURED_BY]->(b)`,
      `MATCH (p:Product {id: '${prodId}'}), (c:Category {id: '${catId}'}) MERGE (p)-[:BELONGS_TO]->(c)`
    ];

    const unspscCode = p.category === 'Industrial Control Valves' ? '40141600' : (p.category === 'Electric Motors' ? '26101100' : (p.category === 'Bearings' ? '31171504' : (p.category === 'Programmable Logic Controllers' ? '32151705' : '41111926')));
    const etimCode = p.category === 'Industrial Control Valves' ? 'EC011832' : (p.category === 'Electric Motors' ? 'EC001851' : (p.category === 'Bearings' ? 'EC000412' : (p.category === 'Programmable Logic Controllers' ? 'EC000236' : 'EC001099')));

    const p2 = {
      graph_structure: { cypher_queries: cypherQueries, nodes, relationships: edges },
      taxonomy_mapping: {
        unspsc: { code: unspscCode, title: p.category },
        etim: { class_id: etimCode, class_name: `${p.category} Class` },
        standardized_attributes: {
          key_value_pairs: p1.technical_attributes.reduce((acc, a) => {
            acc[`EC_${a.attribute_name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] = `${a.normalized_value} ${a.normalized_unit}`.trim();
            return acc;
          }, {})
        }
      },
      vector_db_payload: {
        searchable_chunk_text: `Company: ${p.company || p.brand} | Product: ${p.product_name || p.name} | SKU: ${p.part_number} | Category: ${p.category} | UNSPSC: ${unspscCode} | ETIM: ${etimCode}. Specs: ${p1.technical_attributes.map(a => `${a.attribute_name}: ${a.normalized_value} ${a.normalized_unit}`).join(', ')}. Certs: ${p1.visual_insights.labels_detected.join(', ')}.`,
        filterable_metadata: { company: p.company || p.brand, brand: p.brand, part_number: p.part_number, category: p.category }
      }
    };

    // Phase 3 - Clean Imperial / Metric calculations
    const dualSpecs = p1.technical_attributes.map(a => {
      const valNum = typeof a.normalized_value === 'number' ? a.normalized_value : parseFloat(a.normalized_value);
      let impVal = a.normalized_value;
      let impUnit = a.normalized_unit;

      if (!isNaN(valNum)) {
        if (a.normalized_unit === 'bar') { impVal = (valNum * 14.5038).toFixed(1); impUnit = 'PSI'; }
        else if (a.normalized_unit === 'mm') { impVal = (valNum / 25.4).toFixed(2); impUnit = 'in'; }
        else if (a.normalized_unit === '°C') { impVal = ((valNum * 9/5) + 32).toFixed(1); impUnit = '°F'; }
        else if (a.normalized_unit === 'kg') { impVal = (valNum * 2.20462).toFixed(1); impUnit = 'lbs'; }
        else if (a.normalized_unit === 'kW') { impVal = (valNum * 1.34102).toFixed(1); impUnit = 'HP'; }
        else if (a.normalized_unit === 'L/min') { impVal = (valNum * 0.264172).toFixed(1); impUnit = 'GPM'; }
      }

      return {
        attribute_name: a.attribute_name,
        original_value: a.raw_value,
        metric_value: a.normalized_value,
        metric_unit: a.normalized_unit,
        imperial_value: impVal,
        imperial_unit: impUnit
      };
    });

    const shortTitle = `${p.brand} ${p.part_number} ${p.category}`.slice(0, 80);
    const longTitle = `${p.brand} ${p.part_number} ${p.product_name || p.name} ${p.category} Spec`.slice(0, 150);

    const p3 = {
      normalized_specifications: dualSpecs,
      gap_analysis: {
        completeness_score_percent: (isCrawled || p.missing_critical.length === 0) ? 100.0 : 75.0,
        missing_attributes: isCrawled ? [] : p.missing_critical,
        web_enrichment_queries: isCrawled ? [] : p.missing_critical.map(m => `"${p.brand}" "${p.part_number}" ${m} datasheet pdf`)
      },
      commerce_assets: {
        seo_short_title: shortTitle,
        seo_long_title: longTitle,
        marketing_description: `The ${p.brand} ${p.part_number} is an industrial ${p.category} manufactured by ${p.company || p.brand} for automated catalog operations. ETIM Class ${etimCode} and UNSPSC ${unspscCode}.`,
        feature_bullets: [
          `Original ${p.brand} part ${p.part_number} for reliable ${p.category} operation.`,
          `Taxonomy alignment: UNSPSC ${unspscCode} and ETIM ${etimCode}.`,
          `Dual Imperial & Metric unit standardized parameters.`,
          `Visual certifications confirmed: ${p1.visual_insights.labels_detected.join(', ')}.`
        ]
      },
      audit_results: {
        hallucination_check: isConflictActive ? "failed" : "passed",
        unsupported_claims_detected: isConflictActive ? ["Operating temperature range contradiction detected in source datasheet"] : [],
        audit_notes: isConflictActive ? "Conflict found: Min Operating Temp (90°C) exceeds Max Temp (40°C)." : "Zero hallucinations. All marketing claims grounded in source facts."
      }
    };

    // Phase 4
    const contradictionsFound = isConflictActive ? [
      { attribute: "Operating Temperature Range", issue_description: "Physical contradiction: Min Temp (90°C) exceeds Max Temp (40°C)." }
    ] : [];

    const missingCerts = (!isCrawled && isConflictActive && p.missing_critical.length > 0) ? ["ATEX"] : [];

    let hitlPriority = "NEEDS_REVIEW";
    let requiresHuman = true;

    if (isConflictActive) {
      hitlPriority = "CRITICAL_OVERRIDE";
      requiresHuman = true;
    } else if (isManuallyApproved) {
      hitlPriority = "AUTO_APPROVED";
      requiresHuman = false;
    } else {
      hitlPriority = "NEEDS_REVIEW";
      requiresHuman = true;
    }

    const p4 = {
      traceability_matrix: p1.technical_attributes.map(a => ({
        attribute: a.attribute_name,
        final_value: `${a.normalized_value} ${a.normalized_unit}`.trim(),
        source_type: "PDF_TEXT",
        provenance_citation: a.source_evidence,
        verification_status: (isConflictActive && a.attribute_name.includes("Temp")) ? "CONTRADICTED" : "VERIFIED"
      })),
      quality_and_risk_metrics: {
        overall_quality_score: isConflictActive ? 45.0 : 98.5,
        risk_level: isConflictActive ? "HIGH" : "LOW",
        contradictions_found: contradictionsFound,
        missing_compliance_certs: missingCerts
      },
      hitl_routing: {
        requires_human_review: requiresHuman,
        hitl_priority: hitlPriority,
        human_action_items: isConflictActive ? [
          "[CRITICAL CONFLICT] Resolve Min Temp (90°C) vs Max Temp (40°C) mismatch.",
          "[REGULATORY GAP] Upload ATEX certificate documentation."
        ] : (requiresHuman ? ["[GOVERNANCE MANDATE] Compliance Admin sign-off required prior to PIM syndication."] : [])
      }
    };

    // Phase 5
    const pubState = hitlPriority === "AUTO_APPROVED" ? "AUTO_PUBLISHED" : (hitlPriority === "NEEDS_REVIEW" ? "PENDING_HUMAN_APPROVAL" : "REJECTED");
    const webhookEvt = `product.${pubState.toLowerCase()}`;

    const pimValues = {
      company: { data: p.company || p.brand, locale: null },
      brand: { data: p.brand, locale: null },
      part_number: { data: p.part_number, locale: null }
    };
    dualSpecs.forEach(s => {
      const cleanKey = s.attribute_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      pimValues[cleanKey] = {
        values: {
          en_US: s.imperial_unit ? `${s.imperial_value} ${s.imperial_unit}` : `${s.imperial_value}`,
          en_EU: s.metric_unit ? `${s.metric_value} ${s.metric_unit}` : `${s.metric_value}`
        }
      };
    });

    const p5 = {
      pim_export_payload: {
        identifier: p.part_number,
        family: `${p.category} Class`,
        categories: [p.category],
        enabled: pubState === "AUTO_PUBLISHED",
        values: pimValues
      },
      syndication_status: {
        publish_state: pubState,
        target_channel: `${targetChannel.toUpperCase()} Syndication`,
        webhook_event: webhookEvt
      }
    };

    return { phase1: p1, phase2: p2, phase3: p3, phase4: p4, phase5: p5, isManuallyApproved, isConflictActive, isCrawled };
  };

  const pipeline = computePipelineData(selectedProduct);

  const toggleAdminApproval = (pid) => {
    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
      alert("Permission Denied: Only a Compliance Lead / Admin can sign off and syndicate products!");
      return;
    }
    if (pipeline.isConflictActive) {
      alert("Cannot approve product with unresolved physical contradictions! Click 'Resolve Contradiction' first.");
      return;
    }
    setManualApprovalState(prev => ({ ...prev, [pid]: !prev[pid] }));
  };

  const resolveConflict = (pid) => {
    if (!authenticatedUser || authenticatedUser.role !== 'admin') {
      alert("Permission Denied: Only a Compliance Lead / Admin can resolve datasheet contradictions!");
      return;
    }
    setResolvedConflicts(prev => ({ ...prev, [pid]: true }));
  };

  const copyToClipboard = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // LOGIN SCREEN
  if (!authenticatedUser) {
    return (
      <div className="min-h-screen bg-[#070A10] text-slate-100 flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="glass-panel max-w-md w-full p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl relative z-10">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-2xl text-white shadow-lg shadow-blue-500/20 mb-2">
              <Layers3 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-extrabold bg-gradient-to-r from-blue-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
              Industrial PIM & Governance Studio
            </h1>
            <p className="text-xs text-slate-400">Enterprise Role-Based Authentication Portal</p>
          </div>

          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold text-slate-400 block text-center uppercase tracking-wider">Select Demo Role Account</span>
            
            <button
              onClick={() => handleLogin('user', 'Alex Rivera', 'alex.rivera@antigravity.io')}
              className="w-full p-4 bg-slate-900/90 hover:bg-slate-800/80 border border-slate-700/80 rounded-2xl text-left flex items-center justify-between transition-all group hover:border-indigo-500/50 shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-200 group-hover:text-indigo-300">Catalog Engineer (User Portal)</div>
                  <div className="text-[11px] text-slate-400">Upload dataset files & submit for review</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => handleLogin('admin', 'Sarah Jenkins', 'sarah.jenkins@antigravity.io')}
              className="w-full p-4 bg-slate-900/90 hover:bg-slate-800/80 border border-slate-700/80 rounded-2xl text-left flex items-center justify-between transition-all group hover:border-amber-500/50 shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-200 group-hover:text-amber-300">Compliance Lead (Admin Portal)</div>
                  <div className="text-[11px] text-slate-400">Inspect conflicts, audit & syndicate</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="text-[11px] text-slate-500 text-center border-t border-slate-800/80 pt-4">
            Protected by 100% Human-in-the-Loop (HITL) Data Governance
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = authenticatedUser.role === 'admin';

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col font-sans">
      
      {/* CREATIVE CLEAN HEADER BAR (NO CROWDED BUTTONS) */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-xl text-white shadow-lg shadow-blue-500/20">
            <Layers3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100">
                {isAdmin ? 'Compliance Lead & PIM Syndication Portal' : 'Catalog Engineer Ingestion Portal'}
              </h1>
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold border ${
                isAdmin ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
              }`}>
                {isAdmin ? 'ADMIN PORTAL' : 'ENGINEER PORTAL'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Signed in as: <strong className="text-slate-200">{authenticatedUser.name}</strong></p>
          </div>
        </div>

        {/* CREATIVE CATALOG SEARCH BAR & FILTERS */}
        <div className="flex items-center gap-3 flex-1 max-w-2xl mx-6">
          
          {/* Real-Time Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search SKUs, brands, models, or attributes (e.g. 4WE6, ABB, 11 kW)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Company Dropdown Filter */}
          <div className="relative">
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 font-semibold cursor-pointer focus:outline-none"
            >
              <option value="ALL">All Companies</option>
              <option value="Bosch Rexroth">Bosch Rexroth</option>
              <option value="ABB">ABB Motors</option>
              <option value="Danfoss">Danfoss</option>
              <option value="SKF">SKF Group</option>
              <option value="Siemens">Siemens AG</option>
            </select>
          </div>

          {/* Product Match Dropdown */}
          <div className="relative">
            <select
              value={selectedProduct.id}
              onChange={e => {
                const found = allProducts.find(p => p.id === e.target.value);
                if (found) setSelectedProduct(found);
              }}
              className="bg-blue-900/40 border border-blue-500/30 rounded-xl px-3 py-1.5 text-xs font-bold text-blue-300 cursor-pointer focus:outline-none"
            >
              {filteredProducts.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.brand} - {p.part_number}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          
          {!isAdmin && (
            <button
              onClick={() => setShowSubmissionForm(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/20"
            >
              <Upload className="w-4 h-4" />
              Ingest File
            </button>
          )}

          {/* SI Metric / Imperial Unit Mode */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setUnitMode('metric')}
              className={`px-2.5 py-1 rounded-lg transition-all ${unitMode === 'metric' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Metric
            </button>
            <button
              onClick={() => setUnitMode('imperial')}
              className={`px-2.5 py-1 rounded-lg transition-all ${unitMode === 'imperial' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Imperial
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 rounded-xl transition-all"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Structured User File Ingestion Modal */}
      {showSubmissionForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-2xl w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileUp className="w-5 h-5 text-blue-400" />
                Ingest Datasheet File & Create Catalog Item
              </h3>
              <button onClick={() => setShowSubmissionForm(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <form onSubmit={handleCreateSubmission} className="space-y-4 text-xs">
              <div className="p-4 bg-slate-900/90 border border-dashed border-blue-500/40 rounded-xl space-y-2 text-center">
                <Upload className="w-6 h-6 text-blue-400 mx-auto" />
                <span className="block text-slate-300 font-semibold">Attach Dataset File (.json, .txt, .pdf, .csv)</span>
                <input
                  type="file"
                  accept=".json,.txt,.pdf,.csv"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                />
                {uploadFileName && <span className="text-emerald-400 font-mono block text-[11px]">Attached: {uploadFileName}</span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Company / Manufacturer</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Schneider Electric"
                    value={newBrand}
                    onChange={e => setNewBrand(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Model / Part Number / SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ATV320U15N4C"
                    value={newPartNumber}
                    onChange={e => setNewPartNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Series</label>
                  <input
                    type="text"
                    placeholder="e.g. Altivar 320"
                    value={newSeries}
                    onChange={e => setNewSeries(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Taxonomy Category</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  >
                    <option value="Industrial Control Valves">Industrial Control Valves</option>
                    <option value="Electric Motors">Electric Motors</option>
                    <option value="Pressure Sensors">Pressure Sensors</option>
                    <option value="Bearings">Bearings</option>
                    <option value="Programmable Logic Controllers">Programmable Logic Controllers</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubmissionForm(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  Submit for Admin Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-[1700px] w-full mx-auto p-6 space-y-6">

        {/* HERO GOVERNANCE DASHBOARD BANNER */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Quality Score Card */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catalog Health Score</span>
              <div className="text-3xl font-extrabold text-slate-100 flex items-baseline gap-1">
                {pipeline.phase4.quality_and_risk_metrics.overall_quality_score}%
                <span className="text-xs font-mono text-emerald-400 font-normal">Grade A+</span>
              </div>
              <p className="text-[11px] text-slate-400">Spec Completeness Ratio</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
              {pipeline.phase4.quality_and_risk_metrics.overall_quality_score > 90 ? 'A+' : 'C'}
            </div>
          </div>

          {/* Active User Role Indicator */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Portal Session</span>
              <div className="text-sm font-bold flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-mono border ${
                  isAdmin
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                }`}>
                  {isAdmin ? 'COMPLIANCE ADMIN' : 'CATALOG ENGINEER'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isAdmin ? 'Full Approval & Override Rights' : 'Staged Data Ingestion Mode'}
              </p>
            </div>
            {isAdmin ? (
              <ShieldAlert className="w-8 h-8 text-amber-400/80" />
            ) : (
              <User className="w-8 h-8 text-indigo-400/80" />
            )}
          </div>

          {/* 100% HITL Mandate Card */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Governance Policy</span>
              <div className="text-xs font-bold text-amber-400 font-mono">
                100% HITL MANDATE ACTIVE
              </div>
              <p className="text-[11px] text-slate-400">Compliance Admin Sign-Off Mandatory</p>
            </div>
            <UserCheck className="w-8 h-8 text-amber-400/80" />
          </div>

          {/* Channel Syndication State & Admin Sign-off Control */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Publish State</span>
              <div className="text-sm font-bold flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-mono border ${
                  pipeline.phase5.syndication_status.publish_state === 'AUTO_PUBLISHED'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : (pipeline.phase5.syndication_status.publish_state === 'REJECTED'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30')
                }`}>
                  {pipeline.phase5.syndication_status.publish_state}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">{pipeline.phase5.syndication_status.webhook_event}</p>
            </div>
            
            {isAdmin ? (
              <button
                onClick={() => toggleAdminApproval(selectedProduct.id)}
                disabled={pipeline.isConflictActive}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  pipeline.isConflictActive
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                    : (pipeline.isManuallyApproved
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500')
                }`}
              >
                {pipeline.isManuallyApproved ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {pipeline.isConflictActive ? 'Blocked by Conflict' : (pipeline.isManuallyApproved ? 'Approved' : 'Admin Approve')}
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 italic bg-slate-900 p-2 rounded border border-slate-800">
                Admin Sign-off Required
              </span>
            )}
          </div>

        </div>

        {/* WORKBENCH NAVIGATION TABS */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            {[
              { key: 'phase1', label: 'Phase 1: Specs & SI Normalization', icon: Sliders },
              { key: 'phase2', label: 'Phase 2: Knowledge Graph & RAG', icon: Database },
              { key: 'phase3', label: 'Phase 3: PXM Content Preview', icon: Eye },
              { key: 'phase4', label: 'Phase 4: HITL Traceability & Audit', icon: ShieldCheck },
              { key: 'phase5', label: 'Phase 5: PIM Syndication', icon: Share2 },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-blue-400/30'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* CREATIVE AI WEB CRAWLING SIMULATION BUTTON */}
          <button
            onClick={() => runAiCrawlAgent(selectedProduct.id)}
            disabled={crawlingState[selectedProduct.id]}
            className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
          >
            <Bot className={`w-4 h-4 ${crawlingState[selectedProduct.id] ? 'animate-spin' : ''}`} />
            {crawlingState[selectedProduct.id] ? 'AI Crawling Datasheet...' : 'Run AI Web Crawl Agent'}
          </button>
        </div>

        {/* TAB CONTENTS */}

        {/* PHASE 1: TECHNICAL SPECS & SI NORMALIZATION MATRIX */}
        {activeTab === 'phase1' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-400" />
                  Phase 1: ISO/SI Unit of Measure Normalization & Extraction
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Extracted from <strong className="text-slate-200">{selectedProduct.company || selectedProduct.brand} {selectedProduct.part_number}</strong>
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                {pipeline.phase1.technical_attributes.length} Technical Attributes Parsed
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Attribute Name</th>
                    <th className="p-3.5">Raw Value</th>
                    <th className="p-3.5">SI Metric Value</th>
                    <th className="p-3.5">US Imperial Value</th>
                    <th className="p-3.5">Confidence</th>
                    <th className="p-3.5">Source Evidence Citation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 font-mono">
                  {pipeline.phase3.normalized_specifications.map((s, i) => {
                    const origAttr = pipeline.phase1.technical_attributes[i];
                    return (
                      <tr key={i} className="hover:bg-slate-900/40">
                        <td className="p-3.5 font-sans font-bold text-slate-200">{s.attribute_name}</td>
                        <td className="p-3.5 text-slate-400">{s.original_value}</td>
                        <td className="p-3.5 text-teal-400 font-bold bg-teal-500/5">
                          {s.metric_unit ? `${s.metric_value} ${s.metric_unit}` : `${s.metric_value}`}
                        </td>
                        <td className="p-3.5 text-blue-400 font-bold bg-blue-500/5">
                          {s.imperial_unit ? `${s.imperial_value} ${s.imperial_unit}` : `${s.imperial_value}`}
                        </td>
                        <td className="p-3.5 font-sans">
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full text-[11px] font-bold border border-emerald-500/20">
                            {((origAttr?.confidence || 0.95) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-3.5 font-sans text-slate-400 text-[11px] italic">{origAttr?.source_evidence || 'Datasheet Spec Table'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PHASE 2: KNOWLEDGE GRAPH & CYPHER STUDIO */}
        {activeTab === 'phase2' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Database className="w-5 h-5 text-teal-400" />
                    Knowledge Graph Nodes & Relationships (React Flow Compatible)
                  </h3>
                  <span className="text-xs font-mono text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-full border border-teal-500/20">
                    {pipeline.phase2.graph_structure.nodes.length} Nodes • {pipeline.phase2.graph_structure.relationships.length} Edges
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pipeline.phase2.graph_structure.nodes.map(n => (
                    <div key={n.id} className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-mono text-blue-400 font-bold uppercase">{n.group}</span>
                        <span className="text-slate-500 text-[10px] font-mono">{n.id}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-200">{n.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-teal-400" />
                    Neo4j Cypher MERGE Statements
                  </h3>
                  <button
                    onClick={() => copyToClipboard(pipeline.phase2.graph_structure.cypher_queries)}
                    className="p-1.5 text-xs text-blue-400 hover:bg-blue-500/10 rounded border border-blue-500/20"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-teal-300 space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {pipeline.phase2.graph_structure.cypher_queries.map((q, idx) => (
                    <div key={idx} className="hover:bg-slate-900/60 py-1 px-1.5 rounded">{q};</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 3: PXM PRODUCT DETAIL PAGE PREVIEW */}
        {activeTab === 'phase3' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
                <div className="space-y-2 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{selectedProduct.brand}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs font-mono text-slate-400">SKU: {selectedProduct.part_number}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-teal-400 font-semibold">{selectedProduct.category}</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-100">{pipeline.phase3.commerce_assets.seo_long_title}</h2>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Engineered Technical Parameters</h3>
                    <span className="text-[11px] text-slate-400 font-mono">Displaying: {unitMode === 'metric' ? 'ISO/SI Metric' : 'US Imperial'}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pipeline.phase3.normalized_specifications.map((s, idx) => (
                      <div key={idx} className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-300">{s.attribute_name}</span>
                        <span className="text-xs font-bold font-mono text-teal-300">
                          {unitMode === 'metric' 
                            ? (s.metric_unit ? `${s.metric_value} ${s.metric_unit}` : `${s.metric_value}`)
                            : (s.imperial_unit ? `${s.imperial_value} ${s.imperial_unit}` : `${s.imperial_value}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Key Application Suitability & Features</h3>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {pipeline.phase3.commerce_assets.feature_bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Product Overview</h3>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
                    {pipeline.phase3.commerce_assets.marketing_description}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  SEO Title Constraints & Zero-Hallucination Audit
                </h3>

                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-300">SEO Short Title</span>
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {pipeline.phase3.commerce_assets.seo_short_title.length} / 80 Chars
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-slate-950 p-2 rounded">{pipeline.phase3.commerce_assets.seo_short_title}</div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-300">SEO Long Title</span>
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {pipeline.phase3.commerce_assets.seo_long_title.length} / 150 Chars
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-slate-950 p-2 rounded">{pipeline.phase3.commerce_assets.seo_long_title}</div>
                </div>

                <div className={`p-4 rounded-xl border text-xs space-y-1 ${
                  pipeline.phase3.audit_results.hallucination_check === 'passed'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}>
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Quality Audit Engine Notes
                  </div>
                  <p>{pipeline.phase3.audit_results.audit_notes}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: HITL TRACEABILITY & AUDIT WORKBENCH */}
        {activeTab === 'phase4' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  Human-in-the-Loop (HITL) Traceability & Conflict Resolution
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Audits physical/mathematical contradictions and generates catalog manager review prompts</p>
              </div>
              <span className={`text-xs font-mono px-3 py-1 rounded-full border ${
                pipeline.phase4.hitl_routing.hitl_priority === 'AUTO_APPROVED'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                Priority: {pipeline.phase4.hitl_routing.hitl_priority}
              </span>
            </div>

            {/* Admin Override & Action Banner */}
            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Compliance Admin Approval Governance Workbench</span>
                <span className="text-xs text-slate-400">Current Status: {pipeline.phase5.syndication_status.publish_state}</span>
              </div>
              
              <div className="flex gap-2">
                {pipeline.isConflictActive && isAdmin && (
                  <button
                    onClick={() => resolveConflict(selectedProduct.id)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                  >
                    <Wrench className="w-4 h-4" />
                    Admin Resolve Contradiction
                  </button>
                )}

                <button
                  onClick={() => toggleAdminApproval(selectedProduct.id)}
                  disabled={pipeline.isConflictActive || !isAdmin}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    !isAdmin
                      ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                      : (pipeline.isConflictActive
                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                        : (pipeline.isManuallyApproved
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500'))
                  }`}
                >
                  {pipeline.isManuallyApproved ? <Unlock className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  {!isAdmin ? 'Admin Sign-off Required' : (pipeline.isConflictActive ? 'Blocked by Contradiction' : (pipeline.isManuallyApproved ? 'Product Approved (Click to Reset)' : 'Admin Approve & Syndicate'))}
                </button>
              </div>
            </div>

            {/* Action Items List */}
            {pipeline.phase4.hitl_routing.human_action_items.length === 0 ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Zero compliance issues detected. Product catalog entry is ready for Compliance Admin sign-off.
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Actionable Human Review Checklist</h3>
                {pipeline.phase4.hitl_routing.human_action_items.map((item, idx) => (
                  <div key={idx} className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                    <span>{item}</span>
                    {isAdmin ? (
                      pipeline.isConflictActive ? (
                        <button
                          onClick={() => resolveConflict(selectedProduct.id)}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold"
                        >
                          Resolve Conflict
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleAdminApproval(selectedProduct.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold"
                        >
                          Sign Off
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded">Admin Action Required</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Full Traceability Table */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Complete Traceability Matrix</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Attribute</th>
                      <th className="p-3">Final Value</th>
                      <th className="p-3">Provenance Source</th>
                      <th className="p-3">Citation</th>
                      <th className="p-3">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 font-mono">
                    {pipeline.phase4.traceability_matrix.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-900/40">
                        <td className="p-3 font-sans font-medium text-slate-200">{t.attribute}</td>
                        <td className="p-3 font-bold text-slate-300">{t.final_value}</td>
                        <td className="p-3 font-sans text-slate-400">{t.source_type}</td>
                        <td className="p-3 font-sans text-slate-400 text-[11px] italic">{t.provenance_citation}</td>
                        <td className="p-3 font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.verification_status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {t.verification_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 5: AKENEO / SHOPIFY PIM SYNDICATION */}
        {activeTab === 'phase5' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-400" />
                  Phase 5: Enterprise PIM & ERP Syndication Payload Inspector
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Formatted for Akeneo PIM, Pimcore, Salsify, and Shopify B2B Multi-Region APIs</p>
              </div>

              <div className="flex items-center gap-2">
                {['akeneo', 'shopify', 'salsify'].map(ch => (
                  <button
                    key={ch}
                    onClick={() => setTargetChannel(ch)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all ${
                      targetChannel === ch
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 block font-semibold uppercase">Channel Publish State</span>
                  <div className="text-sm font-bold font-mono text-emerald-400">{pipeline.phase5.syndication_status.publish_state}</div>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-xs text-slate-400 block font-semibold uppercase">Webhook Event</span>
                  <div className="text-xs font-mono text-blue-400">{pipeline.phase5.syndication_status.webhook_event}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">PIM Export Payload (Localized en_US & en_EU Values)</h3>
                  <button
                    onClick={() => copyToClipboard(pipeline.phase5.pim_export_payload)}
                    className="px-3 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-lg border border-blue-500/30 flex items-center gap-1.5 font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Payload
                  </button>
                </div>

                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto custom-scrollbar max-h-[500px]">
                  {JSON.stringify(pipeline.phase5.pim_export_payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
