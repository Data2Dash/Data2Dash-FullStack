# Data2Dash — AI-Powered Research & Document Intelligence Platform

[![CI/CD Pipeline](https://github.com/Data2Dash/Data2Dash-FullStack/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/Data2Dash/Data2Dash-FullStack/actions/workflows/ci-cd.yml)
[![Live](https://img.shields.io/badge/Live-data2dash.org-brightgreen)](https://data2dash.org)

Data2Dash is a full-stack AI research platform that lets users upload academic PDFs, run multi-agent analysis pipelines, search the web and YouTube, generate podcasts and quizzes, and build citation documents — all powered by Groq's LLaMA inference API with automatic rate-limit fallback.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [AI Agents](#ai-agents)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Alerting](#monitoring--alerting)
- [Production Infrastructure](#production-infrastructure)
- [API Overview](#api-overview)

---

## Features

| Feature | Description |
|---|---|
| PDF Analysis | Upload PDFs, extract text, tables, equations, run RAG-based Q&A |
| Knowledge Graph | Visual entity-relationship graph generated from PDF content |
| AI Chat | Persistent multi-session chat powered by LLaMA 3.3-70B |
| Web Search | DuckDuckGo-powered academic search with AI summarization |
| YouTube Search | YouTube Data API search with transcript extraction and AI insights |
| Podcast Generator | Convert research papers into audio podcast scripts with narration |
| Video Generator | Stitch images and audio into an explainer video |
| Vision Analysis | Analyze images and screenshots using multimodal LLMs |
| Citation Manager | Build APA/MLA/IEEE citation documents with inline references |
| Quiz Generator | Auto-generate MCQ quizzes from uploaded PDFs via RAG |
| Critical Summarization | Side-by-side summary vs. critical review of papers |
| Workspace | Personal document library with upload history and chat sessions |

---

## Architecture Overview

```
                        ┌──────────────────────────────────────────┐
                        │            data2dash.org (HTTPS)         │
                        │         Let's Encrypt TLS (port 443)     │
                        └───────────────────┬──────────────────────┘
                                            │
                        ┌───────────────────▼──────────────────────┐
                        │             Nginx (Docker)                │
                        │   /              → React SPA (static)     │
                        │   /api/*         → FastAPI backend:8000   │
                        │   /auth/*        → FastAPI backend:8000   │
                        │   /auth/callback → React SPA (OAuth)      │
                        │   /metrics       → FastAPI backend:8000   │
                        └──────┬──────────────────┬────────────────┘
                               │                  │
               ┌───────────────▼──────┐  ┌────────▼───────────────┐
               │   React 18 + Vite    │  │  FastAPI + Uvicorn      │
               │   TypeScript         │  │  Python 3.12            │
               │   Zustand            │  │  9 AI Agents            │
               │   Tailwind CSS 3.4   │  │  SQLAlchemy ORM         │
               └──────────────────────┘  └───────────┬────────────┘
                                                     │
                   ┌─────────────────────────────────┼──────────────────────────┐
                   │                                 │                          │
   ┌───────────────▼──────┐        ┌─────────────────▼──────┐  ┌───────────────▼──────┐
   │  PostgreSQL 16        │        │   Groq API              │  │  FAISS + ChromaDB    │
   │  Users, Files,        │        │   LLaMA 3.3-70B         │  │  SentenceTransformers│
   │  Chat sessions,       │        │   LLaMA 3.1-8B          │  │  all-MiniLM-L6-v2   │
   │  Documents            │        │   Auto fallback chain   │  │  Vector store RAG    │
   └──────────────────────┘        └────────────────────────┘  └─────────────────────┘
                                                     │
                   ┌─────────────────────────────────┼──────────────────────────┐
                   │                                 │                          │
   ┌───────────────▼──────┐        ┌─────────────────▼──────┐  ┌───────────────▼──────┐
   │  Prometheus           │        │  Grafana                │  │  GitHub Actions      │
   │  Custom metrics       │        │  10-panel dashboard     │  │  12 jobs / 5 stages  │
   │  6 alert rules        │        │  Email alerts (SMTP)    │  │  Auto SSH deploy     │
   └──────────────────────┘        └────────────────────────┘  └─────────────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.8 | Type safety |
| Vite | 7.0 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first styling with dark mode |
| Zustand | 4.4 | Global state management |
| React Router | 6.30 | Client-side routing (SPA) |
| Framer Motion | 11 | Animations and transitions |
| KaTeX | 0.16 | LaTeX equation rendering |
| React Markdown | 10 | Markdown rendering with syntax highlighting |
| Axios | 1.13 | HTTP client |
| Lucide React | 0.533 | Icon library |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| FastAPI | Latest | REST API framework with auto-generated OpenAPI docs |
| Uvicorn | Latest | ASGI server (1 worker, memory-optimized for 4 GB RAM) |
| SQLAlchemy | 2.x | ORM with relationship management |
| Alembic | Latest | Database schema migrations |
| Pydantic | 2.x | Request/response validation and serialization |
| python-jose | Latest | JWT creation and verification |
| passlib / bcrypt | Latest | Secure password hashing |
| httpx | Latest | Async HTTP client used for Google OAuth token exchange |
| prometheus-client | Latest | Custom metrics export |

### AI & ML
| Technology | Purpose |
|---|---|
| Groq API | LLM inference — LLaMA 3.3-70B (primary), LLaMA 3.1-8B (fallback) |
| LangChain | Agent orchestration, document loaders, chain composition |
| LangChain-Groq | Groq integration adapter for LangChain |
| SentenceTransformers | Embedding model (all-MiniLM-L6-v2, ~440 MB, pre-downloaded at build time) |
| FAISS | Fast vector similarity search for RAG |
| ChromaDB | Persistent vector store used by the quiz agent |
| PyMuPDF / pdfplumber | PDF text, table, and image extraction |
| moviepy | Video generation from slide images and audio clips |
| duckduckgo-search | Web search without requiring an API key |
| YouTube Data API v3 | YouTube video and transcript search |

### Infrastructure & DevOps
| Technology | Purpose |
|---|---|
| Docker | Containerization of all services |
| Docker Compose | Multi-service orchestration (5 services) |
| Nginx | Reverse proxy, HTTPS termination, SPA routing |
| Let's Encrypt / Certbot | Free SSL/TLS certificates with auto-renewal |
| GCP Compute Engine | Production VM (e2-medium, Ubuntu 24.04 LTS) |
| PostgreSQL 16 | Production relational database |
| Prometheus | Metrics scraping and alerting engine |
| Grafana | Monitoring dashboards and email alert notifications |
| GitHub Actions | CI/CD pipeline (12 jobs across 5 stages) |
| Ruff | Python linter (fast, replaces flake8 + isort) |
| Gitleaks | Secret leak scanning in git history |
| pip-audit | Python dependency vulnerability scanning |

---

## AI Agents

All agents live in `backend_python/agents/` and share a central `model_router.py` that automatically falls back to the next available Groq model when a rate limit is hit.

### Model Fallback Chain (`agents/model_router.py`)

```python
_FALLBACK_CHAIN = [
    "llama-3.3-70b-versatile",                   # Production — high quality
    "llama-3.1-8b-instant",                      # Production — fast
    "meta-llama/llama-4-scout-17b-16e-instruct", # Preview quota
    "qwen/qwen3-32b",                            # Preview quota
]
```

Rate-limited models are tracked in memory per process and skipped automatically. If all models are exhausted, a clear error is raised directing the user to wait ~30 minutes for quota reset.

### Agent Reference

| Agent | File | Key Technologies | Description |
|---|---|---|---|
| **PDF Agent** | `pdf_agent.py` | FAISS, SentenceTransformers, LangChain | Extracts text/tables/equations, builds per-document vector store, answers questions grounded in source passages with citations |
| **Search Agent** | `search_agent.py` | duckduckgo-search, LLaMA 3.3-70B | Web search with AI summarization, academic result filtering, source ranking |
| **Chat Agent** | `chat_agent.py` | LangChain ConversationChain | Persistent general-purpose AI assistant, maintains per-session history via UUID |
| **Podcast Agent** | `podcast_agent.py` | LLaMA 3.3-70B, Groq audio | Converts papers into two-host podcast scripts, generates narration audio per segment |
| **YouTube Agent** | `youtube_agent.py` | YouTube Data API v3, LangChain | Searches YouTube, fetches video transcripts, extracts key insights using LLM |
| **Video Agent** | `video_agent.py` | moviepy, ffmpeg | Assembles slide images and audio clips into MP4 explainer videos |
| **Vision Agent** | `vision_agent.py` | Multimodal LLM (base64 images) | Analyzes uploaded images or screenshots; describes content, answers visual questions |
| **Citation Agent** | `citation_agent.py` | LLaMA 3.3-70B | Formats references in APA/MLA/IEEE, inserts inline citations into documents |
| **Quiz Agent** | `quiz_agent.py` | ChromaDB, HuggingFace Embeddings | Generates MCQ quizzes from PDFs using targeted chunk retrieval from persistent vector store |

### MultiModelRAG Subsystem (`multimodelrag/`)

An advanced RAG pipeline that powers the PDF Q&A feature:

| Component | Purpose |
|---|---|
| `specialized_chunker.py` | Splits PDFs into semantic chunks by section type (intro, methods, results, etc.) |
| `query_decomposition_engine.py` | Breaks complex questions into focused sub-queries for better retrieval |
| `self_rag_validator.py` | Validates that the generated answer is actually supported by retrieved passages |
| `hallucination_guard.py` | Cross-checks factual claims against source text before returning response |
| `equation_extractor_v2.py` | Detects and extracts LaTeX formulas from PDF content |
| `smart_retriever.py` | Hybrid dense + sparse retrieval with result reranking |
| `rate_limiter.py` | Per-model token budget tracking with exponential backoff |

---

## Project Structure

```
Data2Dash-FullStack/
├── src/                             # React frontend source
│   ├── pages/                       # Route-level page components
│   │   ├── HomePage.tsx             # Landing page with feature showcase
│   │   ├── ChatPage.tsx             # AI chat interface with session management
│   │   ├── SearchPage.tsx           # PDF library + all analysis tool tabs
│   │   ├── UploadPage.tsx           # Drag-and-drop file upload
│   │   ├── CitationPage.tsx         # Citation document editor
│   │   ├── WorkspacePage.tsx        # Personal workspace and file history
│   │   ├── LoginPage.tsx            # Email/password login
│   │   ├── SignupPage.tsx           # New account registration
│   │   └── AuthCallbackPage.tsx     # Google OAuth token extraction
│   ├── components/
│   │   ├── sections/                # Feature panel components (PdfAnalysis, PaperSearch, etc.)
│   │   ├── layout/                  # Sidebar, top nav, layout wrappers
│   │   ├── auth/                    # Protected route guards
│   │   └── ui/                      # Reusable primitives (buttons, modals, loaders)
│   ├── store/                       # Zustand state stores
│   │   ├── authStore.ts             # User session and JWT management
│   │   ├── useChatStore.ts          # Chat messages and session UUID
│   │   ├── useDocumentLibrary.ts    # PDF library state
│   │   ├── useSettingsStore.ts      # Dark mode, preferences
│   │   └── useUIStore.ts            # Sidebar collapse, active tab
│   ├── api/                         # Axios service modules (one per domain)
│   └── utils/                       # Math rendering, table parsing, chat export
│
├── backend_python/                  # FastAPI backend
│   ├── main.py                      # App entry point, all routes registered here
│   ├── models.py                    # SQLAlchemy ORM (Users, Files, Chat, Documents)
│   ├── schemas.py                   # Pydantic request/response models
│   ├── database.py                  # Engine, session factory, Base
│   ├── auth_utils.py                # JWT encode/decode, bcrypt hashing
│   ├── monitoring.py                # Prometheus counters, histograms, gauges
│   ├── agents/                      # 9 AI agents + shared model router
│   ├── routers/
│   │   ├── auth.py                  # Register, login, Google OAuth 2.0
│   │   ├── documents.py             # Document CRUD
│   │   └── workspace.py             # Workspace info and management
│   ├── migrations/                  # Alembic migration history
│   ├── tests/
│   │   ├── conftest.py              # pytest fixtures (TestClient, SQLite test DB)
│   │   └── test_health.py           # 7 smoke tests (health, auth, CORS, endpoints)
│   └── Dockerfile                   # Python 3.12-slim; pre-downloads embedding model
│
├── multimodelrag/                   # Advanced RAG subsystem (imported by PDF agent)
├── summarizer/                      # Standalone paper summarization module
├── summarization with critical review/  # Side-by-side critical analysis module
├── Knowledge_Graph_0.1/             # Knowledge graph generation and visualization
├── Enhanced_search_agent/           # Academic web search with enhanced filtering
│
├── monitoring/
│   ├── prometheus.yml               # Scrape config (backend:8000/metrics, 15s interval)
│   ├── alert-rules.yml              # 6 Prometheus alert rules
│   └── grafana/
│       ├── provisioning/datasources/  # Auto-configures Prometheus datasource on start
│       └── dashboards/data2dash.json  # Pre-built 10-panel Grafana dashboard
│
├── .github/workflows/ci-cd.yml      # 12-job CI/CD pipeline definition
├── docker-compose.yml               # 5-service production stack
├── Dockerfile.frontend              # Multi-stage: Node 20 build → Nginx Alpine
├── nginx.conf                       # Reverse proxy with HTTPS, redirect, SPA routing
├── deploy.sh                        # Bootstrap script for fresh server setup
└── .env.production                  # Environment variable template
```

---

## Database Schema

PostgreSQL 16, managed by SQLAlchemy ORM with Alembic migrations. Schema auto-creates on startup via `Base.metadata.create_all()`.

```
users
 ├── id (PK, int), email (unique), full_name
 ├── hashed_password (nullable — null for Google OAuth-only accounts)
 ├── google_id (unique, nullable), avatar_url
 └── is_active, created_at, updated_at, last_login_at

workspaces                        (1-to-1 with users, auto-created on registration)
 └── id, user_id (FK → users), name, created_at, updated_at

files                             (uploaded documents)
 ├── file_id (UUID PK), user_id (FK), workspace_id (FK)
 ├── filename (sanitized), original_name (user-facing)
 ├── file_type, mime_type, size_bytes, storage_path
 └── is_deleted (soft delete), uploaded_at, updated_at

file_versions                     (optional version history per file)
 └── version_id, file_id (FK), version_number, storage_path, change_summary

chat_sessions
 ├── session_id (UUID PK), user_id (FK), workspace_id (FK)
 ├── title, session_type (pdf | ai | kg | general)
 └── created_at, updated_at, last_message_at

chat_messages
 ├── message_id (UUID PK), session_id (FK)
 ├── sender_type (user | agent | system), content (Text)
 ├── message_metadata (JSON — sources, citations, equations, tables)
 └── timestamp

search_history
 └── search_id, user_id (FK), query_text, search_type, result_count, timestamp

documents                         (citation editor documents)
 └── id (client UUID), user_id (FK), title, body_html, citations_json, active_style, word_count
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.12
- Docker Desktop (for the PostgreSQL container)

### Frontend

```bash
npm install
npm run dev
# Development server: http://localhost:5173
```

### Backend

```bash
cd backend_python
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
pip install -r ../multimodelrag/requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start PostgreSQL (or set DATABASE_URL=sqlite:///./dev.db for SQLite)
docker run -d --name pg \
  -e POSTGRES_DB=data2dash \
  -e POSTGRES_USER=data2dash \
  -e POSTGRES_PASSWORD=yourpassword \
  -p 5432:5432 postgres:16-alpine

python -m uvicorn main:app --reload --port 8000
# API:  http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Run Tests

```bash
cd backend_python
DATABASE_URL=sqlite:///./test.db \
GROQ_API_KEY=test_key \
JWT_SECRET_KEY=test_secret \
  python -m pytest tests/ -v --tb=short
```

---

## Environment Variables

Copy `.env.production` to `.env` on the server and fill in all values.

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | Yes | PostgreSQL password — avoid special characters like `@` |
| `GROQ_API_KEY` | Yes | Groq API key — [console.groq.com](https://console.groq.com) |
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 — Google Cloud Console |
| `JWT_SECRET_KEY` | Yes | 64-char random hex string for signing JWTs |
| `GOOGLE_CLIENT_ID` | OAuth | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | OAuth | `https://yourdomain.com/auth/google/callback` |
| `FRONTEND_URL` | Yes | `https://yourdomain.com` — used for CORS and file URL generation |
| `GRAFANA_PASSWORD` | Yes | Grafana admin panel password |
| `ALERT_EMAIL` | Alerts | Gmail address to send Prometheus alert emails from |
| `ALERT_EMAIL_PASSWORD` | Alerts | Gmail App Password (not regular password) — [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

---

## Docker Deployment

The full stack runs as 5 Docker Compose services:

| Service | Image | Exposed Port | Purpose |
|---|---|---|---|
| `db` | postgres:16-alpine | internal | PostgreSQL database with persistent volume |
| `backend` | custom (Python 3.12-slim) | internal:8000 | FastAPI API server |
| `frontend` | custom (Nginx Alpine) | 80, 443 | React SPA + reverse proxy |
| `prometheus` | prom/prometheus:latest | 9090 | Metrics collection (30-day retention) |
| `grafana` | grafana/grafana:latest | 3000 | Monitoring dashboards |

### Start the full stack

```bash
cp .env.production .env
# Edit .env with real values, then:
docker compose up -d --build
```

### Fresh server deployment

```bash
bash deploy.sh
```

The script installs Docker, clones the repo, copies `.env`, and starts all services in one command.

---

## CI/CD Pipeline

Defined in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml). Triggers on every push and pull request to `main`. Runs 12 jobs across 5 sequential stages.

```
Push / PR to main
│
├── STAGE 1 — Code Quality  (parallel)
│   ├── 1.1  Frontend TypeScript typecheck      tsc --noEmit
│   └── 1.2  Backend Python lint                ruff check (E, F, W rules)
│
├── STAGE 2 — Security Scanning  (parallel, independent of Stage 1)
│   ├── 2.1  NPM dependency audit               npm audit --audit-level=high
│   ├── 2.2  Python dependency audit            pip-audit -r requirements.txt
│   └── 2.3  Secret leak scan                   Gitleaks (full git history)
│
├── STAGE 3 — Testing  (needs Stage 1)
│   ├── 3.1  Backend unit tests + coverage      pytest + httpx, exit 134/139 treated as warnings
│   └── 3.2  Backend import verification        Checks FastAPI, LangChain, SentenceTransformers, etc.
│
├── STAGE 4 — Build Verification  (needs Stage 3)
│   ├── 4.1  Frontend production build          Vite build + bundle size analysis (warn if >10 MB)
│   ├── 4.2  Docker build backend               Full image build + startup smoke test
│   └── 4.3  Docker build frontend              Full image build + nginx -t config validation
│                                               (dummy cert injected so ssl_certificate block passes)
│
└── STAGE 5 — Deploy  (main branch push only, needs Stages 2 + 4)
    ├── 5.1  SSH deploy to GCP                  git pull + docker compose up -d --build (30 min timeout)
    └── 5.2  Post-deploy health checks          curl frontend (200), /api/, /metrics, Grafana:3000
```

### Required GitHub Secrets

Configure these at **repo → Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `SERVER_HOST` | GCP VM public IP address (`34.14.104.209`) |
| `SERVER_USER` | SSH username on the VM |
| `SERVER_SSH_KEY` | Private SSH key (ed25519) content — generate with `ssh-keygen -t ed25519` |

---

## Monitoring & Alerting

### Prometheus Custom Metrics

Defined in [`backend_python/monitoring.py`](backend_python/monitoring.py) and exposed at `/metrics`.

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `data2dash_requests_total` | Counter | method, endpoint, status | Total HTTP requests processed |
| `data2dash_model_requests_total` | Counter | agent, model | LLM inference calls per agent |
| `data2dash_model_errors_total` | Counter | agent, error_type | Model failures (rate_limit, api_error, all_exhausted) |
| `data2dash_rate_limit_hits_total` | Counter | model | Rate limit events per model |
| `data2dash_request_latency_seconds` | Histogram | method, endpoint | HTTP request duration distribution |
| `data2dash_model_latency_seconds` | Histogram | agent | LLM call duration per agent |
| `data2dash_active_requests` | Gauge | — | Currently in-flight requests |

Prometheus scrapes `backend:8000/metrics` every 15 seconds.

### Alert Rules

Defined in [`monitoring/alert-rules.yml`](monitoring/alert-rules.yml):

| Alert Name | Trigger Condition | Severity |
|---|---|---|
| `HighModelErrorRate` | Model error rate > 5% over 5 minutes | warning |
| `RateLimitHit` | Any rate limit counter increase | warning |
| `AllModelsExhausted` | All models exhausted error fires | critical |
| `BackendDown` | Backend unreachable for 1 minute | critical |
| `HighLatency` | p95 request latency > 30s over 5 minutes | warning |
| `HighErrorRate` | HTTP 5xx rate > 10% over 5 minutes | critical |

### Grafana Dashboard

Access at `http://<server-ip>:3000` with admin credentials from `.env`.

Auto-provisioned via `monitoring/grafana/provisioning/` — no manual setup needed. The pre-built dashboard includes 10 panels:

- Request rate (req/s) and 5xx error rate time series
- Model errors by agent and rate limit hit counters
- Request latency p95/p50 comparison
- Model inference latency by agent
- Active requests gauge
- Total model requests, errors, and rate limit hits (stat panels)

---

## Production Infrastructure

**Platform:** Google Cloud Platform — Compute Engine

| Parameter | Value |
|---|---|
| Machine type | e2-medium (2 vCPU, 4 GB RAM) |
| Disk | 50 GB SSD (balanced persistent disk) |
| Operating system | Ubuntu 24.04 LTS |
| Region | us-central1 |
| Domain | [data2dash.org](https://data2dash.org) (registered on Namecheap) |
| DNS | A records on Namecheap pointing to static GCP IP |
| TLS | Let's Encrypt via Certbot — webroot method, no downtime renewal |
| Backend workers | 1 Uvicorn worker (embedding model ~1.5 GB, leaves ~2 GB for app) |

### SSL Certificate Lifecycle

Certificates are obtained with the webroot method (nginx serves the ACME challenge while running):

```bash
certbot certonly --webroot -w ~/data2dash/certbot/www \
  -d data2dash.org -d www.data2dash.org \
  --email your@email.com --agree-tos -n
```

Host certificates at `/etc/letsencrypt/` are mounted read-only into the Nginx container. Auto-renewal runs twice daily via cron and reloads Nginx without container restart:

```bash
certbot renew --quiet \
  --deploy-hook 'docker compose -f ~/data2dash/docker-compose.yml exec frontend nginx -s reload'
```

### Docker Named Volumes

| Volume | Contents |
|---|---|
| `pgdata` | PostgreSQL data directory |
| `uploads` | User-uploaded PDF files |
| `multimodel_temp` | Temporary processing files (videos, audio segments) |
| `multimodel_exports` | Finished exported files (MP4, MP3) |
| `prometheus_data` | Time-series metrics (30-day retention policy) |
| `grafana_data` | Dashboard config, user settings, alert history |

---

## API Overview

All endpoints are available behind `https://data2dash.org`. Interactive docs at `https://data2dash.org/api/docs`.

### Authentication (`/auth`)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account with email and password |
| POST | `/auth/login` | Login, returns a signed JWT |
| GET | `/auth/me` | Return current authenticated user |
| GET | `/auth/google` | Redirect to Google OAuth consent page |
| GET | `/auth/google/callback` | Handle OAuth code exchange, redirect to frontend with JWT |

### Documents & Workspace (`/api`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/documents/` | List user's documents |
| POST | `/api/documents/` | Create or update a document |
| DELETE | `/api/documents/{id}` | Delete a document |
| GET | `/api/workspace` | Get current user's workspace metadata |

### AI Agent Endpoints (`/api`)

| Method | Path | Agent |
|---|---|---|
| POST | `/api/upload` | Upload PDF to workspace |
| POST | `/api/pdf/query` | PDF RAG Q&A |
| POST | `/api/pdf/knowledge-graph` | Generate knowledge graph from PDF |
| POST | `/api/pdf/import` | Import PDF into session |
| POST | `/api/chat` | General AI chat (persistent session) |
| POST | `/api/search` | Web search with AI summary |
| POST | `/api/youtube/search` | YouTube search and insight extraction |
| POST | `/api/podcast/generate` | Generate podcast script and audio |
| POST | `/api/video/generate` | Assemble explainer video |
| POST | `/api/vision/analyze` | Analyze image with multimodal LLM |
| POST | `/api/citation/format` | Format and manage citations |
| POST | `/api/quiz/generate` | Generate MCQ quiz from PDF |
| POST | `/api/summarize` | Summarize a paper |
| POST | `/api/compare` | Side-by-side critical comparison |

### Monitoring

| Method | Path | Description |
|---|---|---|
| GET | `/metrics` | Prometheus metrics (text/plain exposition format) |

---

## Acknowledgements

Built as a graduate capstone project demonstrating end-to-end integration of modern AI, full-stack web development, containerization, and DevOps practices.

- [Groq](https://groq.com) — ultra-fast LLM inference API
- [LangChain](https://langchain.com) — AI agent orchestration framework
- [Let's Encrypt](https://letsencrypt.org) — free automated SSL/TLS
- [FastAPI](https://fastapi.tiangolo.com) — high-performance Python web framework
- [Prometheus](https://prometheus.io) + [Grafana](https://grafana.com) — observability stack
