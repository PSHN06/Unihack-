import fitz  # PyMuPDF
import json
import os
import google.generativeai as genai
from typing import Dict

def parse_pdf(file_bytes: bytes) -> Dict:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return {"product_name": "Vision Unavailable", "description": "No API Key", "specs": {}}
        
    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-3.6-flash")
    
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    combined_specs = {}
    prod_name = ""
    desc = ""
    
    for i in range(len(doc)):
        page = doc[i]
        pix = page.get_pixmap()
        img_bytes = pix.tobytes("png")
        
        prompt = """
        Extract product information from this datasheet image. 
        Return ONLY a strict JSON object with this schema:
        {
            "product_name": "<name>",
            "description": "<short description>",
            "specs": {
                "<spec_name>": "<spec_value>"
            }
        }
        Do not include markdown blocks or any other text.
        """
        
        try:
            image_parts = [{"mime_type": "image/png", "data": img_bytes}]
            response = model.generate_content([prompt, image_parts[0]])
            
            raw = response.text.strip()
            raw = raw.lstrip("```json").rstrip("```").strip()
            data = json.loads(raw)
            
            if not prod_name and data.get("product_name"):
                prod_name = data["product_name"]
            if not desc and data.get("description"):
                desc = data["description"]
                
            specs = data.get("specs", {})
            if isinstance(specs, dict):
                for k, v in specs.items():
                    if k not in combined_specs:
                        combined_specs[k] = str(v)
                        
        except Exception as e:
            print(f"Vision extraction failed on page {i}: {e}")
            continue
            
    doc.close()
    
    return {
        "product_name": prod_name or "Unknown Product",
        "description": desc,
        "specs": combined_specs
    }
