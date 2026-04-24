import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

import streamlit as st
from app.services.search_agent import SearchAgent

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(page_title="Hybrid Search | DATA2DASH", page_icon="🔍", layout="wide")

# ── Custom CSS ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* ---------- global ---------- */
html, body, [data-testid="stAppViewContainer"] {
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Inter', sans-serif;
}
[data-testid="stSidebar"] { background: #161b22; }

/* ---------- search bar area ---------- */
.search-header {
    text-align: center;
    padding: 2rem 0 1rem;
}
.search-header h1 {
    font-size: 2.6rem;
    font-weight: 800;
    background: linear-gradient(135deg, #58a6ff, #bc8cff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.25rem;
}
.search-header p {
    color: #8b949e;
    font-size: 1rem;
}

/* ---------- badge chips ---------- */
.chip {
    display: inline-block;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 0.75rem;
    color: #8b949e;
    margin: 2px 3px;
}
.chip-blue  { border-color: #1f6feb; color: #58a6ff; background: #0d1d33; }
.chip-purple{ border-color: #6e40c9; color: #bc8cff; background: #1a0e33; }
.chip-green { border-color: #238636; color: #3fb950; background: #0d2d1a; }

/* ---------- metric mini-cards ---------- */
.metric-row { display: flex; gap: 12px; flex-wrap: wrap; margin: 1rem 0; }
.metric-card {
    flex: 1; min-width: 120px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 12px 16px;
    text-align: center;
}
.metric-card .val {
    font-size: 1.5rem; font-weight: 700; color: #58a6ff;
}
.metric-card .lbl {
    font-size: 0.72rem; color: #8b949e; margin-top: 2px;
}

/* ---------- paper cards ---------- */
.paper-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 14px;
    transition: border-color .2s, box-shadow .2s;
}
.paper-card:hover {
    border-color: #58a6ff;
    box-shadow: 0 0 0 1px #1f6feb44;
}
.paper-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #58a6ff;
    margin-bottom: 6px;
    line-height: 1.4;
}
.paper-meta {
    font-size: 0.78rem;
    color: #8b949e;
    margin: 2px 0;
}
.paper-abstract {
    font-size: 0.85rem;
    color: #c9d1d9;
    margin-top: 10px;
    line-height: 1.6;
    border-left: 3px solid #21262d;
    padding-left: 12px;
}
.relevance-bar-wrap { margin-top: 10px; }
.relevance-label { font-size: 0.72rem; color: #8b949e; margin-bottom: 2px; }
.relevance-bar-bg {
    background: #21262d; border-radius: 4px; height: 6px; width: 100%;
}
.relevance-bar-fill {
    height: 6px; border-radius: 4px;
    background: linear-gradient(90deg, #1f6feb, #bc8cff);
}
.source-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 12px;
    font-size: 0.72rem;
    font-weight: 600;
}
.src-arxiv          { background:#0d2d1a; color:#3fb950; border:1px solid #238636; }
.src-semantic_scholar{ background:#0d1d33; color:#58a6ff; border:1px solid #1f6feb; }
.src-openalex       { background:#1a1233; color:#bc8cff; border:1px solid #6e40c9; }
</style>
""", unsafe_allow_html=True)

# ── Header ─────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="search-header">
  <h1>🔍 Hybrid Paper Search</h1>
  <p>Searches ArXiv · Semantic Scholar · OpenAlex with AI-powered query expansion</p>
</div>
""", unsafe_allow_html=True)

# ── Search controls ────────────────────────────────────────────────────────────
col_q, col_pp, col_pg = st.columns([5, 1, 1])
with col_q:
    query = st.text_input(
        "Research topic",
        placeholder="e.g.  transformers  ·  attention mechanism  ·  RAG  ·  diffusion models",
        label_visibility="collapsed",
    )
with col_pp:
    per_page = st.selectbox("Results / page", [5, 10, 20], index=1, label_visibility="collapsed")
with col_pg:
    page = st.number_input("Page", min_value=1, value=1, step=1, label_visibility="collapsed")

search_clicked = st.button("🚀  Hybrid Search", use_container_width=True, type="primary")

# ── Session state ──────────────────────────────────────────────────────────────
if "search_results" not in st.session_state:
    st.session_state.search_results = None

# ── Run search ─────────────────────────────────────────────────────────────────
if search_clicked:
    if not query.strip():
        st.warning("Please enter a search query.")
    else:
        with st.spinner("🤖 Expanding query with AI  →  searching 3 academic sources  →  ranking results..."):
            try:
                agent = SearchAgent()
                results = agent.search(query=query.strip(), page=page, per_page=per_page)
                st.session_state.search_results = results
            except Exception as e:
                st.error(f"Search failed: {e}")

# ── Display results ─────────────────────────────────────────────────────────────
results = st.session_state.search_results

if results:

    # ── Query expansion pills ──────────────────────────────────────────────────
    st.markdown("#### 🧠 AI Query Expansion")
    exp_html = " ".join(
        f'<span class="chip chip-blue">🔎 {q}</span>'
        for q in results.get("expanded_queries", [])
    )
    kw_html = " ".join(
        f'<span class="chip chip-purple">{kw}</span>'
        for kw in results.get("semantic_keywords", [])
    )
    st.markdown(
        f'<div style="margin-bottom:6px"><b style="color:#8b949e;font-size:.8rem">SEARCH VARIANTS</b><br>{exp_html}</div>'
        f'<div><b style="color:#8b949e;font-size:.8rem">SEMANTIC KEYWORDS</b><br>{kw_html}</div>',
        unsafe_allow_html=True,
    )

    st.divider()

    # ── Summary metrics ────────────────────────────────────────────────────────
    total  = results.get("total_found", len(results["papers"]))
    papers = results["papers"]
    srcs   = results.get("source_counts", {})

    st.markdown(
        f"""
        <div class="metric-row">
          <div class="metric-card"><div class="val">{total}</div><div class="lbl">Total Unique Papers</div></div>
          <div class="metric-card"><div class="val">{srcs.get('arxiv',0)}</div><div class="lbl">From ArXiv</div></div>
          <div class="metric-card"><div class="val">{srcs.get('semantic_scholar',0)}</div><div class="lbl">Semantic Scholar</div></div>
          <div class="metric-card"><div class="val">{srcs.get('openalex',0)}</div><div class="lbl">OpenAlex</div></div>
          <div class="metric-card"><div class="val">{len(results.get("expanded_queries",[]))}</div><div class="lbl">Query Variants</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(f"### Showing {len(papers)} of {total} results  —  page {page}")

    # ── Paper cards ────────────────────────────────────────────────────────────
    for paper in papers:
        sem  = getattr(paper, "semantic_score", 0.0)
        pct  = int(sem * 100)
        src_cls = f"src-{paper.source}"
        src_label = {
            "arxiv": "arXiv",
            "semantic_scholar": "Semantic Scholar",
            "openalex": "OpenAlex",
        }.get(paper.source, paper.source)

        authors_str = ", ".join(paper.authors[:4])
        if len(paper.authors) > 4:
            authors_str += f" +{len(paper.authors)-4} more"

        abstract_snippet = (paper.abstract[:420] + "…") if len(paper.abstract) > 420 else paper.abstract

        tags_html = " ".join(
            f'<span class="chip chip-green">{t}</span>'
            for t in (paper.topic_tags or [])[:5]
        )

        bar_fill_width = pct

        st.markdown(f"""
        <div class="paper-card">
          <div class="paper-title">
            <a href="{paper.url}" target="_blank" style="color:#58a6ff;text-decoration:none;">{paper.title}</a>
          </div>
          <div class="paper-meta">👤 {authors_str or 'Unknown'}</div>
          <div class="paper-meta">
            📅 {paper.published_date or 'N/A'} &nbsp;|&nbsp;
            📚 {paper.citations:,} citations &nbsp;|&nbsp;
            <span class="source-badge {src_cls}">{src_label}</span>
          </div>
          {'<div style="margin-top:6px">' + tags_html + '</div>' if tags_html else ''}
          <div class="paper-abstract">{abstract_snippet or '<i>No abstract available.</i>'}</div>
          <div class="relevance-bar-wrap">
            <div class="relevance-label">Semantic Relevance — {pct}%</div>
            <div class="relevance-bar-bg">
              <div class="relevance-bar-fill" style="width:{bar_fill_width}%"></div>
            </div>
          </div>
        </div>
        """, unsafe_allow_html=True)

    # ── Pagination hint ────────────────────────────────────────────────────────
    if total > per_page:
        max_page = (total + per_page - 1) // per_page
        st.info(f"Page {page} of {max_page}. Change the page number above to load more.", icon="📄")

elif not search_clicked:
    st.markdown("""
    <div style="text-align:center; padding:4rem 0; color:#8b949e;">
      <div style="font-size:3rem">🔬</div>
      <h3 style="color:#c9d1d9;">Discover Academic Papers with Hybrid AI Search</h3>
      <p>Type any concept — the AI expands your query across <b>ArXiv</b>, <b>Semantic Scholar</b>, and <b>OpenAlex</b>.<br>
      Even if you search <i>"transformers"</i> you'll find <i>"Attention Is All You Need"</i>.</p>
    </div>
    """, unsafe_allow_html=True)