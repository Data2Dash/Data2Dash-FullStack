import sys
import json
import base64

# Ensure app is in path
sys.path.insert(0, r"E:\Grad\Data2Dash-FullStack\summarization with critical review")

from app.services.pipeline_service import run_critical_comparison_pipeline

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: run_comparison.py <pdf_path_a> <pdf_path_b> <output_json_path> <api_key> [model_name]"}))
        sys.exit(1)
        
    pdf_path_a = sys.argv[1]
    pdf_path_b = sys.argv[2]
    output_path = sys.argv[3]
    api_key = sys.argv[4]
    model_name = sys.argv[5] if len(sys.argv) > 5 else "llama-3.1-8b-instant"
    
    try:
        with open(pdf_path_a, "rb") as f:
            pdf_bytes_a = f.read()
            
        with open(pdf_path_b, "rb") as f:
            pdf_bytes_b = f.read()
            
        result = run_critical_comparison_pipeline(
            pdf_a_bytes=pdf_bytes_a,
            pdf_b_bytes=pdf_bytes_b,
            api_key=api_key,
            model=model_name
        )
        
        # Output logic
        output_data = {
            "title_a": result.paper_a_sections.title if result.paper_a_sections else "Paper A",
            "title_b": result.paper_b_sections.title if result.paper_b_sections else "Paper B",
            "comparison": result.result.model_dump()
        }
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f)
            
        print(json.dumps({"success": True}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
