from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple
from app.knowledge_graph.embeddings.embedder import embed_texts, cosine

@dataclass
class VectorItem:
    id: str
    text: str
    emb: List[float]

class InMemoryVectorStore:
    def __init__(self):
        self.items: List[VectorItem] = []

    def add_texts(self, ids: List[str], texts: List[str]) -> None:
        embs = embed_texts(texts)
        for i, t, e in zip(ids, texts, embs):
            self.items.append(VectorItem(id=i, text=t, emb=e.values))

    def search(self, query: str, top_k: int = 5) -> List[Tuple[str, str, float]]:
        q = embed_texts([query])[0].values
        scored = []
        for it in self.items:
            scored.append((it.id, it.text, cosine(q, it.emb)))
        scored.sort(key=lambda x: x[2], reverse=True)
        return scored[:top_k]

    def save_to_disk(self, path: str) -> None:
        import json
        data = [{"id": it.id, "text": it.text, "emb": it.emb} for it in self.items]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    @classmethod
    def load_from_disk(cls, path: str) -> InMemoryVectorStore:
        import json
        store = cls()
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for item in data:
                store.items.append(VectorItem(id=item["id"], text=item["text"], emb=item["emb"]))
        return store
