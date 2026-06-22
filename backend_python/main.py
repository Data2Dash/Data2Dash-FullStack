import os
import shutil
import asyncio
import uuid
import re
import sys
import json
import subprocess
import base64
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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

def get_chat_agent():
    global chat_agent
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

@app.post("/api/pdf/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    agent = get_pdf_agent()

    # Resolve the current user from the optional Bearer token
    current_user = None
    if credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            if payload:
                current_user = db.query(User).filter(User.id == int(payload["sub"])).first()
        except Exception:
            pass  # anonymous upload — continue without DB persistence

    # Save file in session-specific directory
    upload_dir = os.path.join("data", "uploads", session_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    try:
        # Write file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Persist file metadata to DB when the user is authenticated
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
                print(f"UPLOAD DB WARNING: {db_err}")  # non-fatal — file is still on disk

        # Index PDF with the RAG agent
        result = agent.process_pdf_with_name(file_path, session_id, file.filename)

        # Return accessible URL
        file_url = f"{BACKEND_URL}/api/uploads/{session_id}/{file.filename}"

        return {
            "message": result,
            "filename": file.filename,
            "url": file_url,
        }

    except Exception as e:
        # Clean up empty files (partial writes)
        if os.path.exists(file_path) and not os.path.getsize(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/chat")
def chat_pdf(
    request: PDFChatRequest,
    db: Session = Depends(get_db),
    credentials = Depends(bearer_scheme),
):
    pdf_ag   = get_pdf_agent()
    chat_ag  = get_chat_agent()
    try:
        # Use the session_id as-is for the agent (it's an in-memory key).
        agent_sid = request.session_id
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
    pdf_path = os.path.join("data", "uploads", session_id, filename)
    
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
                
                # Setup session with retry logic
                session = requests.Session()
                retry = Retry(connect=3, backoff_factor=0.5, status_forcelist=[ 500, 502, 503, 504 ])
                adapter = HTTPAdapter(max_retries=retry)
                session.mount('http://', adapter)
                session.mount('https://', adapter)
                
                h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
                # Longer timeout to handle slow ArXiv responses
                r = session.get(pdf_url, headers=h, timeout=30)
                r.raise_for_status()
                with open(pdf_path, 'wb') as f:
                    f.write(r.content)
            except Exception as e:
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
                "gemma2-9b-it"
            ]
            
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Summarizer failed: {proc.stderr}")
                
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
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
                "gemma2-9b-it"
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
            import arxiv
            client = arxiv.Client()
            search = arxiv.Search(id_list=[raw_id])
            try:
                result = next(client.results(search))
                result.download_pdf(dirpath=upload_dir, filename=filename)
            except StopIteration:
                if request.pdf_url:
                    ensure_pdf_exists(file_path, request.pdf_url)
                else:
                    raise HTTPException(status_code=400, detail="Paper not found on ArXiv and no fallback PDF URL provided.")
        else:
            if request.pdf_url:
                ensure_pdf_exists(file_path, request.pdf_url)
            else:
                raise HTTPException(status_code=400, detail="Not an ArXiv ID and no PDF URL provided to download. Cannot index this paper.")

        # Extract figures immediately
        agent = get_vision_agent()
        figure_paths = agent.extract_figures(file_path, request.session_id)

        # Process with PDF agent for chat as well
        pdf_agent_inst = get_pdf_agent()
        pdf_agent_inst.process_pdf_with_name(file_path, request.session_id, filename)

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
            "message": "Paper imported and processed successfully",
            "filename": filename,
            "figure_count": len(figure_paths),
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



if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
