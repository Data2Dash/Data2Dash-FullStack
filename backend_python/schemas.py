"""
Data2Dash — Pydantic Schemas
Covers auth, users, files, chat sessions/messages, search history, and workspace.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Auth ───────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


TokenResponse.model_rebuild()


# ── Workspace ──────────────────────────────────────────────────────────────────

class WorkspaceOut(BaseModel):
    id: int
    user_id: int
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Files ──────────────────────────────────────────────────────────────────────

class FileOut(BaseModel):
    file_id: str
    user_id: Optional[int] = None
    workspace_id: Optional[int] = None
    filename: str
    original_name: str
    file_type: str
    mime_type: Optional[str]
    size_bytes: int
    storage_path: str
    session_id: str = ""
    url: str = ""
    is_deleted: bool
    uploaded_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    def model_post_init(self, __context: Any) -> None:
        import os
        if not self.session_id and self.storage_path:
            parts = self.storage_path.replace("\\", "/").split("/")
            idx = next((i for i, p in enumerate(parts) if p == "uploads"), -1)
            if idx >= 0 and len(parts) > idx + 1:
                self.session_id = parts[idx + 1]
        if not self.url and self.session_id and self.filename:
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
            self.url = f"{backend_url}/api/uploads/{self.session_id}/{self.filename}"


class FileVersionOut(BaseModel):
    version_id: int
    file_id: str
    version_number: int
    storage_path: str
    size_bytes: int
    change_summary: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Chat ───────────────────────────────────────────────────────────────────────

class ChatMessageOut(BaseModel):
    message_id: str
    session_id: str
    sender_type: str
    content: str
    message_metadata: Optional[Dict[str, Any]] = {}
    timestamp: datetime

    model_config = {"from_attributes": True}


class ChatSessionOut(BaseModel):
    session_id: str
    user_id: int
    workspace_id: int
    title: str
    session_type: str
    created_at: datetime
    updated_at: datetime
    last_message_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ChatSessionWithMessages(ChatSessionOut):
    messages: List[ChatMessageOut] = []


class SaveChatRequest(BaseModel):
    """Sent by the frontend to persist a completed chat exchange."""
    session_id: str
    session_type: str = "general"
    title: Optional[str] = "New Chat"
    messages: List[Dict[str, Any]]   # [{"role": "user"|"assistant", "content": "..."}]


# ── Search History ─────────────────────────────────────────────────────────────

class SearchHistoryOut(BaseModel):
    search_id: int
    user_id: Optional[int] = None
    query_text: str
    search_type: str
    result_count: Optional[int]
    timestamp: datetime

    model_config = {"from_attributes": True}


class SaveSearchRequest(BaseModel):
    """Sent by the frontend to persist a completed search."""
    query_text: str
    search_type: str = "academic"
    result_count: Optional[int] = None


# ── Workspace summary ──────────────────────────────────────────────────────────

class WorkspaceSummary(BaseModel):
    workspace: WorkspaceOut
    file_count: int
    session_count: int
    recent_files: List[FileOut]
    recent_sessions: List[ChatSessionOut]
    recent_searches: List[SearchHistoryOut]
