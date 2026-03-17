import os
import json
import re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pypdf import PdfReader
from langchain_groq import ChatGroq
from dotenv import load_dotenv, find_dotenv
import uvicorn
import io

load_dotenv(find_dotenv())

app = FastAPI(title="Knowledge Graph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# ──────────────────────────────────────────────
# LLM Extraction
# ──────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert knowledge graph extractor. 
Given a research paper or document, extract key entities and their relationships.

You MUST respond with ONLY a valid JSON object. No markdown fences, no explanation. Just raw JSON.

The JSON must follow this exact structure:
{
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "label": "Display Label",
      "type": "one of: Person | Concept | Organization | Method | Dataset | Finding | Technology | Theory",
      "description": "A short 1-2 sentence description of this entity"
    }
  ],
  "edges": [
    {
      "source": "source_node_id",
      "target": "target_node_id",
      "label": "relationship verb (e.g. introduces, uses, proposes, applies, part_of, cited_by)"
    }
  ]
}

Rules:
- Extract 15-30 nodes maximum. Be selective, focus on the most important entities.
- Every edge source and target MUST match an existing node id exactly.
- Node ids must be unique snake_case strings (e.g. "transformer_architecture").
- Types must be EXACTLY one of: Person, Concept, Organization, Method, Dataset, Finding, Technology, Theory
- Make descriptions concise but informative.
- Include diverse relationship types to make the graph interesting.
- Ensure the graph is well-connected (most nodes should have at least 1 edge).
"""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract raw text from PDF bytes."""
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        if i >= 20:  # Cap at 20 pages to stay within LLM context
            break
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def extract_graph_from_text(text: str) -> dict:
    """Use Groq LLaMA to extract entities and relationships into a graph."""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set in environment.")

    llm = ChatGroq(
        groq_api_key=GROQ_API_KEY,
        model_name="llama-3.3-70b-versatile",
        temperature=0.2,
    )

    # Truncate text to avoid token limits (~12k chars is safe)
    truncated_text = text[:12000]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Extract the knowledge graph from this document:\n\n{truncated_text}",
        },
    ]

    response = llm.invoke(messages)
    raw = response.content.strip()

    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    try:
        graph = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM returned invalid JSON: {str(e)}\nRaw response (first 500 chars): {raw[:500]}"
        )

    # Validate and clean: remove edges with invalid node references
    node_ids = {n["id"] for n in graph.get("nodes", [])}
    valid_edges = [
        e for e in graph.get("edges", [])
        if e.get("source") in node_ids and e.get("target") in node_ids
    ]
    graph["edges"] = valid_edges

    return graph


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@app.post("/extract-graph")
async def extract_graph(file: UploadFile = File(...)):
    """Upload a PDF and receive a knowledge graph JSON."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    # Step 1: Extract text from PDF
    try:
        text = extract_text_from_pdf(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF. File may be scanned/image-based.")

    # Step 2: Extract graph from text via LLM
    graph = extract_graph_from_text(text)

    return {
        "filename": file.filename,
        "page_count": len(PdfReader(io.BytesIO(file_bytes)).pages),
        "node_count": len(graph.get("nodes", [])),
        "edge_count": len(graph.get("edges", [])),
        "graph": graph,
    }


# Serve the static frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    uvicorn.run("kg_app:app", host="0.0.0.0", port=8001, reload=True)
