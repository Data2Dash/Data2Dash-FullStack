import sys
sys.path.append('d:/Data2Dash-FullStack/backend_python')
from agents.citation_agent import CitationAgent
import os
from dotenv import load_dotenv

load_dotenv('d:/Data2Dash-FullStack/.env')
api_key = os.getenv('GROQ_API_KEY')
print(f"Key loaded: {'Yes' if api_key else 'No'}")
try:
    agent = CitationAgent(api_key)
    res = agent.search_semantic_scholar("Transformer models utilize a multi-head self-attention mechanism to understand context.")
    print(f"Results: {res}")
except Exception as e:
    print(f"Failed: {e}")
