"""
Documents Router — /api/documents
Full CRUD for user manuscript library, JWT-protected.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import Document
from routers.auth import get_current_user, User

router = APIRouter(prefix="/api/documents", tags=["documents"])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class DocumentIn(BaseModel):
    id: str                        # client-generated uuid
    title: str
    body_html: str
    citations_json: str            # JSON-encoded array
    active_style: str = "apa"
    word_count: int = 0
    created_at: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    title: str
    body_html: str
    citations_json: str
    active_style: str
    word_count: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        title=doc.title,
        body_html=doc.body_html,
        citations_json=doc.citations_json,
        active_style=doc.active_style,
        word_count=doc.word_count,
        created_at=doc.created_at.isoformat() if doc.created_at else datetime.utcnow().isoformat(),
        updated_at=doc.updated_at.isoformat() if doc.updated_at else datetime.utcnow().isoformat(),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[DocumentOut])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all documents for the authenticated user, newest first."""
    docs = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    return [_to_out(d) for d in docs]


@router.post("/", response_model=DocumentOut, status_code=201)
def create_or_update_document(
    body: DocumentIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upsert a document (create if not found, update if exists)."""
    doc = db.query(Document).filter(
        Document.id == body.id,
        Document.user_id == current_user.id
    ).first()

    if doc:
        doc.title = body.title
        doc.body_html = body.body_html
        doc.citations_json = body.citations_json
        doc.active_style = body.active_style
        doc.word_count = body.word_count
    else:
        doc = Document(
            id=body.id,
            user_id=current_user.id,
            title=body.title,
            body_html=body.body_html,
            citations_json=body.citations_json,
            active_style=body.active_style,
            word_count=body.word_count,
        )
        db.add(doc)

    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a document owned by the current user."""
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
