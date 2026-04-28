"""
Workspace Router — /api/workspace
Provides paginated access to the current user's files, chat sessions, and search history.
All endpoints require a valid JWT Bearer token.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import File, ChatSession, SearchHistory, Workspace, SenderType
from routers.auth import get_current_user, User
from schemas import (
    FileOut, ChatSessionOut, SearchHistoryOut, SaveSearchRequest,
    WorkspaceOut, WorkspaceSummary,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


# ── Helper: get (or 404) the workspace for the current user ───────────────────

def _get_workspace(user: User, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.user_id == user.id).first()
    if not ws:
        from routers.auth import _ensure_workspace
        _ensure_workspace(user, db)
        ws = db.query(Workspace).filter(Workspace.user_id == user.id).first()
        if not ws:
            raise HTTPException(status_code=404, detail="Failed to create workspace.")
    return ws


# ── Workspace overview ─────────────────────────────────────────────────────────

@router.get("", response_model=WorkspaceSummary)
@router.get("/", response_model=WorkspaceSummary, include_in_schema=False)
def get_workspace_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a dashboard-ready summary of the user's workspace."""
    ws = _get_workspace(current_user, db)

    file_count = db.query(File).filter(
        File.user_id == current_user.id, File.is_deleted == False
    ).count()

    session_count = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).count()

    recent_files = (
        db.query(File)
        .filter(File.user_id == current_user.id, File.is_deleted == False)
        .order_by(File.uploaded_at.desc())
        .limit(5)
        .all()
    )

    recent_sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.last_message_at.desc().nulls_last())
        .limit(5)
        .all()
    )

    recent_searches = (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == current_user.id)
        .order_by(SearchHistory.timestamp.desc())
        .limit(10)
        .all()
    )

    return WorkspaceSummary(
        workspace=WorkspaceOut.model_validate(ws),
        file_count=file_count,
        session_count=session_count,
        recent_files=[FileOut.model_validate(f) for f in recent_files],
        recent_sessions=[ChatSessionOut.model_validate(s) for s in recent_sessions],
        recent_searches=[SearchHistoryOut.model_validate(q) for q in recent_searches],
    )


# ── Files ──────────────────────────────────────────────────────────────────────

@router.get("/files", response_model=List[FileOut])
def list_files(
    file_type: Optional[str] = Query(None, description="Filter by file type, e.g. 'pdf'"),
    cursor: Optional[datetime] = Query(None, description="Keyset cursor — last seen uploaded_at"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Paginated list of the user's non-deleted files, newest first.
    Pass `cursor` (the `uploaded_at` of the last item on the previous page) to get the next page.
    """
    q = db.query(File).filter(
        File.user_id == current_user.id,
        File.is_deleted == False,
    )
    if file_type:
        q = q.filter(File.file_type == file_type.lower())
    if cursor:
        q = q.filter(File.uploaded_at < cursor)

    files = q.order_by(File.uploaded_at.desc()).limit(limit).all()
    return [FileOut.model_validate(f) for f in files]


@router.delete("/files/{file_id}", status_code=204)
def soft_delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a file (sets is_deleted=True). Data is preserved."""
    f = db.query(File).filter(
        File.file_id == file_id,
        File.user_id == current_user.id,
    ).first()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    f.is_deleted = True
    db.commit()


# ── Chat Sessions ──────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(
    session_type: Optional[str] = Query(None, description="Filter by type: pdf, ai, kg, general"),
    cursor: Optional[datetime] = Query(None, description="Keyset cursor — last seen last_message_at"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Paginated list of the user's chat sessions, most-recent-activity first.
    """
    q = db.query(ChatSession).filter(ChatSession.user_id == current_user.id)
    if session_type:
        q = q.filter(ChatSession.session_type == session_type)
    if cursor:
        q = q.filter(ChatSession.last_message_at < cursor)

    sessions = q.order_by(ChatSession.last_message_at.desc().nulls_last()).limit(limit).all()
    return [ChatSessionOut.model_validate(s) for s in sessions]


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete a chat session and all its messages."""
    s = db.query(ChatSession).filter(
        ChatSession.session_id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(s)
    db.commit()


@router.get("/sessions/{session_id}/messages")
def get_session_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all messages for a specific session."""
    s = db.query(ChatSession).filter(
        ChatSession.session_id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = []
    for m in s.messages:
        # Map backend SenderType to frontend roles: user → user, agent/system → ai
        role = "user" if m.sender_type == SenderType.user else "ai"
        messages.append({
            "role": role,
            "content": m.content,
            "sources": m.message_metadata.get("sources") if m.message_metadata else None,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None
        })
    return {"session_id": session_id, "title": s.title, "messages": messages}


# ── Search History ─────────────────────────────────────────────────────────────

@router.get("/searches", response_model=List[SearchHistoryOut])
def list_searches(
    search_type: Optional[str] = Query(None, description="Filter by type: academic, youtube, ai"),
    cursor: Optional[datetime] = Query(None, description="Keyset cursor — last seen timestamp"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Paginated list of the user's past search queries, newest first.
    """
    q = db.query(SearchHistory).filter(SearchHistory.user_id == current_user.id)
    if search_type:
        q = q.filter(SearchHistory.search_type == search_type)
    if cursor:
        q = q.filter(SearchHistory.timestamp < cursor)

    results = q.order_by(SearchHistory.timestamp.desc()).limit(limit).all()
    return [SearchHistoryOut.model_validate(r) for r in results]


@router.post("/searches", response_model=SearchHistoryOut, status_code=201)
def save_search(
    payload: SaveSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist a search query to the user's search history."""
    ws = _get_workspace(current_user, db)
    entry = SearchHistory(
        user_id=current_user.id,
        workspace_id=ws.id,
        query_text=payload.query_text,
        search_type=payload.search_type,
        result_count=payload.result_count,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return SearchHistoryOut.model_validate(entry)


@router.delete("/searches", status_code=204)
def clear_search_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear all search history for the current user."""
    db.query(SearchHistory).filter(SearchHistory.user_id == current_user.id).delete()
    db.commit()
