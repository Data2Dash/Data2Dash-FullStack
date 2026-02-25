import os
import shutil
import asyncio
import uuid
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from agents.pdf_agent import PDFAgent
from agents.search_agent import SearchAgent
from agents.podcast_agent import PodcastAgent
from agents.youtube_agent import YouTubeAgent
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
import uvicorn

# Auth imports
from database import engine, Base
from routers.auth import router as auth_router

# Initialize FastAPI app
# Create DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Youware AI Backend")

# Configure CORS
# NOTE: allow_origins=["*"] + allow_credentials=True is forbidden by the CORS spec.
# Must list origins explicitly when credentials are used.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Podcast task storage
podcast_tasks: Dict[str, dict] = {}

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

# Pydantic Models
class SearchRequest(BaseModel):
    query: str

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

# Endpoints

@app.get("/")
def health_check():
    return {"status": "ok", "message": "AI Backend is running"}

@app.post("/api/search")
def search(request: SearchRequest):
    agent = get_search_agent()
    try:
        result = agent.run(request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/papers/search")
def search_papers(request: SearchRequest):
    agent = get_search_agent()
    try:
        papers = agent.search_arxiv(request.query)
        return {"papers": papers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: str = Form(...)
):
    agent = get_pdf_agent()
    
    # Save file in session-specific directory
    upload_dir = os.path.join("data", "uploads", session_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    try:
        # Save the file permanently for the session
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process PDF (agent will use the permanent path)
        result = agent.process_pdf_with_name(file_path, session_id, file.filename)
        
        # Return accessible URL
        file_url = f"http://localhost:8000/api/uploads/{session_id}/{file.filename}"
        
        return {
            "message": result, 
            "filename": file.filename,
            "url": file_url
        }
        
    except Exception as e:
        # Optional: clean up ONLY if the initial copy failed
        if os.path.exists(file_path) and not os.path.getsize(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pdf/chat")
def chat_pdf(request: PDFChatRequest):
    agent = get_pdf_agent()
    response = agent.get_response(request.query, request.session_id)
    return {"response": response}

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

# YouTube Endpoints

@app.post("/api/youtube/search")
def search_youtube_videos(request: YouTubeSearchRequest):
    """Search for YouTube videos related to a research paper"""
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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
