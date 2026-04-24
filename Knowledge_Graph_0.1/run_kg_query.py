import sys
import json
import os

# Ensure app is in path
sys.path.insert(0, r"E:\Grad\Data2Dash-FullStack\Knowledge_Graph_0.1")

from app.knowledge_graph.store.vector_store import InMemoryVectorStore
from app.knowledge_graph.graph_rag.query_engine import run_query
from app.knowledge_graph.llm.groq_client import build_llm
from app.core.config import PipelineConfig

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: run_kg_query.py <vstore_json_path> <query_string>"}))
        sys.exit(1)
        
    vstore_path = sys.argv[1]
    query = sys.argv[2]
    
    try:
        vstore = InMemoryVectorStore.load_from_disk(vstore_path)
        
        cfg = PipelineConfig(model_name="llama-3.1-8b-instant")
        llm = build_llm(cfg)
        
        answer, top_contexts, context_str = run_query(
            llm=llm,
            vstore=vstore,
            question=query,
            use_neo4j=False
        )
        
        print(json.dumps({"success": True, "answer": answer}))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
