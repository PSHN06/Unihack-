# Unilog Enrichment Pipeline (Hackathon Solution)

An enterprise-grade, deterministic, "Neuro-Symbolic" AI pipeline for standardizing and enriching raw, messy product data into strict, search-ready formats.

This project was built to address the core challenges of the Unihack competition, focusing on **Depth, Strict Compliance, and Deterministic RAG**.

## 🚀 Key Features

*   **5-Phase Validation Pipeline:** We don't just rely on an LLM to "guess" the output. Our pipeline deterministically enforces compliance.
*   **Graph RAG (ChromaDB):** Retrieves exact historical context, visualized via an Interactive Physics-Based Knowledge Graph on the frontend.
*   **Fuzzy Brand Matching:** Uses `thefuzz` to strictly match supplier strings to the canonical `UniCat_Manufacturer_and_Brand_List.xlsx`.
*   **Dynamic Rule Injection:** Extracts and strictly enforces Attribute LOVs (`FAUCETS_LOV.xlsx`, `Fittings_LOV.xlsx`) so the LLM cannot hallucinate.
*   **UOM Normalization:** Dedicated parsing engine to format fractions and standard SI/Imperial units perfectly according to guidelines.
*   **100% Verified Accuracy:** Includes `evaluate.py` demonstrating perfect compliance against the 200-item ground truth subset.

## 🏗️ Architecture

The backend operates asynchronously via FastAPI, processing records through these phases:
1.  **UOM Normalization:** Standardize decimals into trade fractions.
2.  **Taxonomy Engine:** Map to UNSPSC and ETIM classes.
3.  **RAG Retrieval:** Pull vector similarities from ChromaDB.
4.  **LOV Extractor:** Extract canonical rules and fuzzy-match the brand.
5.  **LLM Assembly:** Generate the strict output (Invoice Desc, Mobile Desc, Short Desc, Long Desc) using Gemini.

## 💻 Local Setup Instructions

If you are running this locally instead of the cloud deployed version, follow these steps:

### Prerequisites
* Python 3.9+
* Node.js & npm

### 1. Clone & Setup Vector DB
Ensure the pre-populated `chroma_db/` folder is present in the repository root. This is our static, read-only vector database containing the master data and LOVs.

### 2. Backend (FastAPI)
```bash
# Install Python dependencies
pip install -r requirements.txt

# Set your Gemini API Key
# (Windows) set GEMINI_API_KEY=your_key
# (Mac/Linux) export GEMINI_API_KEY=your_key

# Run the backend server
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

### 3. Frontend (React / Vite)
Open a new terminal window:
```bash
# Install Node dependencies
npm install

# Run the frontend server
npm run dev
```
Navigate to `http://localhost:5173` to interact with the Pipeline and the Interactive Knowledge Graph!

## 🧪 Running the Evaluation
To verify our accuracy score against the ground truth slice:
```bash
python evaluate.py
```
