import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

import streamlit as st
import pandas as pd

st.title("📊 Insights")

results = st.session_state.get("search_results", None)

if not results:
    st.warning("No search results found. Please run a search first.")
else:
    analytics = results["analytics"]

    col1, col2, col3 = st.columns(3)
    col1.metric("Total Papers", analytics.total_papers)
    col2.metric("Last 30 Days", analytics.papers_last_30_days)
    col3.metric("Trend Status", analytics.trend_status)

    st.subheader("Top Authors")
    if analytics.top_authors:
        df_authors = pd.DataFrame(analytics.top_authors, columns=["Author", "Count"])
        st.dataframe(df_authors, use_container_width=True)
    else:
        st.info("No author data available.")

    st.subheader("Top Keywords")
    if analytics.top_keywords:
        df_keywords = pd.DataFrame(analytics.top_keywords, columns=["Keyword", "Count"])
        st.dataframe(df_keywords, use_container_width=True)
    else:
        st.info("No keyword data available.")

    st.subheader("Monthly Publication Trend")
    if analytics.monthly_counts:
        df_trend = pd.DataFrame(
            list(analytics.monthly_counts.items()),
            columns=["Month", "Paper Count"]
        )
        st.line_chart(df_trend.set_index("Month"))
    else:
        st.info("No trend data available.")