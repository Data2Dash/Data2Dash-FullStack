import os
import sys
# CRITICAL (Windows): force UTF-8 stdout/stderr BEFORE anything prints. The default
# Windows console code page is cp1252, so any print() containing Unicode (box-drawing
# "═══", "✅", or Greek/math chars extracted from a PDF) raises UnicodeEncodeError and
# CRASHES the background indexing thread mid-Stage-2 — leaving the spinner stuck and
# tables/equations/figures never extracted. This was masked in test harnesses that
# already reconfigured stdout to utf-8; the live uvicorn server did not.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import shutil
import asyncio
import uuid
import re
import json
import subprocess
import base64
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from agents.pdf_agent import PDFAgent
from agents.search_agent import SearchAgent
from agents.chat_agent import ChatAgent
from agents.podcast_agent import PodcastAgent
from agents.youtube_agent import YouTubeAgent
from agents.video_agent import VideoAgent
from agents.vision_agent import VisionAgent
from agents.citation_agent import CitationAgent
from agents.quiz_agent import QuizAgent
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
import uvicorn

# Project structure for external scripts
CURRENT_FILE = os.path.abspath(__file__)
BACKEND_DIR = os.path.dirname(CURRENT_FILE)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# Script paths
RUN_SUMMARIZER_SCRIPT = os.path.join(PROJECT_ROOT, "summarizer", "run_summarizer.py")
# Hard ceiling (seconds) for the summarizer subprocess so a stalled model call
# can't hang the request indefinitely. Env-overridable.
try:
    SUMMARIZER_TIMEOUT_SECONDS = int(os.getenv("SUMMARIZER_TIMEOUT_SECONDS", "180"))
except ValueError:
    SUMMARIZER_TIMEOUT_SECONDS = 180
# Groq model for the summarizer. gemma2-9b-it was decommissioned; default to the
# current production model (see agents/model_router.py). Env-overridable.
SUMMARIZER_MODEL = os.getenv("SUMMARIZER_MODEL", "llama-3.3-70b-versatile")
RUN_COMPARISON_SCRIPT = os.path.join(PROJECT_ROOT, "summarization with critical review", "run_comparison.py")
RUN_KG_SCRIPT = os.path.join(PROJECT_ROOT, "Knowledge_Graph_0.1", "run_kg.py")
RUN_KG_QUERY_SCRIPT = os.path.join(PROJECT_ROOT, "Knowledge_Graph_0.1", "run_kg_query.py")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Auth imports
from database import engine, Base, get_db
from models import (
    File as FileModel, SearchHistory, Workspace, User, 
    ChatSession, ChatMessage, SenderType, SessionType
)
from routers.auth import router as auth_router, get_current_user, bearer_scheme
from auth_utils import decode_access_token
from routers.documents import router as documents_router
from routers.workspace import router as workspace_router
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import Depends

# Initialize FastAPI app
# Create DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Youware AI Backend")

# Register routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(workspace_router)

# Configure CORS
# NOTE: allow_origins=["*"] + allow_credentials=True is forbidden by the CORS spec.
# Must list origins explicitly when credentials are used.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers

# Create directories
os.makedirs("data/uploads", exist_ok=True)

# Mount static files
app.mount("/api/uploads", StaticFiles(directory="data/uploads"), name="uploads")


# ── Pre-warm the upload pipeline at startup (background thread) ───────────────
# The first upload otherwise pays cold-start costs on its critical path:
#   1. SentenceTransformer weights load (the big one),
#   2. first-time construction of the PDF pipeline (EnhancedRAGSystem → lazy
#      imports of the PDF processor / chunker / retriever / validator),
#   3. first-use construction of each agent singleton ("all agents" feel slow
#      the first time they are touched).
# All three are idempotent process-wide singletons, so loading them once here —
# off any request thread — means the first real upload reuses warm objects.
# This is a latency move only: identical code paths, no behavioural change.
def _prewarm_embedding_model():
    """Load the SentenceTransformer model once at startup so first upload is fast."""
    try:
        import sys as _sys
        PROJECT_ROOT_PW = os.path.dirname(BACKEND_DIR)
        MULTIMODELRAG_DIR_PW = os.path.join(PROJECT_ROOT_PW, "multimodelrag")
        if MULTIMODELRAG_DIR_PW not in _sys.path:
            _sys.path.append(MULTIMODELRAG_DIR_PW)
        import time as _t
        from vector_store import _get_shared_embedding_model
        _get_shared_embedding_model("sentence-transformers/all-MiniLM-L6-v2")

        if not GROQ_API_KEY:
            # No key → agents can't be built; embedding warm-up alone still helps.
            print("[PREWARM] Embedding warmed; skipping agent/pipeline warm-up (no GROQ_API_KEY).")
            return

        # Warm the PDF pipeline construction + its lazy module imports by building
        # one throwaway EnhancedRAGSystem (discarded immediately — not registered
        # to any session, so it introduces no shared/mutable state or races).
        t0 = _t.perf_counter()
        try:
            from enhanced_rag_system import EnhancedRAGSystem, EnhancedRAGConfig
            _throwaway = EnhancedRAGSystem(config=EnhancedRAGConfig(), groq_api_key=GROQ_API_KEY)
            del _throwaway
            print(f"[PREWARM] PDF pipeline construction warmed in {_t.perf_counter()-t0:.1f}s")
        except Exception as e:
            print(f"[PREWARM] PDF pipeline warm-up failed (non-fatal): {e}")

        # Warm the agent singletons the upload flow touches, so their first real
        # use doesn't pay construction latency. Each getter is idempotent.
        for name, getter in (
            ("pdf", get_pdf_agent),
            ("chat", get_chat_agent),
            ("vision", get_vision_agent),
            ("citation", get_citation_agent),
        ):
            try:
                getter()
            except Exception as e:
                print(f"[PREWARM] {name} agent warm-up failed (non-fatal): {e}")
        print("[PREWARM] Agent singletons warmed.")
    except Exception as e:
        print(f"[PREWARM] Pipeline pre-load failed (non-fatal): {e}")

# NOTE: the warm-up thread is started AFTER the agent getters are defined (below),
# so the function can reference them safely with no import-order race.

# Initialize Agents
# Note: Ensure GROQ_API_KEY is set in environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment variables. Agents will fail to initialize.")
if not YOUTUBE_API_KEY:
    print("WARNING: YOUTUBE_API_KEY not found in environment variables. YouTube search will fail.")

# Global instances
pdf_agent = None
search_agent = None
podcast_agent = None
youtube_agent = None
vision_agent = None
citation_agent = None
quiz_agent = None
video_agent = None

# Task storage
podcast_tasks: Dict[str, dict] = {}
video_tasks: Dict[str, dict] = {}

def get_pdf_agent():
    global pdf_agent
    if pdf_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        pdf_agent = PDFAgent(groq_api_key=GROQ_API_KEY)
    return pdf_agent

def get_search_agent():
    global search_agent
    if search_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        search_agent = SearchAgent(groq_api_key=GROQ_API_KEY)
    return search_agent

def get_podcast_agent():
    global podcast_agent
    if podcast_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        podcast_agent = PodcastAgent(groq_api_key=GROQ_API_KEY)
    return podcast_agent

def get_youtube_agent():
    global youtube_agent
    if youtube_agent is None:
        if not YOUTUBE_API_KEY:
            raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not configured")
        youtube_agent = YouTubeAgent(api_key=YOUTUBE_API_KEY)
    return youtube_agent

chat_agent = None

def get_chat_agent(groq_api_key_override: str = None):
    global chat_agent
    # If user provided their own key, create a fresh agent with it
    if groq_api_key_override:
        return ChatAgent(groq_api_key=groq_api_key_override)
    if chat_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured for chat")
        chat_agent = ChatAgent(groq_api_key=GROQ_API_KEY)
    return chat_agent

def get_vision_agent():
    global vision_agent
    if vision_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        vision_agent = VisionAgent(groq_api_key=GROQ_API_KEY)
    return vision_agent

def get_citation_agent():
    global citation_agent
    if citation_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        citation_agent = CitationAgent(groq_api_key=GROQ_API_KEY)
    return citation_agent

def get_quiz_agent():
    global quiz_agent
    if quiz_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        quiz_agent = QuizAgent(groq_api_key=GROQ_API_KEY)
    return quiz_agent

