import os
import chromadb
import google.generativeai as genai
from typing import List, Dict

DB_PATH = "./chroma_db"

def get_embedding(text: str) -> List[float]:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return [0.0] * 768
    genai.configure(api_key=key)
    res = genai.embed_content(model="models/gemini-embedding-2", content=text)
    return res['embedding']

def _seed_data() -> List[Dict]:
    parts = []
    categories = [
        "Ball Valve", "Gate Valve", "Butterfly Valve", "Pressure Transmitter", 
        "Centrifugal Pump", "Electric Motor", "Pipe Fitting", "Bearing", 
        "Flow Meter", "Pressure Gauge"
    ]
    materials = ["316SS", "Cast Iron", "Brass", "PTFE", "Carbon Steel"]
    for i, cat in enumerate(categories):
        for j in range(1, 9):  # 8 parts per category = 80 parts
            part_no = f"{cat[:3].upper().replace(' ', '')}-{1000+i*100+j}"
            name = f"Industrial {cat} - Series {j}"
            desc = f"Heavy duty {cat.lower()} designed for rigorous industrial environments."
            mat = materials[j % len(materials)]
            spec = f"Max Pressure: {100*j} PSI, Material: {mat}"
            parts.append({
                "part_no": part_no,
                "name": name,
                "category": cat,
                "description": desc,
                "spec_summary": spec
            })
    return parts

def init_db():
    client = chromadb.PersistentClient(path=DB_PATH)
    try:
        collection = client.get_collection(name="industrial_parts")
        return collection
    except Exception:
        pass

    collection = client.create_collection(name="industrial_parts", metadata={"hnsw:space": "cosine"})
    parts = _seed_data()
    
    docs = []
    ids = []
    metadatas = []
    embeddings = []
    for p in parts:
        text = f"{p['name']} {p['category']} {p['description']} {p['spec_summary']}"
        docs.append(text)
        ids.append(p["part_no"])
        metadatas.append(p)
        embeddings.append(get_embedding(text))
        
    collection.add(
        documents=docs,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )
    return collection

def find_related(product_text: str, spec_dict: dict, n_results: int = 5) -> List[Dict]:
    collection = init_db()
    
    query = product_text + " " + " ".join(f"{k}: {v}" for k, v in spec_dict.items())
    emb = get_embedding(query)
    
    results = collection.query(
        query_embeddings=[emb],
        n_results=n_results
    )
    
    related = []
    if results['metadatas'] and results['metadatas'][0]:
        for i, meta in enumerate(results['metadatas'][0]):
            rel_type = "accessory" if i % 2 == 0 else "alternative"
            if i == n_results - 1:
                rel_type = "parent"
                
            related.append({
                "type": rel_type,
                "name": str(meta["name"]),
                "part_no": str(meta["part_no"])
            })
    return related
