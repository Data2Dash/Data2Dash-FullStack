"""
Data2Dash — SQLAlchemy ORM Models
Full schema: Users, Workspaces, Files, FileVersions, ChatSessions, ChatMessages, SearchHistory, Documents
"""
import uuid
import enum
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, BigInteger, Enum, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

from sqlalchemy import JSON

# Always use String(36) for UUID-like primary keys.
# On PostgreSQL you could use PG_UUID(as_uuid=False) for native storage,
# but String(36) works universally and avoids adapter mismatches on SQLite.
from sqlalchemy import String as _StrType
_UUID_TYPE  = _StrType(36)
_JSONB_TYPE = JSON


# ── Enums ──────────────────────────────────────────────────────────────────────

class SenderType(str, enum.Enum):
    user   = "user"
    system = "system"
    agent  = "agent"


class SessionType(str, enum.Enum):
    pdf     = "pdf"
    ai      = "ai"
    kg      = "kg"
    general = "general"


# ── Users ──────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String(255), unique=True, index=True, nullable=False)
    full_name       = Column(String(255))
    hashed_password = Column(String(255))           # NULL for OAuth-only accounts
    google_id       = Column(String(128), unique=True, index=True)
    avatar_url      = Column(Text)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at   = Column(DateTime(timezone=True))

    # Relationships
    workspace      = relationship("Workspace",     back_populates="user",          uselist=False, cascade="all, delete-orphan")
    files          = relationship("File",           back_populates="user",          cascade="all, delete-orphan")
    file_versions  = relationship("FileVersion",    back_populates="user",          cascade="all, delete-orphan")
    chat_sessions  = relationship("ChatSession",    back_populates="user",          cascade="all, delete-orphan")
    search_history = relationship("SearchHistory",  back_populates="user",          cascade="all, delete-orphan")
    documents      = relationship("Document",       back_populates="user",          cascade="all, delete-orphan")


# ── Workspace ──────────────────────────────────────────────────────────────────

class Workspace(Base):
    """One workspace per user — auto-created on registration."""
    __tablename__ = "workspaces"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    name         = Column(String(255), nullable=False, default="My Workspace")
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user           = relationship("User",          back_populates="workspace")
    files          = relationship("File",          back_populates="workspace")
    chat_sessions  = relationship("ChatSession",   back_populates="workspace")
    search_history = relationship("SearchHistory", back_populates="workspace")


# ── Files ──────────────────────────────────────────────────────────────────────

class File(Base):
    __tablename__ = "files"

    file_id       = Column(_UUID_TYPE,  primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id       = Column(Integer,     ForeignKey("users.id", ondelete="CASCADE"),      nullable=True, index=True)
    workspace_id  = Column(Integer,     ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)
    filename      = Column(String(512), nullable=False)           # sanitized storage name
    original_name = Column(String(512), nullable=False)           # user-facing original name
    file_type     = Column(String(50),  nullable=False)           # e.g. 'pdf', 'docx', 'csv'
    mime_type     = Column(String(100))
    size_bytes    = Column(BigInteger,  nullable=False, default=0)
    storage_path  = Column(Text,        nullable=False)           # relative path or S3 key
    is_deleted    = Column(Boolean,     nullable=False, default=False)
    uploaded_at   = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user      = relationship("User",      back_populates="files")
    workspace = relationship("Workspace", back_populates="files")
    versions  = relationship(
        "FileVersion",
        back_populates="file",
        cascade="all, delete-orphan",
        order_by="FileVersion.version_number.desc()",
    )


# ── File Versions ──────────────────────────────────────────────────────────────

class FileVersion(Base):
    """Optional versioning — each overwrite creates a new row."""
    __tablename__ = "file_versions"

    version_id     = Column(Integer,    primary_key=True, index=True)
    file_id        = Column(_UUID_TYPE, ForeignKey("files.file_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id        = Column(Integer,    ForeignKey("users.id",      ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer,    nullable=False)    # monotonically increasing per file
    storage_path   = Column(Text,       nullable=False)
    size_bytes     = Column(BigInteger, nullable=False)
    change_summary = Column(String(512))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("file_id", "version_number", name="uq_file_version"),)

    file = relationship("File", back_populates="versions")
    user = relationship("User", back_populates="file_versions")


# ── Chat Sessions ──────────────────────────────────────────────────────────────

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    session_id      = Column(_UUID_TYPE,  primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id         = Column(Integer,     ForeignKey("users.id",       ondelete="CASCADE"), nullable=False, index=True)
    workspace_id    = Column(Integer,     ForeignKey("workspaces.id",  ondelete="CASCADE"), nullable=False)
    title           = Column(String(512), nullable=False, default="New Chat")
    session_type    = Column(Enum(SessionType), nullable=False, default=SessionType.general)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), index=True)

    user      = relationship("User",      back_populates="chat_sessions")
    workspace = relationship("Workspace", back_populates="chat_sessions")
    messages  = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.timestamp.asc()",
    )


# ── Chat Messages ──────────────────────────────────────────────────────────────

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    message_id  = Column(_UUID_TYPE, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id  = Column(_UUID_TYPE, ForeignKey("chat_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    sender_type      = Column(Enum(SenderType), nullable=False)
    content          = Column(Text, nullable=False)
    message_metadata = Column(_JSONB_TYPE, default=lambda: {})   # sources, citations, equations, etc.
    timestamp        = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    session = relationship("ChatSession", back_populates="messages")


# ── Search History ─────────────────────────────────────────────────────────────

class SearchHistory(Base):
    __tablename__ = "search_history"

    search_id    = Column(Integer,    primary_key=True, index=True)
    user_id      = Column(Integer,    ForeignKey("users.id",      ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(Integer,    ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    query_text   = Column(Text,       nullable=False)
    search_type  = Column(String(50), nullable=False, default="academic")  # 'academic', 'youtube', 'ai'
    result_count = Column(Integer)
    filters      = Column(_JSONB_TYPE, default=lambda: {})
    timestamp    = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user      = relationship("User",      back_populates="search_history")
    workspace = relationship("Workspace", back_populates="search_history")


# ── Documents (existing — backward compatible) ─────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id             = Column(String,  primary_key=True, index=True)    # client-generated uuid string
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title          = Column(String,  nullable=False, default="Untitled")
    body_html      = Column(Text,    nullable=False, default="")
    citations_json = Column(Text,    nullable=False, default="[]")    # JSON array string
    active_style   = Column(String,  nullable=False, default="apa")
    word_count     = Column(Integer, nullable=False, default=0)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="documents")
