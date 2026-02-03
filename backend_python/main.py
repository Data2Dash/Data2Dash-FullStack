import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agents.pdf_agent import PDFAgent
from agents.search_agent import SearchAgent
from dotenv import load_dotenv
load_dotenv(".env")
import uvicorn

# Initialize FastAPI app
app = FastAPI(title="Youware AI Backend")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Agents
# Note: Ensure GROQ_API_KEY is set in environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment variables. Agents will fail to initialize.")

# Global instances
pdf_agent = None
search_agent = None

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

# Pydantic Models
class SearchRequest(BaseModel):
    query: str

class PDFChatRequest(BaseModel):
    query: str
    session_id: str

class PDFListResponse(BaseModel):
    files: List[str]

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
    
    # Save file temporarily
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process PDF
        result = agent.process_pdf_with_name(file_path, session_id, file.filename)
        
        # Clean up temp file
        os.remove(file_path)
        
        return {"message": result, "filename": file.filename}
        
    except Exception as e:
        if os.path.exists(file_path):
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
