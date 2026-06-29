from langchain_community.utilities import ArxivAPIWrapper, WikipediaAPIWrapper
from langchain_community.tools import ArxivQueryRun, WikipediaQueryRun, DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import re
from .model_router import get_groq_llm


class ChatAgent:
    def __init__(self, groq_api_key):
        self.groq_api_key = groq_api_key
        self.llm = get_groq_llm(
            preferred_model="llama-3.3-70b-versatile",
            temperature=0.1,
            groq_api_key=groq_api_key,
        )

        # Initialize web tools for general mode
        api_wrapper_wiki = WikipediaAPIWrapper(top_k_results=2, doc_content_chars_max=2000)
        self.wiki = WikipediaQueryRun(api_wrapper=api_wrapper_wiki)

        api_wrapper_arxiv = ArxivAPIWrapper(top_k_results=2, doc_content_chars_max=2000)
        self.arxiv = ArxivQueryRun(api_wrapper=api_wrapper_arxiv)

        self.search = DuckDuckGoSearchRun()

        self.base_tools = {
            "Wikipedia": {
                "tool": self.wiki,
                "description": "Search Wikipedia for encyclopedic information about people, places, events, concepts, and general knowledge.",
            },
            "Arxiv": {
                "tool": self.arxiv,
                "description": "Search scientific papers and academic research. Use for technical, scientific, or research-related questions.",
            },
            "Search": {
                "tool": self.search,
                "description": "Search the internet for current events, news, recent information, and real-time data.",
            },
        }

    # ── DOCUMENT MODE ─────────────────────────────────────────────────────────

    def _answer_from_document(self, query: str, retrieved: dict, history: list) -> str:
        """
        Given RAG-retrieved content, use LLM to compose a focused, well-formatted
        answer grounded strictly in the retrieved text. No hallucination allowed.
        """
        # Build context string from the retrieved answer
        raw_answer = retrieved.get("answer", "").strip()
        equations   = retrieved.get("equations", [])
        tables      = retrieved.get("tables", [])

        # Build a context block the model can reference
        context_parts = []
        if raw_answer:
            context_parts.append(f"RETRIEVED TEXT:\n{raw_answer}")

        if equations:
            eq_lines = []
            for eq in equations:
                label  = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
                latex  = (eq.get("normalized_latex") or eq.get("latex") or "").strip()
                page   = eq.get("page_number")
                page_s = f" (p. {page})" if page else ""
                if latex:
                    eq_lines.append(f"{label}{page_s}: {latex}")
            if eq_lines:
                context_parts.append("EQUATIONS FROM DOCUMENT:\n" + "\n".join(eq_lines))

        if tables:
            tb_lines = []
            for tb in tables:
                label   = tb.get("label") or f"Table {tb.get('global_number', '?')}"
                caption = tb.get("caption", "")
                content = (tb.get("markdown") or tb.get("raw_text") or "").strip()
                page    = tb.get("page_number")
                page_s  = f" (p. {page})" if page else ""
                if content:
                    tb_lines.append(f"{label}{page_s} — {caption}\n{content}")
            if tb_lines:
                context_parts.append("TABLES FROM DOCUMENT:\n" + "\n\n".join(tb_lines))

        if not context_parts:
            return (
                "I could not find relevant information about that in the document. "
                "Please try rephrasing your question or ask about a specific section, equation, or table."
            )

        context_block = "\n\n---\n\n".join(context_parts)

        # Format conversation history (last 4 turns)
        history_text = ""
        if history:
            history_text = "Previous conversation:\n"
            for msg in history[-4:]:
                role    = "User" if msg.get("role") == "user" else "Assistant"
                content = msg.get("content", "").strip()
                history_text += f"{role}: {content}\n\n"

        system_prompt = """\
You are a precise, document-grounded research assistant. Your ONLY job is to answer \
the user's question using the RETRIEVED CONTENT provided below.

STRICT RULES — follow every rule exactly:
1. Answer ONLY from the RETRIEVED CONTENT. Do NOT add facts from memory or training data.
2. If the retrieved content does not answer the question, say so explicitly and clearly.
3. Do NOT hallucinate equations, numbers, author names, or claims not present in the retrieved content.

RESPONSE FORMAT:
- Use **bold** for key terms, method names, and important values.
- Use bullet points (- item) to list properties, steps, or comparisons.
- Use ## or ### headings to structure multi-section answers.
- For code: use fenced blocks with language tag → ```python ... ```
- Put ALL equations in LaTeX:
    • Standalone equation on its own line: wrap in $$...$$
    • Inline math inside a sentence: wrap in $...$
    • Copy the LaTeX EXACTLY as given in EQUATIONS FROM DOCUMENT — do not invent or alter equations.
- Do NOT write equations as plain text like "W_Q = linear(X)".
- Do NOT include page numbers or equation numbers in the answer body — those will be shown separately.
- Keep the answer focused and concise. Avoid restating information the user already knows.
"""

        user_prompt = f"""\
{history_text}
User question: {query}

{context_block}

Write a focused, well-formatted answer based ONLY on the retrieved content above.
"""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = self.llm.invoke(messages)
        return response.content.strip()

    # ── GENERAL MODE ──────────────────────────────────────────────────────────

    def _get_general_system_prompt(self, tool_names: list) -> str:
        return f"""\
You are the Data2Dash AI, a specialized research assistant for Artificial Intelligence, \
Machine Learning, and Data Science.

SCOPE RULE: Politely decline questions unrelated to AI/ML/Data Science/scientific research.

Available tools: {', '.join(tool_names)}

ANTI-HALLUCINATION RULES:
1. You MUST use at least one tool before giving a Final Answer.
2. Your Final Answer MUST be based on what the tool returned — do NOT add facts from memory.
3. If a tool returns insufficient information, say so honestly.
4. Never state specific numbers, dates, or technical claims without a tool result to back them up.

MATH & EQUATION FORMATTING:
- Display equations (standalone) → wrap in $$...$$
- Inline math → wrap in $...$
- NEVER write equations as plain ASCII.

MARKDOWN FORMATTING:
- Use **bold** for key terms.
- Use ## headings for multi-section answers.
- Use bullet lists for enumeration.
- Put ALL code in fenced blocks with a language tag: ```python ... ```

Response format:
Thought: [explain which tool you'll use and why]
Action: [exactly one of: {', '.join(tool_names)}]
Action Input: [your search query]

After receiving the Observation:
Thought: [what the tool returned and how it answers the question]
Final Answer: [answer citing the tool result — proper LaTeX math, markdown formatting]

Begin!\
"""

    # ── PUBLIC ENTRY POINT ────────────────────────────────────────────────────

    def run(self, query: str, history=None, session_id=None, pdf_agent_instance=None):
        """Run the chat agent with history and optional session context."""
        history = history or []

        # ── Document mode: bypass ReAct, call RAG directly then format ────────
        if session_id and pdf_agent_instance is not None:
            session_loaded = (
                hasattr(pdf_agent_instance, "systems")
                and session_id in pdf_agent_instance.systems
            )
            if session_loaded:
                try:
                    # 1. Retrieve structured content from the RAG system
                    retrieved = pdf_agent_instance.get_response(query, session_id)

                    # 2. If no content found at all, return early
                    if isinstance(retrieved, str):
                        retrieved = {"answer": retrieved, "equations": [], "tables": [], "sources": []}

                    # 2b. If Stage 2 is still running, return the pending message directly
                    #     without passing it through the LLM (which would rephrase it)
                    if retrieved.get("mode") == "pending":
                        return {
                            "response": retrieved["answer"],
                            "equations": [],
                            "tables": [],
                            "sources": [],
                        }

                    # 3. Use LLM to compose a well-formatted, grounded answer
                    formatted_answer = self._answer_from_document(query, retrieved, history)

                    return {
                        "response": formatted_answer,
                        "equations": retrieved.get("equations", []),
                        "tables":    retrieved.get("tables", []),
                        "sources":   retrieved.get("sources", []),
                    }
                except Exception as e:
                    return {
                        "response": f"An error occurred while querying the document: {str(e)}",
                        "sources": [],
                    }

        # ── General mode: ReAct loop with web tools ────────────────────────────
        try:
            tool_names = list(self.base_tools.keys())
            system_prompt = self._get_general_system_prompt(tool_names)

            history_text = ""
            if history:
                history_text = "Previous conversation:\n"
                for msg in history[-4:]:
                    role    = "User" if msg.get("role") == "user" else "Assistant"
                    content = msg.get("content", "").strip()
                    history_text += f"{role}: {content}\n\n"

            messages = [SystemMessage(content=system_prompt)]
            query_prompt = f"{history_text}Current Question: {query}\n\nYou MUST use a tool before answering."
            messages.append(HumanMessage(content=query_prompt))

            sources = []
            max_iterations = 5

            for _ in range(max_iterations):
                response     = self.llm.invoke(messages)
                response_text = response.content

                action_match       = re.search(r"Action:\s*(\w+)", response_text, re.IGNORECASE)
                action_input_match = re.search(
                    r"Action Input:\s*(.+?)(?=\nObservation:|\nThought:|\nFinal Answer:|$)",
                    response_text, re.DOTALL | re.IGNORECASE,
                )
                is_final  = bool(re.search(r"Final Answer:", response_text, re.IGNORECASE))
                has_action = action_match and action_input_match

                if not has_action and not is_final:
                    return {"response": response_text, "sources": list(set(sources))}

                if is_final:
                    fa_match = re.search(r"Final Answer:\s*(.+)", response_text, re.DOTALL | re.IGNORECASE)
                    final = fa_match.group(1).strip() if fa_match else response_text.split("Final Answer:")[-1].strip()
                    return {"response": final, "sources": list(set(sources))}

                if has_action:
                    tool_name  = action_match.group(1).strip()
                    tool_input = action_input_match.group(1).strip().strip("[]")

                    if tool_name in self.base_tools:
                        try:
                            observation = self.base_tools[tool_name]["tool"].run(tool_input)
                            sources.append(f"{tool_name}: {tool_input}")
                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"Observation: {observation}\n\nYou can now use another tool or provide a Final Answer."))
                        except Exception as e:
                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"Error using {tool_name}: {e}\n\nTry a different approach."))
                    else:
                        messages.append(AIMessage(content=response_text))
                        messages.append(HumanMessage(content=f"Unknown tool '{tool_name}'. Use one of: {', '.join(tool_names)}"))

            return {
                "response": (
                    "I was unable to retrieve enough information to fully answer your question. "
                    "Please try rephrasing or ask a more specific question."
                ),
                "sources": list(set(sources)),
            }

        except Exception as e:
            return {"response": f"An error occurred: {str(e)}", "sources": []}
