import pandas as pd
import sys

def evaluate(ground_truth_path: str, generated_output_path: str):
    try:
        gt_df = pd.read_csv(ground_truth_path)
        gen_df = pd.read_csv(generated_output_path)
    except Exception as e:
        print(f"Error loading CSV files: {e}")
        return

    # Assuming both dataframes have the same part numbers in the same order, 
    # but let's join on 'Mfg_Part_Num' to be safe.
    gt_df = gt_df.set_index("Mfg_Part_Num")
    gen_df = gen_df.set_index("Mfg_Part_Num")

    common_indices = gt_df.index.intersection(gen_df.index)
    if len(common_indices) == 0:
        print("No common parts found between ground truth and generated output.")
        return

    gt_df = gt_df.loc[common_indices]
    gen_df = gen_df.loc[common_indices]

    print(f"Evaluating {len(common_indices)} products...\n")

    fields_to_evaluate = [
        "MANUFACTURER_NAME",
        "BRAND_NAME",
        "Classpath",
        "INVOICE_DESC",
        "MOBILE_DESC",
        "SHORT_DESC",
        "LONG_DESC1"
    ]

    scores = {}

    for field in fields_to_evaluate:
        matches = 0
        total = len(common_indices)
        for idx in common_indices:
            gt_val = str(gt_df.at[idx, field]).strip().lower()
            gen_val = str(gen_df.at[idx, field]).strip().lower()

            # Exact match for evaluation, though for long descriptions we might want similarity
            if field in ["LONG_DESC1", "SHORT_DESC", "MOBILE_DESC"]:
                # For longer text, a simple length & keyword check or Levenshtein ratio is better
                from thefuzz import fuzz
                score = fuzz.ratio(gt_val, gen_val)
                if score > 85:  # 85% similarity threshold
                    matches += 1
            else:
                if gt_val == gen_val:
                    matches += 1

        accuracy = (matches / total) * 100
        scores[field] = accuracy

    # Evaluate LOV Attributes
    attr_matches = 0
    attr_total = 0
    for idx in common_indices:
        for i in range(1, 51):
            lbl_key = f"ATTRIBUTE_LABEL {i}"
            val_key = f"ATTRIBUTE_VALUE {i}"
            if lbl_key in gt_df.columns:
                gt_lbl = str(gt_df.at[idx, lbl_key]).strip().lower()
                gt_val = str(gt_df.at[idx, val_key]).strip().lower()
                if gt_lbl and gt_lbl != 'nan':
                    attr_total += 1
                    
                    # Search for this label in generated output
                    found = False
                    for j in range(1, 51):
                        gen_lbl = str(gen_df.at[idx, f"ATTRIBUTE_LABEL {j}"]).strip().lower()
                        gen_val = str(gen_df.at[idx, f"ATTRIBUTE_VALUE {j}"]).strip().lower()
                        
                        if gen_lbl == gt_lbl and gen_val == gt_val:
                            found = True
                            break
                    if found:
                        attr_matches += 1

    if attr_total > 0:
        scores["ATTRIBUTES (LOV Strict)"] = (attr_matches / attr_total) * 100
    else:
        scores["ATTRIBUTES (LOV Strict)"] = 0.0

    print("="*50)
    print("      UNIHACK 2026 PIPELINE ACCURACY REPORT      ")
    print("="*50)
    for field, score in scores.items():
        print(f"{field.ljust(30)} : {score:.1f}%")
    print("="*50)
    
    overall = sum(scores.values()) / len(scores)
    print(f"OVERALL PIPELINE SCORE         : {overall:.1f}%")
    print("="*50)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python evaluate.py <ground_truth.csv> <generated.csv>")
        sys.exit(1)
    
    evaluate(sys.argv[1], sys.argv[2])
