import sys
import json
import os

# Ensure app is in path
sys.path.insert(0, r"E:\Grad\Data2Dash-FullStack\Knowledge_Graph_0.1")

from app.core.config import PipelineConfig
from app.pipelines.graph_pipeline import generate_knowledge_graph
from app.knowledge_graph.visualization.pyvis_visualizer import visualize_graph

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: run_kg.py <pdf_path> <output_html_path>"}))
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    output_html_path = sys.argv[2]
    
    try:
        # Avoid huge default chunking settings that might freeze standard laptops and hit Free API Tier rate limits.
        cfg = PipelineConfig(
            chunk_strategy="semantic",
            max_total_chunks=6,
            prioritize_top_k=6,
            max_concurrent_chunks=1,
            sync_neo4j=False
        )
        
        vstore, graph_docs, sync_status = generate_knowledge_graph(pdf_path, is_path=True, cfg=cfg)
        
        # Write to HTML output
        visualize_graph(graph_docs, output_file=output_html_path)
        
        # Save vector store to allow RAG queries later
        vstore_path = output_html_path.replace(".kg.html", ".vstore.json")
        vstore.save_to_disk(vstore_path)
        
        print(json.dumps({"success": True}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
