import sys
import json
import base64

# Ensure app is in path
sys.path.insert(0, r"E:\Grad\Data2Dash-FullStack\summarizer")

from app.services.pipeline_service import run_pipeline

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: run_summarizer.py <pdf_path> <output_json_path> <api_key> <model_name>"}))
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    api_key = sys.argv[3]
    model_name = sys.argv[4]
    
    try:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
            
        result = run_pipeline(
            pdf_bytes=pdf_bytes,
            api_key=api_key,
            model=model_name
        )
        
        # Result has summary_markdown and report_pdf_bytes
        output_data = {
            "title": result.sections.title if result.sections else "Summary",
            "summary_markdown": result.summary_markdown,
            "report_pdf_base64": base64.b64encode(result.report_pdf_bytes).decode('utf-8') if result.report_pdf_bytes else None
        }
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f)
            
        print(json.dumps({"success": True}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
