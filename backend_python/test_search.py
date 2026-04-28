import sys, os, time
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
from agents.search_agent import SearchAgent

agent = SearchAgent()

start = time.time()
result = agent.search_academic_papers('chat', page=1, per_page=25)
elapsed = time.time() - start

print(f"Time: {elapsed:.1f}s")
print(f"Total papers: {result['total']}")
print(f"Source counts: {result['source_counts']}")
print(f"ranked_papers: {len(result.get('ranked_papers', []))}")
print(f"Page-1 count: {len(result['papers'])}")
print(f"Avg citations: {result['analytics'].get('avg_citations')}")
if result['papers']:
    p = result['papers'][0]
    print(f"First paper: {p['title'][:60]}")
    print(f"  citations: {p['citations']}, source: {p['source']}, score: {p['hybrid_relevance_score']}")