def get_video_agent():
    global video_agent
    if video_agent is None:
        if not GROQ_API_KEY:
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
        video_agent = VideoAgent(groq_api_key=GROQ_API_KEY)
    return video_agent

# Start the pipeline warm-up now that the agent getters exist (see _prewarm_embedding_model).
import threading as _threading_prewarm
_threading_prewarm.Thread(target=_prewarm_embedding_model, daemon=True).start()

# Pydantic Models
class SearchRequest(BaseModel):
    query: str
    page: int = 1
    per_page: int = 25

class AIChatRequest(BaseModel):
    query: str
    history: Optional[List[Dict[str, str]]] = []
    session_id: Optional[str] = None

class PDFChatRequest(BaseModel):
    query: str
    session_id: str

class ElementSearchRequest(BaseModel):
    session_id: str
    query: str
    element_type: Optional[str] = None  # "table", "equation", "figure", "section", "keyword" or None for all

class PDFListResponse(BaseModel):
    files: List[str]

class PodcastRequest(BaseModel):
    paper_content: str
    length: str = "Medium"  # Short, Medium, or Long
    voices: Optional[Dict[str, str]] = None
    add_music: bool = True

class PodcastResponse(BaseModel):
    task_id: str
    status: str
    message: str

class PodcastStatusResponse(BaseModel):
    task_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: int  # 0-100
    message: str
    audio_url: Optional[str] = None

class YouTubeSearchRequest(BaseModel):
    paper_title: str
    paper_abstract: Optional[str] = ""
    max_results: int = 6

class YouTubeVideo(BaseModel):
    title: str
    description: str
    thumbnail: str
    video_id: str
    link: str
    channel: str

class YouTubeSearchResponse(BaseModel):
    videos: List[YouTubeVideo]
    query_used: str

class FigureAnalysisRequest(BaseModel):
    image_path: str
    query: Optional[str] = None
    session_id: str

class ImportPaperRequest(BaseModel):
    paper_id: str
    session_id: str
    title: str
    pdf_url: Optional[str] = None

class CitationSearchRequest(BaseModel):
    sentence: str

class CitationFormatRequest(BaseModel):
    title: str
    authors: List[str]
    year: str
    url: str

class QuizRequest(BaseModel):
    session_id: str
    filename: str
    num_questions: int = 5
    difficulty: str = "Medium"  # Easy, Medium, Hard

# ─── User API Key Support ─────────────────────────────────────────────────────

class ValidateKeyRequest(BaseModel):
    api_key: str

def get_user_groq_key(request) -> Optional[str]:
    """Extract user-provided Groq API key from X-Groq-Api-Key header."""
    key = request.headers.get("x-groq-api-key", "").strip()
    return key if key else None

def effective_groq_key(request) -> str:
    """Return user key if provided, otherwise fall back to server .env key."""
    return get_user_groq_key(request) or GROQ_API_KEY or ""

@app.post("/api/settings/validate-key")
async def validate_groq_key(req: ValidateKeyRequest):
    """Validate a Groq API key by making a minimal test call."""
    try:
        from groq import Groq
        client = Groq(api_key=req.api_key)
        client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        return {"valid": True}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid API key")

# Endpoints

@app.get("/")
def health_check():
    return {"status": "ok", "message": "AI Backend is running"}

