import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

import streamlit as st
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from app.core.config import settings

st.title("💬 Chat")

results = st.session_state.get("search_results", None)

if not results:
    st.warning("No search results found. Please run a search first.")
else:
    st.write("Ask questions about the papers you just searched.")

    # Initialize chat history
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    # Display previous messages
    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    user_question = st.chat_input("Ask about these papers...")

    if user_question:
        papers = results["papers"]

        # Build context from top 5 papers
        context_parts = []
        for p in papers[:5]:
            context_parts.append(
                f"Title: {p.title}\n"
                f"Authors: {', '.join(p.authors)}\n"
                f"Published: {p.published_date}\n"
                f"Citations: {p.citations}\n"
                f"Abstract: {p.abstract[:600]}"
            )
        context = "\n\n---\n\n".join(context_parts)

        system_prompt = (
            "You are a helpful research assistant. "
            "Answer the user's questions based on the following academic papers:\n\n"
            f"{context}\n\n"
            "Be concise, accurate, and cite paper titles when relevant."
        )

        st.session_state.chat_history.append({"role": "user", "content": user_question})

        with st.chat_message("user"):
            st.write(user_question)

        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    llm = ChatGroq(
                        api_key=settings.GROQ_API_KEY,
                        model=settings.CHAT_MODEL,
                    )
                    messages = [SystemMessage(content=system_prompt)]
                    # Include prior conversation turns for context
                    for msg in st.session_state.chat_history[:-1]:
                        if msg["role"] == "user":
                            messages.append(HumanMessage(content=msg["content"]))
                        else:
                            messages.append(SystemMessage(content=f"Assistant: {msg['content']}"))
                    messages.append(HumanMessage(content=user_question))

                    response = llm.invoke(messages)
                    answer = response.content
                    st.write(answer)
                    st.session_state.chat_history.append({"role": "assistant", "content": answer})
                except Exception as e:
                    st.error(f"❌ Error calling LLM: {e}")