@app.post("/api/search")
def search(request: SearchRequest, db: Session = Depends(get_db)):
    agent = get_search_agent()
    try:
        result = agent.run(request.query)
        # Persist search query anonymously (no user auth on this endpoint)
        try:
            sh = SearchHistory(
                user_id=None,
                workspace_id=None,
                query_text=request.query,
                search_type="ai",
                result_count=None,
            )
            db.add(sh)
            db.commit()
        except Exception:
            db.rollback()  # non-fatal
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/ai")
def chat_ai(
    request: AIChatRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    agent = get_chat_agent()
    try:
        # Normalise session_id to a UUID string — fall back to uuid5 hash for non-UUID values
        raw_sid = request.session_id or ""
        try:
            sid = str(uuid.UUID(raw_sid))
        except (ValueError, AttributeError):
            sid = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_sid or "default"))

        # Filter out system-role entries — those are context injections, not real chat messages
        real_history = [m for m in (request.history or []) if m.get("role") in ("user", "ai")]

        # 1. Get or create session
        session = db.query(ChatSession).filter(ChatSession.session_id == sid).first()
        if not session:
            ws = db.query(Workspace).filter(Workspace.user_id == current_user.id).first()
            if not ws:
                raise HTTPException(status_code=404, detail="Workspace not found")

            # Generate a title from the first query (first 50 chars)
            title = request.query[:50] + "..." if len(request.query) > 50 else request.query

            session = ChatSession(
                session_id=sid,
                user_id=current_user.id,
                workspace_id=ws.id,
                title=title,
                session_type=SessionType.ai
            )
            db.add(session)
            db.flush()

        # 2. Save User Message
        user_msg = ChatMessage(
            session_id=sid,
            sender_type=SenderType.user,
            content=request.query
        )
        db.add(user_msg)

        # 3. Get AI Response — pass only real (non-system) history to the agent
        print(f"Calling ChatAgent.run for session {sid}...")
        # Pass the global pdf_agent singleton so DocumentReader can access loaded sessions
        _pdf = get_pdf_agent() if GROQ_API_KEY else None
        result = agent.run(request.query, real_history, sid, pdf_agent_instance=_pdf)
        print("ChatAgent.run completed successfully.")
        
        # 4. Save AI Message
        ai_msg = ChatMessage(
            session_id=sid,
            sender_type=SenderType.agent,
            content=result.get("response", ""),
            message_metadata={"sources": result.get("sources", [])}
        )
        db.add(ai_msg)
        
        # Update session timestamp
        session.last_message_at = func.now()
        db.commit()

        return result
    except HTTPException:
        raise  # Don't swallow 404s etc.
    except Exception as e:
        db.rollback()
        import traceback
        print(f"CHAT_AI ERROR: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.post("/api/papers/search")
def search_papers(
    request: SearchRequest,
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    """
    Enhanced hybrid search endpoint.
    Returns ranked papers from ArXiv + OpenAlex with LLM query expansion,
    composite scoring, analytics, and source breakdowns.
    """
    agent = get_search_agent()
    try:
        data = agent.search_academic_papers(
            query=request.query,
            page=request.page,
            per_page=request.per_page,
        )
        # Persist search to history — link to user if token provided
        try:
            result_count = data.get("total") if isinstance(data, dict) else None
            user_id = None
            workspace_id = None
            if credentials:
                payload = decode_access_token(credentials.credentials)
                if payload:
                    u = db.query(User).filter(User.id == int(payload["sub"])).first()
                    if u:
                        user_id = u.id
                        ws = db.query(Workspace).filter(Workspace.user_id == u.id).first()
                        if ws:
                            workspace_id = ws.id
            sh = SearchHistory(
                user_id=user_id,
                workspace_id=workspace_id,
                query_text=request.query,
                search_type="academic",
                result_count=result_count,
            )
            db.add(sh)
            db.commit()
        except Exception:
            db.rollback()  # non-fatal
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Background indexing state ─────────────────────────────────────────────────
import threading
import hashlib

indexing_status: Dict[str, dict] = {}
_indexing_lock = threading.Lock()

# ═══════════════════════════════════════════════════════════════════════════
# PHASE 1: Persistent File Hash Registry
# ═══════════════════════════════════════════════════════════════════════════

INDEX_REGISTRY_PATH = os.path.join("data", "indexed_files.json")


class IndexRegistry:
    """Persistent registry of indexed file hashes. Survives server restarts."""

    def __init__(self, path: str = INDEX_REGISTRY_PATH):
        self._path = path
        self._entries: Dict[str, dict] = {}
        self._load()

    def _load(self):
        try:
            if os.path.exists(self._path):
                with open(self._path, "r") as f:
                    self._entries = json.load(f)
        except (json.JSONDecodeError, IOError):
            self._entries = {}

    def _save(self):
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w") as f:
            json.dump(self._entries, f, indent=2)

    def contains(self, file_hash: str) -> bool:
        return file_hash in self._entries

    def get_session_for_hash(self, file_hash: str) -> Optional[str]:
        entry = self._entries.get(file_hash)
        return entry.get("session_id") if entry else None

    def register(self, file_hash: str, session_id: str, filename: str, analysis_complete: bool = False):
        self._entries[file_hash] = {
            "session_id": session_id,
            "filename": filename,
            "analysis_complete": analysis_complete,
            "indexed_at": str(os.popen("date /t").read().strip()) if sys.platform == "win32" else "",
        }
        self._save()

    def mark_analysis_complete(self, file_hash: str):
        if file_hash in self._entries:
            self._entries[file_hash]["analysis_complete"] = True
            self._save()

    def is_analysis_complete(self, file_hash: str) -> bool:
        entry = self._entries.get(file_hash)
        return bool(entry and entry.get("analysis_complete"))

    def remove_by_session(self, session_id: str):
        to_remove = [h for h, e in self._entries.items() if e.get("session_id") == session_id]
        for h in to_remove:
            del self._entries[h]
        if to_remove:
            self._save()

    def remove_by_hash(self, file_hash: str):
        if file_hash in self._entries:
            del self._entries[file_hash]
            self._save()


_index_registry = IndexRegistry()


def _file_content_hash(file_path: str) -> str:
    """Compute MD5 hash of file content for deduplication."""
    h = hashlib.md5()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


import time as _time_mod
import pickle

# Document-level cache directory
DOCUMENT_CACHE_DIR = os.path.join("data", "document_cache")
os.makedirs(DOCUMENT_CACHE_DIR, exist_ok=True)

# Global pipeline budget (seconds) — circuit breaker
PIPELINE_BUDGET_SECONDS = 180


def _get_cache_path(file_hash: str) -> str:
    return os.path.join(DOCUMENT_CACHE_DIR, f"{file_hash}.pkl")


def _save_document_cache(file_hash: str, system) -> None:
    """Persist the processed document state to disk for instant reload."""
    try:
        cache_data = {
            "current_document": system.current_document,
            "current_chunks": system.current_chunks,
            "current_doc_id": system.current_doc_id,
            "stage2_complete": getattr(system, "_stage2_complete", True),
        }
        with open(_get_cache_path(file_hash), "wb") as f:
            pickle.dump(cache_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        print(f"[CACHE] Saved document cache for hash {file_hash[:12]}...")
    except Exception as e:
        print(f"[CACHE] Save failed: {e}")


def _load_document_cache(file_hash: str, system) -> bool:
    """Load cached document state. Returns True on success."""
    cache_path = _get_cache_path(file_hash)
    if not os.path.exists(cache_path):
        return False
    try:
        with open(cache_path, "rb") as f:
            cache_data = pickle.load(f)
        system.current_document = cache_data["current_document"]
        system.current_chunks = cache_data["current_chunks"]
        system.current_doc_id = cache_data["current_doc_id"]
        system._stage2_complete = cache_data.get("stage2_complete", True)
        system._stage2_error = None
        # Rebuild vector store from cached chunks
        if system.current_chunks:
            system.vector_store.add_document(system.current_doc_id, system.current_chunks)
        print(f"[CACHE] Loaded document from cache ({len(system.current_chunks)} chunks)")
        return True
    except Exception as e:
        print(f"[CACHE] Load failed (will reprocess): {e}")
        return False


def _index_pdf_background(agent, file_path: str, session_id: str, filename: str):
    """Thin wrapper so ANY failure in the indexing thread is logged with a full
    traceback (daemon-thread exceptions are otherwise swallowed silently)."""
    print(f"[INDEX-THREAD] ENTER session={session_id} file={filename}", flush=True)
    try:
        _index_pdf_background_impl(agent, file_path, session_id, filename)
        print(f"[INDEX-THREAD] EXIT-OK session={session_id}", flush=True)
    except BaseException as e:
        import traceback
        print(f"[INDEX-THREAD] FATAL session={session_id}: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        task_key = f"{session_id}/{filename}"
        try:
            if session_id in agent.systems:
                agent.systems[session_id]._stage2_complete = True
                agent.systems[session_id]._stage2_error = str(e)
        except Exception:
            pass
        with _indexing_lock:
            indexing_status[task_key] = {"status": "error", "message": f"indexing failed: {e}"}


def _index_pdf_background_impl(agent, file_path: str, session_id: str, filename: str):
    """PDF indexing with document-level caching and global timeout circuit breaker.

    Cache hit path: ~2-3 seconds (load from disk, rebuild vector index).
    Cold path: Stage 1 (text) + Stage 2 (assets) with 60s hard budget.
    """
    task_key = f"{session_id}/{filename}"
    pipeline_start = _time_mod.time()

    # Gate 1: Session already live in memory
    if session_id in agent.systems:
        with _indexing_lock:
            indexing_status[task_key] = {"status": "ready", "message": "Already indexed (in-memory)"}
        return

    # Compute content hash
    fhash = None
    try:
        fhash = _file_content_hash(file_path)
    except Exception:
        pass

    # Gate 2: Full document cache exists on disk (INSTANT reload)
    if fhash and os.path.exists(_get_cache_path(fhash)):
        system = agent.get_system(session_id)
        if _load_document_cache(fhash, system):
            if session_id not in agent.uploaded_files:
                agent.uploaded_files[session_id] = []
            if filename not in agent.uploaded_files[session_id]:
                agent.uploaded_files[session_id].append(filename)
            elapsed = _time_mod.time() - pipeline_start
            with _indexing_lock:
                indexing_status[task_key] = {
                    "status": "ready",
                    "message": f"✅ '{filename}' loaded from cache in {elapsed:.1f}s",
                }
            _index_registry.register(fhash, session_id, filename, analysis_complete=True)
            print(f"[TIMING] ═══ CACHE HIT: {elapsed:.2f}s total ═══")
            return

    # Gate 3: Concurrency lock
    with _indexing_lock:
        existing = indexing_status.get(task_key)
        if existing and existing.get("status") == "processing":
            return
        indexing_status[task_key] = {"status": "processing", "progress": "text extraction"}

    try:
        system = agent.get_system(session_id)

        # ── STAGE 1: Fast text indexing ──
        text_result = system.process_document_text_first(file_path)
        with _indexing_lock:
            indexing_status[task_key] = {"status": "ready", "progress": "text indexed, assets loading..."}

        if fhash:
            _index_registry.register(fhash, session_id, filename, analysis_complete=False)

        if session_id not in agent.uploaded_files:
            agent.uploaded_files[session_id] = []
        if filename not in agent.uploaded_files[session_id]:
            agent.uploaded_files[session_id].append(filename)

        # ── Circuit breaker check ──
        elapsed = _time_mod.time() - pipeline_start
        if elapsed > PIPELINE_BUDGET_SECONDS:
            print(f"[CIRCUIT BREAKER] Stage 1 alone took {elapsed:.1f}s — skipping Stage 2")
            system._stage2_complete = True
            system._stage2_error = "Aborted: pipeline budget exceeded after Stage 1"
            with _indexing_lock:
                indexing_status[task_key] = {"status": "ready", "message": f"✅ '{filename}' text indexed (assets skipped — budget exceeded)"}
            return

        # ── STAGE 2: Asset extraction ──
        with _indexing_lock:
            indexing_status[task_key]["progress"] = "extracting tables & equations"

        asset_result = system.process_document_assets()

        # ── Circuit breaker: if VLM hasn't finished but budget exceeded, abort ──
        elapsed = _time_mod.time() - pipeline_start
        if elapsed > PIPELINE_BUDGET_SECONDS:
            print(f"[CIRCUIT BREAKER] Pipeline took {elapsed:.1f}s — marking complete despite incomplete VLM")

        # Save to document cache for instant future reloads
        if fhash:
            _save_document_cache(fhash, system)
            _index_registry.mark_analysis_complete(fhash)

        tables = asset_result.get("tables_added", 0)
        equations = asset_result.get("equations_added", 0)
        figures = asset_result.get("figures_added", 0)
        total_time = _time_mod.time() - pipeline_start

        with _indexing_lock:
            indexing_status[task_key] = {
                "status": "ready",
                "message": (
                    f"✅ '{filename}' indexed in {total_time:.1f}s "
                    f"({text_result.get('num_chunks', 0)} text, "
                    f"{equations} eq, {tables} tbl, {figures} fig)"
                ),
            }
        print(f"[TIMING] ═══ COLD PATH TOTAL: {total_time:.2f}s ═══")

    except Exception as e:
        import traceback
        error_msg = f"INDEXING FAILED [{filename}]: {str(e)}"
        print(error_msg)
        print(traceback.format_exc())
        try:
            if session_id in agent.systems:
                agent.systems[session_id]._stage2_complete = True
                agent.systems[session_id]._stage2_error = str(e)
        except Exception:
            pass
        with _indexing_lock:
            indexing_status[task_key] = {"status": "error", "message": error_msg}


def _rehydrate_or_reindex(agent, session_id: str, file_name: str) -> bool:
    """Recovery after server restart: in-memory state is wiped but the uploaded
    file, the document cache, and the registry all survive on disk.
    Returns True if the session is (or has been re-queued to become) ready.
    """
    if session_id in agent.systems:
        return True
    file_path = os.path.join("data", "uploads", session_id, file_name)
    if not os.path.exists(file_path):
        return False
    # File exists on disk → re-trigger background indexing (will hit cache if present)
    task_key = f"{session_id}/{file_name}"
    with _indexing_lock:
        existing = indexing_status.get(task_key)
        if existing and existing.get("status") == "processing":
            return True
        # "queued" (NOT "processing") so the worker's concurrency guard doesn't
        # mistake this seed value for an already-running worker and bail.
        indexing_status[task_key] = {"status": "queued", "progress": "recovering after restart"}
    worker = threading.Thread(
        target=_index_pdf_background,
        args=(agent, file_path, session_id, file_name),
        daemon=True,
    )
    worker.start()
    return True


@app.get("/api/pdf/indexing-status/{session_id}/{file_name}")
async def get_indexing_status(session_id: str, file_name: str):
    """Poll the background indexing status for a file.
    Falls back to disk recovery if in-memory status was wiped by a restart.
    """
    task_key = f"{session_id}/{file_name}"
    with _indexing_lock:
        status = indexing_status.get(task_key)
    if status is not None:
        # Enrich with Stage 2 progress details if available
        agent = get_pdf_agent()
        if session_id in agent.systems:
            asset_status = agent.systems[session_id].get_asset_status()
            status = {**status}
            if asset_status.get("progress"):
                status["progress"] = asset_status["progress"]
            status["assets"] = {
                "equations": asset_status.get("equations", 0),
                "tables": asset_status.get("tables", 0),
                "figures": asset_status.get("figures", 0),
            }
        return status

    # No in-memory entry — recover from disk so the spinner never hangs forever
    agent = get_pdf_agent()
    file_path = os.path.join("data", "uploads", session_id, file_name)
    if os.path.exists(file_path):
        # Already fully indexed (in registry)? report ready immediately
        try:
            fhash = _file_content_hash(file_path)
            if _index_registry.is_analysis_complete(fhash) or session_id in agent.systems:
                return {"status": "ready", "message": "recovered from disk"}
        except Exception:
            pass
        # File present but not finished → re-queue indexing and report processing
        _rehydrate_or_reindex(agent, session_id, file_name)
        return {"status": "processing", "progress": "re-indexing after restart"}

    return {"status": "unknown"}


@app.get("/api/pdf/status/{session_id}")
async def get_session_asset_status(session_id: str):
    """Return real-time Stage 2 asset status for a session.
    Frontend can poll this to know exactly when tables/equations/figures are ready.
    """
    agent = get_pdf_agent()
    if session_id not in agent.systems:
        return {"stage2_complete": False, "assets_loaded": 0, "error": "Session not found"}
    system = agent.systems[session_id]
    return system.get_asset_status()


@app.post("/api/pdf/search-elements")
async def search_paper_elements(request: ElementSearchRequest):
    """Search for specific elements (tables, equations, figures, sections, keywords) inside a paper."""
    agent = get_pdf_agent()
    if request.session_id not in agent.systems:
        raise HTTPException(status_code=404, detail="Session not found. Please upload or import a paper first.")

    system = agent.systems[request.session_id]
    doc = getattr(system, "current_document", None)
    if doc is None:
        raise HTTPException(status_code=404, detail="No document loaded in this session.")

    q = request.query.lower().strip()
    results = []

    def _score(text: str) -> float:
        if not text:
            return 0.0
        tl = text.lower()
        if q in tl:
            return 2.0
        terms = q.split()
        return sum(1.0 for t in terms if t in tl) / max(len(terms), 1)

    def _get_page_context(page_num: int, max_chars: int = 400) -> str:
        if not page_num or not hasattr(doc, "pages") or not doc.pages:
            return ""
        for p in doc.pages:
            if getattr(p, "page_number", None) == page_num:
                text = getattr(p, "text", "") or ""
                return text[:max_chars].strip() + ("..." if len(text) > max_chars else "")
        return ""

    # Tables
    if request.element_type in (None, "table"):
        for tb in getattr(doc, "tables", []) or []:
            num = getattr(tb, "global_number", None)
            caption = getattr(tb, "caption", "") or ""
            md = getattr(tb, "markdown", "") or ""
            raw = getattr(tb, "raw_text", "") or ""
            section = getattr(tb, "section", "") or ""
            page = getattr(tb, "page_number", None)

            num_match = f"table {num}" == q or f"table{num}" == q if num else False
            text_score = max(_score(caption), _score(raw), _score(section))
            if num_match or text_score > 0.3:
                results.append({
                    "type": "table",
                    "label": f"Table {num}" if num else "Table",
                    "page_number": page,
                    "section": section,
                    "caption": caption,
                    "markdown": md,
                    "raw_text": raw,
                    "context": _get_page_context(page),
                    "score": 10.0 if num_match else text_score,
                })

    # Equations
    if request.element_type in (None, "equation"):
        for eq in getattr(doc, "equations", []) or []:
            num = getattr(eq, "global_number", None)
            latex = getattr(eq, "latex", "") or ""
            text = getattr(eq, "text", "") or ""
            section = getattr(eq, "section", "") or ""
            ctx = getattr(eq, "context", "") or ""
            page = getattr(eq, "page_number", None)

            num_match = (f"equation {num}" == q or f"eq {num}" == q or f"equation{num}" == q) if num else False
            text_score = max(_score(latex), _score(text), _score(section), _score(ctx))
            if num_match or text_score > 0.3:
                results.append({
                    "type": "equation",
                    "label": f"Equation {num}" if num else "Equation",
                    "page_number": page,
                    "section": section,
                    "latex": latex,
                    "normalized_latex": getattr(eq, "normalized_latex", latex),
                    "raw_text": text,
                    "context": ctx or _get_page_context(page),
                    "score": 10.0 if num_match else text_score,
                })

    # Figures
    if request.element_type in (None, "figure"):
        for fig in getattr(doc, "figures", []) or []:
            num = getattr(fig, "global_number", None)
            caption = getattr(fig, "caption", "") or ""
            desc = getattr(fig, "description", "") or getattr(fig, "_vlm_description", "") or ""
            section = getattr(fig, "section", "") or ""
            page = getattr(fig, "page_number", None)
            img_path = getattr(fig, "image_path", "") or ""

            num_match = (f"figure {num}" == q or f"fig {num}" == q or f"figure{num}" == q) if num else False
            text_score = max(_score(caption), _score(desc), _score(section))
            if num_match or text_score > 0.3:
                img_url = ""
                if img_path and os.path.exists(img_path):
                    rel = img_path.replace("\\", "/")
                    if "data/" in rel:
                        rel = rel[rel.index("data/"):]
                    img_url = f"{BACKEND_URL}/api/uploads/{'/'.join(rel.split('/')[2:])}"

                results.append({
                    "type": "figure",
                    "label": f"Figure {num}" if num else "Figure",
                    "page_number": page,
                    "section": section,
                    "caption": caption,
                    "description": desc,
                    "image_url": img_url,
                    "context": _get_page_context(page),
                    "score": 10.0 if num_match else text_score,
                })

    # Sections / Keywords — search through text chunks
    if request.element_type in (None, "section", "keyword"):
        chunks = getattr(system, "current_chunks", []) or []
        for chunk in chunks:
            text = getattr(chunk, "text", "") or ""
            meta = getattr(chunk, "metadata", {}) or {}
            page = meta.get("page_number") or meta.get("page")
            section = meta.get("section", "")
            score = _score(text)
            if score > 0.5:
                snippet = text[:600].strip()
                results.append({
                    "type": "section" if request.element_type == "section" else "keyword",
                    "label": section or f"Page {page}" if page else "Text",
                    "page_number": page,
                    "section": section or "",
                    "text": snippet + ("..." if len(text) > 600 else ""),
                    "score": score,
                })

    results.sort(key=lambda r: r.get("score", 0), reverse=True)
    results = results[:20]

    for r in results:
        r.pop("score", None)

    return {"results": results, "total": len(results)}


@app.post("/api/pdf/upload", status_code=202)
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    """Non-blocking upload: saves file, fires detached indexing thread, returns 202 in <2s."""
    from fastapi.responses import JSONResponse

    agent = get_pdf_agent()

    # Resolve user (non-blocking)
    current_user = None
    if credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            if payload:
                current_user = db.query(User).filter(User.id == int(payload["sub"])).first()
        except Exception:
            pass

    # Save file to disk (the only synchronous I/O — typically <1s)
    upload_dir = os.path.join("data", "uploads", session_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File write failed: {str(e)}")

    # Quick hash check — if already fully indexed, load from cache into memory
    try:
        fhash = _file_content_hash(file_path)
        if _index_registry.is_analysis_complete(fhash):
            # Ensure the system is loaded into memory for this session
            if session_id not in agent.systems:
                cache_path = _get_cache_path(fhash)
                if os.path.exists(cache_path):
                    system = agent.get_system(session_id)
                    _load_document_cache(fhash, system)
            file_url = f"{BACKEND_URL}/api/uploads/{session_id}/{file.filename}"
            return JSONResponse(status_code=200, content={
                "message": "File already indexed.",
                "filename": file.filename,
                "url": file_url,
                "indexing": False,
            })
    except Exception:
        pass

    # Persist file metadata to DB (fast, non-critical)
    if current_user:
        try:
            ws = db.query(Workspace).filter(Workspace.user_id == current_user.id).first()
            file_size = os.path.getsize(file_path)
            ext = os.path.splitext(file.filename)[-1].lstrip(".").lower() or "bin"
            file_record = FileModel(
                user_id=current_user.id,
                workspace_id=ws.id if ws else None,
                filename=os.path.basename(file_path),
                original_name=file.filename,
                file_type=ext,
                mime_type=file.content_type,
                size_bytes=file_size,
                storage_path=file_path,
            )
            db.add(file_record)
            db.commit()
        except Exception as db_err:
            db.rollback()
            print(f"UPLOAD DB WARNING: {db_err}")

    # ── FIRE DETACHED THREAD (truly non-blocking) ──
    # NOTE: use status "queued" (NOT "processing") here. The background thread's
    # concurrency guard bails if it sees status=="processing", so pre-setting
    # "processing" made the thread think another worker was already running and
    # return immediately — nothing ever got indexed (self-deadlock).
    task_key = f"{session_id}/{file.filename}"
    with _indexing_lock:
        indexing_status[task_key] = {"status": "queued", "progress": "queued"}

    worker = threading.Thread(
        target=_index_pdf_background,
        args=(agent, file_path, session_id, file.filename),
        daemon=True,
    )
    worker.start()

    # Return 202 Accepted immediately
    file_url = f"{BACKEND_URL}/api/uploads/{session_id}/{file.filename}"
    return JSONResponse(status_code=202, content={
        "message": "File uploaded. Indexing started.",
        "filename": file.filename,
        "url": file_url,
        "session_id": session_id,
        "indexing": True,
    })

@app.post("/api/pdf/chat")
def chat_pdf(
    request: PDFChatRequest,
    raw_request: Request = None,
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    pdf_ag   = get_pdf_agent()
    # Use user-provided Groq key if available, for the chat LLM call
    user_key = raw_request.headers.get("x-groq-api-key", "").strip() if raw_request else ""
    chat_ag  = get_chat_agent(groq_api_key_override=user_key or None)
    try:
        # Use the session_id as-is for the agent (it's an in-memory key).
        agent_sid = request.session_id

        # Safety net: if session not in memory, try to recover from cache
        if agent_sid not in pdf_ag.systems:
            upload_dir = os.path.join("data", "uploads", agent_sid)
            if os.path.isdir(upload_dir):
                for fname in os.listdir(upload_dir):
                    if fname.lower().endswith(".pdf"):
                        fpath = os.path.join(upload_dir, fname)
                        try:
                            fhash = _file_content_hash(fpath)
                            cache_path = _get_cache_path(fhash)
                            if os.path.exists(cache_path):
                                system = pdf_ag.get_system(agent_sid)
                                _load_document_cache(fhash, system)
                                print(f"[CHAT] Recovered session {agent_sid} from cache")
                                break
                        except Exception:
                            pass
        try:
            db_sid = str(uuid.UUID(request.session_id))
        except (ValueError, AttributeError):
            db_sid = str(uuid.uuid5(uuid.NAMESPACE_DNS, request.session_id))

        # Resolve the current user (optional)
        current_user = None
        if credentials:
            try:
                payload = decode_access_token(credentials.credentials)
                if payload:
                    current_user = db.query(User).filter(User.id == int(payload["sub"])).first()
            except Exception:
                pass

        # Persist user message
        if current_user:
            session = db.query(ChatSession).filter(ChatSession.session_id == db_sid).first()
            if not session:
                ws = db.query(Workspace).filter(Workspace.user_id == current_user.id).first()
                if ws:
                    title = request.query[:50] + "..." if len(request.query) > 50 else request.query
                    session = ChatSession(
                        session_id=db_sid,
                        user_id=current_user.id,
                        workspace_id=ws.id,
                        title=title,
                        session_type=SessionType.pdf
                    )
                    db.add(session)
                    db.flush()

            user_msg = ChatMessage(
                session_id=db_sid,
                sender_type=SenderType.user,
                content=request.query
            )
            db.add(user_msg)

        # Two-stage pipeline:
        # Stage 1 — RAG retrieval (structured: answer text + equations + tables)
        # Stage 2 — LLM formatting via chat_agent (grounded, clean markdown output)
        result = chat_ag.run(
            query=request.query,
            history=[],
            session_id=agent_sid,
            pdf_agent_instance=pdf_ag,
        )

        # Normalise output keys so frontend always sees {answer, equations, tables, sources}
        answer    = result.get("response") or result.get("answer") or ""
        equations = result.get("equations", [])
        tables    = result.get("tables", [])
        sources   = result.get("sources", [])

        if current_user:
            ai_msg = ChatMessage(
                session_id=db_sid,
                sender_type=SenderType.agent,
                content=answer,
                message_metadata={
                    "equations": equations,
                    "tables":    tables,
                    "sources":   sources,
                }
            )
            db.add(ai_msg)
            if 'session' in dir() and session:
                session.last_message_at = func.now()
            db.commit()

        return {
            "answer":    answer,
            "equations": equations,
            "tables":    tables,
            "sources":   sources,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        print(f"CHAT_PDF ERROR: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.post("/api/pdf/chat/stream")
async def chat_pdf_stream(request: PDFChatRequest):
    """Streaming chat endpoint - returns answer word-by-word via SSE for instant perceived speed."""
    from fastapi.responses import StreamingResponse

    agent = get_pdf_agent()
    result = agent.get_response(request.query, request.session_id)
    answer = result.get("answer", "")

    def generate():
        import json as _json
        meta = {k: v for k, v in result.items() if k != "answer"}
        yield f"data: {_json.dumps({'type': 'meta', 'data': meta})}\n\n"
        words = answer.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield f"data: {_json.dumps({'type': 'token', 'data': chunk})}\n\n"
        yield f"data: {_json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/pdf/list/{session_id}")
def list_pdfs(session_id: str):
    agent = get_pdf_agent()
    files = agent.get_uploaded_pdfs(session_id)
    return {"files": files}

@app.delete("/api/pdf/clear/{session_id}")
def clear_context(session_id: str):
    agent = get_pdf_agent()
    agent.clear_context(session_id)
    return {"message": "Context cleared successfully"}


class PDFReindexRequest(BaseModel):
    session_id: str
    filename: str


@app.post("/api/pdf/reindex")
async def reindex_pdf(request: PDFReindexRequest):
    """Re-index an already-uploaded PDF so the agent can chat with it again
    (e.g. after a page refresh when the in-memory session was lost)."""
    agent = get_pdf_agent()

    # If the session is already loaded, skip expensive re-processing
    if request.session_id in agent.systems:
        return {"message": "Session already indexed", "status": "ready"}

    pdf_path = os.path.join("data", "uploads", request.session_id, request.filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(
            status_code=404,
            detail=f"PDF file not found on disk: {request.filename}",
        )

    try:
        result = agent.process_pdf_with_name(pdf_path, request.session_id, request.filename)
        return {"message": result, "status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Figure Analysis Endpoints

@app.get("/api/pdf/figures")
def get_figures(session_id: str, filename: str, pdf_url: Optional[str] = None):
    """Extract and list figures from a PDF"""
    agent = get_vision_agent()
    safe_filename = re.sub(r'[<>:"|?*]', '_', filename)
    pdf_path = os.path.join("data", "uploads", session_id, safe_filename)
    
    try:
        ensure_pdf_exists(pdf_path, pdf_url)
    except Exception as e:
        # Ignore ensure error if file actually exists, else raise
        if not os.path.exists(pdf_path):
            raise
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found")
        
    figure_paths = agent.extract_figures(pdf_path, session_id)
    
    # Convert local paths to accessible URLs
    figure_urls = []
    for path in figure_paths:
        # path is like data/uploads/{session_id}/figures/{img_name}
        rel_path = path.replace("\\", "/").replace("data/uploads/", "")
        figure_urls.append({
            "url": f"{BACKEND_URL}/api/uploads/{rel_path}",
            "local_path": path
        })
        
    return {"figures": figure_urls}

class SummarizeRequest(BaseModel):
    session_id: str
    filename: str
    pdf_url: Optional[str] = None

class CompareRequest(BaseModel):
    session_id_a: str
    filename_a: str
    pdf_url_a: Optional[str] = None
    session_id_b: str
    filename_b: str
    pdf_url_b: Optional[str] = None

class KGRequest(BaseModel):
    session_id: str
    filename: str
    pdf_url: Optional[str] = None

class KGChatRequest(BaseModel):
    session_id: str
    filename: str
    query: str
    pdf_url: Optional[str] = None

import requests

import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def ensure_pdf_exists(pdf_path: str, pdf_url: Optional[str]):
    if not os.path.exists(pdf_path):
        if pdf_url:
            try:
                os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

                session = requests.Session()
                retry = Retry(
                    total=5,
                    connect=3,
                    backoff_factor=1.0,
                    status_forcelist=[429, 500, 502, 503, 504],
                    respect_retry_after_header=True,
                )
                adapter = HTTPAdapter(max_retries=retry)
                session.mount('http://', adapter)
                session.mount('https://', adapter)

                h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
                r = session.get(pdf_url, headers=h, timeout=(15, 120), stream=True)
                r.raise_for_status()

                content_length = r.headers.get("Content-Length")
                downloaded = 0
                with open(pdf_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=256 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)

                if content_length and downloaded < int(content_length):
                    os.remove(pdf_path)
                    raise IOError(
                        f"Incomplete download: got {downloaded} of {content_length} bytes"
                    )
            except Exception as e:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                raise HTTPException(status_code=400, detail=f"Failed to auto-download PDF from {pdf_url}. Error: {e}")
        else:
            raise HTTPException(status_code=404, detail=f"PDF file not found at {pdf_path} and no auto-download URL was provided.")

@app.post("/api/pdf/summarize")
def extract_summary(request: SummarizeRequest):
    try:
        pdf_path = os.path.join("data", "uploads", request.session_id, request.filename)
        ensure_pdf_exists(pdf_path, request.pdf_url)
            
        output_path = f"{pdf_path}.summary.json"

        if not os.path.exists(output_path):
            cmd = [
                sys.executable,
                RUN_SUMMARIZER_SCRIPT,
                pdf_path,
                output_path,
                os.getenv("GROQ_API_KEY", ""),
                SUMMARIZER_MODEL
            ]

            # Bound the model-backed summarizer so a stalled call can't hang the
            # request forever; surface a clear timeout instead.
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=SUMMARIZER_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                # Drop any partial output so the next attempt regenerates cleanly.
                if os.path.exists(output_path):
                    try: os.remove(output_path)
                    except OSError: pass
                raise HTTPException(
                    status_code=504,
                    detail="Summarizer timed out — the document may be very large or the model is slow. Please try again.",
                )
            if proc.returncode != 0:
                if os.path.exists(output_path):
                    try: os.remove(output_path)
                    except OSError: pass
                raise HTTPException(status_code=500, detail=f"Summarizer failed: {proc.stderr}")

        # Guard against a corrupt/partial cache file from a prior failed run.
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            if os.path.exists(output_path):
                try: os.remove(output_path)
                except OSError: pass
            raise HTTPException(status_code=500, detail=f"Summary output was unreadable; please retry. ({e})")
            
        report_url = None
        if data.get("report_pdf_base64"):
            report_filename = f"{request.filename}.report.pdf"
            report_path = os.path.join("data", "uploads", request.session_id, report_filename)
            with open(report_path, "wb") as f:
                f.write(base64.b64decode(data["report_pdf_base64"]))
            report_url = f"{BACKEND_URL}/api/uploads/{request.session_id}/{report_filename}"
            
        return {
            "title": data.get("title", "Summary"),
            "summary": data.get("summary_markdown", "Could not generate summary."),
            "report_url": report_url
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error in Summarizer: {str(e)}")

@app.post("/api/pdf/compare")
def compare_papers(request: CompareRequest):
    try:
        pdf_path_a = os.path.join("data", "uploads", request.session_id_a, request.filename_a)
        ensure_pdf_exists(pdf_path_a, request.pdf_url_a)
        
        pdf_path_b = os.path.join("data", "uploads", request.session_id_b, request.filename_b)
        ensure_pdf_exists(pdf_path_b, request.pdf_url_b)
            
        output_path = f"{pdf_path_a}.compare.json"
        
        if not os.path.exists(output_path):
            cmd = [
                sys.executable,
                RUN_COMPARISON_SCRIPT,
                pdf_path_a,
                pdf_path_b,
                output_path,
                os.getenv("GROQ_API_KEY", ""),
                "llama-3.3-70b-versatile"
            ]
            
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Comparison failed: {proc.stderr}")
                
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error in Comparison: {str(e)}")

@app.post("/api/pdf/knowledge-graph")
def generate_kg(request: KGRequest):
    try:
        pdf_path = os.path.join("data", "uploads", request.session_id, request.filename)
        ensure_pdf_exists(pdf_path, request.pdf_url)
            
        output_path = f"{pdf_path}.kg.html"
        vstore_path = f"{pdf_path}.vstore.json"
        
        if not os.path.exists(output_path) or not os.path.exists(vstore_path):
            cmd = [
                sys.executable,
                RUN_KG_SCRIPT,
                pdf_path,
                output_path
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True)
            
            # parse json output
            try:
                res = json.loads(proc.stdout)
                if "error" in res:
                    raise HTTPException(status_code=500, detail=f"KG Extraction failed: {res['error']}")
            except json.JSONDecodeError:
                if proc.returncode != 0:
                    raise HTTPException(status_code=500, detail=f"KG Extraction failed. Code: {proc.returncode}. Stderr: {proc.stderr}. Stdout: {proc.stdout}")
        # Serve the HTML file from the static uploads mount
        rel_path = output_path.replace("\\", "/").replace("data/uploads/", "").lstrip("/")
        url = f"{BACKEND_URL}/api/uploads/{rel_path}"
        
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error in KG: {str(e)}")

@app.post("/api/pdf/knowledge-graph/chat")
def generate_kg_chat(request: KGChatRequest):
    try:
        pdf_path = os.path.join("data", "uploads", request.session_id, request.filename)
        vstore_path = f"{pdf_path}.vstore.json"
        if not os.path.exists(vstore_path):
            # If the vector store doesn't exist but we have a url, the user might need to click "extract graph" first.
            # But let's at least make sure the pdf itself is downloaded
            ensure_pdf_exists(pdf_path, request.pdf_url)
            raise HTTPException(status_code=404, detail="KG Vectors not found. Please extract the graph first.")
            
        cmd = [
            sys.executable,
            RUN_KG_QUERY_SCRIPT,
            vstore_path,
            request.query
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=f"KG Chat failed: {proc.stderr}")
            
        try:
            # We expect the inner pipeline script to cleanly dump raw JSON
            res = json.loads(proc.stdout)
            if "error" in res:
                raise HTTPException(status_code=500, detail=res["error"])
            return {"answer": res.get("answer", "No answer generated.")}
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail=f"Invalid response from query engine: {proc.stdout}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error in KG Chat: {str(e)}")

@app.post("/api/pdf/analyze-figure")
async def analyze_figure(request: FigureAnalysisRequest):
    """Analyze a specific figure using vision models"""
    agent = get_vision_agent()
    if not os.path.exists(request.image_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    try:
        analysis = await agent.analyze_figure(request.image_path, request.query)
        return {"analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/import")
async def import_paper(
    request: ImportPaperRequest,
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    """Download a paper from ArXiv and initiate figure extraction"""
    # Resolve optional auth
    current_user = None
    if credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            if payload:
                current_user = db.query(User).filter(User.id == int(payload["sub"])).first()
        except Exception:
            pass

    try:
        # Determine if we should use arxiv client
        raw_id = request.paper_id
        is_arxiv = False
        if "arxiv.org" in raw_id:
            raw_id = raw_id.split("/")[-1].replace(".pdf", "")
            is_arxiv = True
        elif re.match(r'^\d{4}\.\d{4,5}(v\d+)?$', raw_id):
            is_arxiv = True

        # Save directory
        upload_dir = os.path.join("data", "uploads", request.session_id)
        os.makedirs(upload_dir, exist_ok=True)

        # Filename logic
        safe_title = re.sub(r'[^\w\s-]', '', request.title).strip().replace(' ', '_')[:50]
        filename = f"{safe_title}_{raw_id}.pdf".replace("/", "_")
        file_path = os.path.join(upload_dir, filename)

        if is_arxiv:
            arxiv_pdf_url = f"https://arxiv.org/pdf/{raw_id}.pdf"
            try:
                ensure_pdf_exists(file_path, arxiv_pdf_url)
            except Exception:
                if request.pdf_url and request.pdf_url != arxiv_pdf_url:
                    ensure_pdf_exists(file_path, request.pdf_url)
                else:
                    raise
        else:
            if request.pdf_url:
                ensure_pdf_exists(file_path, request.pdf_url)
            else:
                raise HTTPException(status_code=400, detail="Not an ArXiv ID and no PDF URL provided to download. Cannot index this paper.")

        # Stage 1: Fast text indexing so chat is usable immediately
        pdf_agent_inst = get_pdf_agent()
        system = pdf_agent_inst.get_system(request.session_id)
        system.process_document_text_first(file_path)
        if request.session_id not in pdf_agent_inst.uploaded_files:
            pdf_agent_inst.uploaded_files[request.session_id] = []
        if filename not in pdf_agent_inst.uploaded_files[request.session_id]:
            pdf_agent_inst.uploaded_files[request.session_id].append(filename)

        # Stage 2: Heavy work (figures + asset extraction) in background thread
        def _background_index(fp, sid, fn):
            try:
                vis = get_vision_agent()
                vis.extract_figures(fp, sid)
            except Exception as exc:
                print(f"[IMPORT-BG] figure extraction failed (non-fatal): {exc}")
            try:
                system_bg = pdf_agent_inst.get_system(sid)
                system_bg.process_document_assets()
                # Save to cache for instant reload on future imports
                try:
                    fhash = _file_content_hash(fp)
                    _save_document_cache(fhash, system_bg)
                    _index_registry.mark_analysis_complete(fhash)
                except Exception:
                    pass
            except Exception as exc:
                print(f"[IMPORT-BG] asset extraction failed (non-fatal): {exc}")
                try:
                    system_bg = pdf_agent_inst.get_system(sid)
                    system_bg._stage2_complete = True
                    system_bg._stage2_error = str(exc)
                except Exception:
                    pass

        import threading
        threading.Thread(
            target=_background_index,
            args=(file_path, request.session_id, filename),
            daemon=True,
        ).start()

        # Get file size
        file_size_bytes = os.path.getsize(file_path)
        size_mb = round(file_size_bytes / (1024 * 1024), 1)
        size_str = f"{size_mb} MB" if size_mb >= 0.1 else f"{round(file_size_bytes / 1024)} KB"

        # Persist to DB when authenticated
        if current_user:
            try:
                ws = db.query(Workspace).filter(Workspace.user_id == current_user.id).first()
                ext = os.path.splitext(filename)[-1].lstrip(".").lower() or "pdf"
                file_record = FileModel(
                    user_id=current_user.id,
                    workspace_id=ws.id if ws else None,
                    filename=filename,
                    original_name=f"{request.title}.pdf",
                    file_type=ext,
                    mime_type="application/pdf",
                    size_bytes=file_size_bytes,
                    storage_path=file_path,
                )
                db.add(file_record)
                db.commit()
            except Exception as db_err:
                db.rollback()
                print(f"IMPORT DB WARNING: {db_err}")

        return {
            "message": "Paper imported and ready for chat. Figures and tables are being extracted in the background.",
            "filename": filename,
            "pdf_url": f"{BACKEND_URL}/api/uploads/{request.session_id}/{filename}",
            "pdf_size": size_str,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import paper: {str(e)}")


# Podcast Endpoints

async def generate_podcast_task(task_id: str, request: PodcastRequest):
    """Background task for podcast generation"""
    try:
        agent = get_podcast_agent()
        
        def progress_callback(message: str, progress: int):
            podcast_tasks[task_id]["progress"] = progress
            podcast_tasks[task_id]["message"] = message
        
        # Update status to processing
        podcast_tasks[task_id]["status"] = "processing"
        podcast_tasks[task_id]["message"] = "Starting podcast generation..."
        
        # Generate podcast
        audio_bytes = await agent.generate_podcast(
            paper_content=request.paper_content,
            length=request.length,
            voices=request.voices,
            add_music=request.add_music,
            progress_callback=progress_callback
        )
        
        # Store result
        podcast_tasks[task_id]["status"] = "completed"
        podcast_tasks[task_id]["progress"] = 100
        podcast_tasks[task_id]["message"] = "Podcast generated successfully!"
        podcast_tasks[task_id]["audio_data"] = audio_bytes
        
    except Exception as e:
        podcast_tasks[task_id]["status"] = "failed"
        podcast_tasks[task_id]["message"] = f"Error: {str(e)}"
        podcast_tasks[task_id]["progress"] = 0

@app.post("/api/podcast/generate")
async def generate_podcast(request: PodcastRequest, background_tasks: BackgroundTasks):
    """Start podcast generation as a background task"""
    task_id = str(uuid.uuid4())
    
    # Initialize task
    podcast_tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "message": "Podcast generation queued",
        "audio_data": None
    }
    
    # Add to background tasks
    background_tasks.add_task(generate_podcast_task, task_id, request)
    
    return PodcastResponse(
        task_id=task_id,
        status="pending",
        message="Podcast generation started"
    )

@app.get("/api/podcast/status/{task_id}")
def get_podcast_status(task_id: str):
    """Get the status of a podcast generation task"""
    if task_id not in podcast_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = podcast_tasks[task_id]
    
    return PodcastStatusResponse(
        task_id=task_id,
        status=task["status"],
        progress=task["progress"],
        message=task["message"],
        audio_url=f"/api/podcast/download/{task_id}" if task["status"] == "completed" else None
    )

@app.get("/api/podcast/download/{task_id}")
def download_podcast(task_id: str):
    """Download the generated podcast audio"""
    if task_id not in podcast_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = podcast_tasks[task_id]
    
    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="Podcast not ready yet")
    
    if not task["audio_data"]:
        raise HTTPException(status_code=500, detail="Audio data not found")
    
    return Response(
        content=task["audio_data"],
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"attachment; filename=podcast_{task_id}.mp3"
        }
    )

# ── Video Endpoints ──────────────────────────────────────────────────────────

class VideoGenerateRequest(BaseModel):
    paper_content: str
    paper_title: str = ""
    num_slides: int = 7
    voice: str = "en-US-AndrewNeural"

class VideoGenerateResponse(BaseModel):
    task_id: str
    status: str
    message: str

class VideoStatusResponse(BaseModel):
    task_id: str
    status: str  # pending | processing | completed | failed
    progress: int
    message: str
    video_url: Optional[str] = None

async def _run_video_task(task_id: str, request: VideoGenerateRequest):
    try:
        agent = get_video_agent()
        video_tasks[task_id]["status"] = "processing"
        video_tasks[task_id]["message"] = "Starting…"

        def _prog(msg: str, pct: int):
            video_tasks[task_id]["progress"] = pct
            video_tasks[task_id]["message"] = msg

        full_text = f"{request.paper_title}\n\n{request.paper_content}" if request.paper_title else request.paper_content
        video_bytes = agent.generate_video(
            text=full_text,
            num_slides=max(4, min(12, request.num_slides)),
            voice=request.voice,
            progress_callback=_prog,
        )
        video_tasks[task_id]["status"] = "completed"
        video_tasks[task_id]["progress"] = 100
        video_tasks[task_id]["message"] = "Video ready!"
        video_tasks[task_id]["video_data"] = video_bytes
    except Exception as e:
        video_tasks[task_id]["status"] = "failed"
        video_tasks[task_id]["message"] = f"Error: {str(e)}"
        video_tasks[task_id]["progress"] = 0

@app.post("/api/video/generate")
async def generate_video(request: VideoGenerateRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    video_tasks[task_id] = {"status": "pending", "progress": 0, "message": "Queued", "video_data": None}
    background_tasks.add_task(_run_video_task, task_id, request)
    return VideoGenerateResponse(task_id=task_id, status="pending", message="Video generation started")

@app.get("/api/video/status/{task_id}")
def get_video_status(task_id: str):
    if task_id not in video_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    t = video_tasks[task_id]
    return VideoStatusResponse(
        task_id=task_id,
        status=t["status"],
        progress=t["progress"],
        message=t["message"],
        video_url=f"/api/video/download/{task_id}" if t["status"] == "completed" else None,
    )

@app.get("/api/video/download/{task_id}")
def download_video(task_id: str):
    if task_id not in video_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    t = video_tasks[task_id]
    if t["status"] != "completed":
        raise HTTPException(status_code=400, detail="Video not ready yet")
    if not t["video_data"]:
        raise HTTPException(status_code=500, detail="Video data missing")
    return Response(
        content=t["video_data"],
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename=presentation_{task_id}.mp4"},
    )

# YouTube Endpoints

@app.post("/api/youtube/search")
def search_youtube_videos(request: YouTubeSearchRequest):
    """Search for YouTube videos related to a research paper"""
    # If no API key configured, return empty results instead of 500
    if not YOUTUBE_API_KEY:
        return YouTubeSearchResponse(
            videos=[],
            query_used=request.paper_title
        )
    try:
        agent = get_youtube_agent()
        
        # Search for videos
        videos = agent.search_videos(
            paper_title=request.paper_title,
            paper_abstract=request.paper_abstract,
            max_results=request.max_results
        )
        
        # Build query for response
        query_used = agent._build_search_query(request.paper_title, request.paper_abstract)
        
        return YouTubeSearchResponse(
            videos=[YouTubeVideo(**video) for video in videos],
            query_used=query_used
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Citation Endpoints

@app.post("/api/citation/search")
def search_citations(request: CitationSearchRequest):
    agent = get_citation_agent()
    try:
        results = agent.search_semantic_scholar(request.sentence)
        return {"papers": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/citation/format")
def format_citation(request: CitationFormatRequest):
    agent = get_citation_agent()
    try:
        results = agent.format_citation(request.title, request.authors, request.year, request.url)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Quiz Endpoints

@app.post("/api/pdf/quiz")
def generate_quiz(request: QuizRequest):
    """
    Generate a multiple-choice quiz from an already-uploaded PDF.
    The PDF must have been uploaded via /api/pdf/upload first.
    """
    pdf_path = os.path.join("data", "uploads", request.session_id, request.filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(
            status_code=404,
            detail=f"PDF not found for session '{request.session_id}'. Please upload it first."
        )

    # Clamp num_questions to allowed values
    valid_counts = {5, 10, 20}
    num_questions = request.num_questions if request.num_questions in valid_counts else 5

    valid_difficulties = {"Easy", "Medium", "Hard"}
    difficulty = request.difficulty if request.difficulty in valid_difficulties else "Medium"

    agent = get_quiz_agent()
    try:
        questions = agent.generate_quiz(
            pdf_path=pdf_path,
            num_questions=num_questions,
            difficulty=difficulty,
        )
        return {"questions": questions}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")



# ═══════════════════════════════════════════════════════════════════════════
# Document Download & Vector Purge Endpoints
# ═══════════════════════════════════════════════════════════════════════════

UPLOAD_BASE_DIR = os.path.join("data", "uploads")


@app.get("/api/pdf/download/{session_id}/{file_name}")
async def download_uploaded_pdf(session_id: str, file_name: str):
    """Download a previously uploaded PDF by session and filename."""
    from pathlib import Path
    file_path = Path(UPLOAD_BASE_DIR) / session_id / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="The requested PDF file does not exist on the server.")
    return FileResponse(path=str(file_path), media_type="application/pdf", filename=file_name)


@app.delete("/api/pdf/delete/{file_name}")
async def delete_uploaded_pdf(
    file_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an uploaded PDF: physical file, vectors, DB records (File + associated ChatSession/messages)."""
    from pathlib import Path

    # Search for the file across all session directories
    base = Path(UPLOAD_BASE_DIR)
    found_path: Optional[Path] = None
    found_session: Optional[str] = None

    if base.exists():
        for session_dir in base.iterdir():
            if session_dir.is_dir():
                candidate = session_dir / file_name
                if candidate.exists():
                    found_path = candidate
                    found_session = session_dir.name
                    break

    # Delete physical file + session directory artifacts
    if found_path:
        try:
            session_dir_path = found_path.parent
            os.remove(found_path)
            # Clean up derived files (summary, report, compare, kg, figures)
            for artifact in session_dir_path.iterdir():
                if artifact.name.startswith(found_path.stem):
                    try:
                        os.remove(artifact)
                    except Exception:
                        pass
            figures_dir = session_dir_path / "figures"
            if figures_dir.is_dir():
                shutil.rmtree(figures_dir, ignore_errors=True)
            # Remove session dir if empty
            remaining = list(session_dir_path.iterdir())
            if not remaining:
                session_dir_path.rmdir()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file from storage: {str(e)}")

    # Vector purge — remove embeddings and in-memory RAG system for this session
    try:
        agent = get_pdf_agent()
        if found_session and found_session in agent.systems:
            system = agent.systems[found_session]
            if hasattr(system, "vector_store") and system.vector_store is not None:
                collection = getattr(system.vector_store, "_collection", None)
                if collection is not None:
                    collection.delete(where={"source": file_name})
            del agent.systems[found_session]
            if found_session in agent.uploaded_files:
                files = agent.uploaded_files[found_session]
                if file_name in files:
                    files.remove(file_name)
    except Exception as e:
        print(f"Warning: Vector DB purge failed: {str(e)}")

    # DB cleanup — remove File record and associated ChatSession (cascades to messages)
    db_file = db.query(FileModel).filter(
        FileModel.filename == file_name,
        FileModel.user_id == current_user.id,
    ).first()
    if db_file:
        db.delete(db_file)

    if found_session:
        chat_session = db.query(ChatSession).filter(
            ChatSession.session_id == found_session,
            ChatSession.user_id == current_user.id,
        ).first()
        if chat_session:
            db.delete(chat_session)

    db.commit()

    return {"status": "success", "message": f"File '{file_name}' and all associated data purged."}


# ═══════════════════════════════════════════════════════════════════════════
# PHASE 2: Server-Side Session Invalidation
# ═══════════════════════════════════════════════════════════════════════════

class InvalidateSessionRequest(BaseModel):
    session_id: str


@app.post("/api/pdf/session/invalidate")
async def invalidate_session(request: InvalidateSessionRequest):
    """Explicitly invalidate a session: purge in-memory state and registry entries."""
    sid = request.session_id
    agent = get_pdf_agent()

    # Remove in-memory RAG system
    if sid in agent.systems:
        del agent.systems[sid]
    if sid in agent.uploaded_files:
        del agent.uploaded_files[sid]

    # Remove from persistent hash registry
    _index_registry.remove_by_session(sid)

    # Clear indexing status entries for this session
    with _indexing_lock:
        keys_to_remove = [k for k in indexing_status if k.startswith(f"{sid}/")]
        for k in keys_to_remove:
            del indexing_status[k]

    return {"status": "invalidated", "session_id": sid}


@app.post("/api/pdf/session/create")
async def create_session():
    """Create a fresh server-acknowledged session ID."""
    new_id = str(uuid.uuid4())
    return {"session_id": new_id, "status": "active"}


if __name__ == "__main__":
    # reload=True restarts the server on ANY file change, wiping in-memory session
    # state (agent.systems / indexing_status) and causing stuck spinners. Default to
    # stable; opt into autoreload only for active development via UVICORN_RELOAD=true.
    _reload = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=_reload)
