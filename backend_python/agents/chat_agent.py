from langchain_groq import ChatGroq
from langchain_community.utilities import ArxivAPIWrapper, WikipediaAPIWrapper
from langchain_community.tools import ArxivQueryRun, WikipediaQueryRun, DuckDuckGoSearchRun
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import re

class ChatAgent:
    def __init__(self, groq_api_key):
        self.llm = ChatGroq(
            groq_api_key=groq_api_key, 
            model_name="llama-3.3-70b-versatile",
            temperature=0.2
        )
        
        # Initialize Tools
        api_wrapper_wiki = WikipediaAPIWrapper(top_k_results=2, doc_content_chars_max=1500)
        self.wiki = WikipediaQueryRun(api_wrapper=api_wrapper_wiki)
        
        api_wrapper_arxiv = ArxivAPIWrapper(top_k_results=2, doc_content_chars_max=1500)
        self.arxiv = ArxivQueryRun(api_wrapper=api_wrapper_arxiv)
        
        self.search = DuckDuckGoSearchRun()
        
        # We will dynamically inject DocumentReader in the run() method
        # if a session_id is provided, but we define the base tools here
        self.base_tools = {
            "Wikipedia": {
                "tool": self.wiki,
                "description": "Search Wikipedia for encyclopedic information about people, places, events, concepts, and general knowledge."
            },
            "Arxiv": {
                "tool": self.arxiv,
                "description": "Search scientific papers and academic research. Use for technical, scientific, or research-related questions."
            },
            "Search": {
                "tool": self.search,
                "description": "Search the internet for current events, news, recent information, and real-time data."
            }
        }

    def _get_system_prompt(self, tools_dict, has_document: bool = False):
        tools_desc = "\n".join([
            f"- {name}: {info['description']}"
            for name, info in tools_dict.items()
        ])

        if has_document:
            # ── Document mode: strictly grounded, no hallucination allowed ──
            return f"""You are the Data2Dash AI, a document-grounded research assistant.

A PDF document has been loaded into this session. You MUST answer ONLY from the document's content retrieved via the DocumentReader tool.

STRICT GROUNDING RULES:
1. You MUST call DocumentReader for EVERY question — even if you think you know the answer.
2. Base your answer SOLELY on what DocumentReader returns. Do NOT add information from your training data.
3. If DocumentReader returns no relevant content, respond: "I could not find information about that in the document. Please try rephrasing your question."
4. Do NOT speculate, infer, or hallucinate content that is not explicitly in the retrieved chunks.
5. Do NOT use Wikipedia, Arxiv, or Search tools — they are disabled in document mode.

Available tools:
{tools_desc}

MATH & EQUATION FORMATTING (CRITICAL — ALWAYS FOLLOW):
- ALL mathematical expressions MUST be formatted using LaTeX notation.
- Display equations → wrap in $$...$$
- Inline math → wrap in $...$
- NEVER write equations as plain ASCII.

CODE FORMATTING:
- ALL code MUST be in a fenced block with a language tag (```python, ```bash, etc.)

Response format:
Thought: [I need to look this up in the document]
Action: DocumentReader
Action Input: [specific question to retrieve from document]

After receiving the Observation:
Thought: [what I found / if relevant content was returned]
Final Answer: [answer based ONLY on retrieved content — cite chunk text if helpful]

CRITICAL: Never answer from memory. Always use DocumentReader first.

Begin!"""
        else:
            # ── General mode: tool-grounded, no unsourced claims ──
            return f"""You are the Data2Dash AI, a specialized research assistant for Artificial Intelligence, Machine Learning, and Data Science.

SCOPE RULE: Politely decline questions unrelated to AI/ML/Data Science/scientific research.

Available tools:
{tools_desc}

ANTI-HALLUCINATION RULES:
1. You MUST use at least one tool before giving a Final Answer.
2. Your Final Answer MUST be based on what the tool returned — do NOT add facts from memory.
3. If a tool returns insufficient information, say so honestly. Do NOT fill gaps with speculation.
4. Never state specific numbers, dates, author names, or technical claims without a tool result to back them up.

MATH & EQUATION FORMATTING (CRITICAL — ALWAYS FOLLOW):
- ALL mathematical expressions MUST be formatted using LaTeX notation.
- Display equations → wrap in $$...$$
- Inline math → wrap in $...$
- NEVER write equations as plain ASCII like "1/(1 + exp(-z))".

CODE FORMATTING:
- ALL code MUST be in a fenced block with a language tag (```python, ```bash, etc.)
- Use markdown formatting (bold, bullet points, headers) for prose.

Response format:
Thought: [explain which tool you'll use and why]
Action: [exactly one of: {', '.join(tools_dict.keys())}]
Action Input: [your search query]

After receiving the Observation:
Thought: [what the tool returned and how it answers the question]
Final Answer: [answer citing the tool result — no unsourced claims]

Begin!"""

    def run(self, query: str, history=None, session_id=None, pdf_agent_instance=None):
        """Run the chat agent with history and optional session context"""
        history = history or []

        # Determine whether a live PDF session exists for this call
        has_document = False
        current_tools = self.base_tools.copy()

        if session_id and pdf_agent_instance is not None:
            # Check if this session is actually loaded in the agent's in-memory store
            session_loaded = hasattr(pdf_agent_instance, 'systems') and session_id in pdf_agent_instance.systems
            if session_loaded:
                has_document = True
                _pdf_agent = pdf_agent_instance
                _sid = session_id

                def run_document_reader(q: str) -> str:
                    result = _pdf_agent.get_response(q, _sid)
                    if isinstance(result, dict):
                        parts = []
                        if result.get("answer"):
                            parts.append(result["answer"])
                        for eq in result.get("equations", []):
                            label = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
                            latex = eq.get("normalized_latex") or eq.get("latex") or eq.get("raw_text") or ""
                            parts.append(f"[{label}]: {latex}")
                        for tb in result.get("tables", []):
                            label = tb.get("label") or f"Table {tb.get('global_number', '?')}"
                            content = tb.get("markdown") or tb.get("raw_text") or ""
                            parts.append(f"[{label}]: {content}")
                        return "\n".join(parts) if parts else "No relevant content found in document for this query."
                    return str(result)

                class DocumentReaderTool:
                    def run(self, q): return run_document_reader(q)

                # In document mode: ONLY expose DocumentReader — no web tools
                current_tools = {
                    "DocumentReader": {
                        "tool": DocumentReaderTool(),
                        "description": "Read and query the content of the PDF document loaded in this session. Always use this tool to answer questions about the document."
                    }
                }

        try:
            # Build system prompt — document mode uses strict grounding, general uses web tools
            base_system = self._get_system_prompt(current_tools, has_document=has_document)
            messages = [SystemMessage(content=base_system)]
            
            # Format history (skip system-role entries — those are handled above)
            for msg in (history or []):
                role = msg.get("role", "")
                if role == "user":
                    messages.append(HumanMessage(content=msg.get("content", "")))
                elif role == "ai":
                    messages.append(AIMessage(content=msg.get("content", "")))
                # Skip 'system' entries — they must NOT override the grounding prompt

            if has_document:
                messages.append(HumanMessage(content=f"Question about the document: {query}"))
            else:
                messages.append(HumanMessage(content=f"Question: {query}\n\nYou MUST use a tool before answering."))
            
            sources = []
            steps = []
            max_iterations = 5
            tools_used = 0
            
            for iteration in range(max_iterations):
                response = self.llm.invoke(messages)
                response_text = response.content
                
                # Parse response
                thought_match = re.search(r"Thought:\s*(.+?)(?=Action:|Final Answer:|$)", response_text, re.DOTALL | re.IGNORECASE)
                action_match = re.search(r"Action:\s*(\w+)", response_text, re.IGNORECASE)
                action_input_match = re.search(
                    r"Action Input:\s*(.+?)(?=\nObservation:|\nThought:|\nFinal Answer:|$)", 
                    response_text, re.DOTALL | re.IGNORECASE
                )
                
                # Check for Final Answer (or short circuit if it just answers directly e.g. out of scope)
                is_final = "Final Answer:" in response_text or "final answer:" in response_text.lower()
                has_action = action_match and action_input_match

                if not has_action and not is_final:
                    # Force it to be final if it didn't pick an action or formulate a final answer gracefully
                    final_answer = response_text
                    return {
                        "response": final_answer,
                        "sources": list(set(sources))
                    }

                if is_final:
                    final_answer_match = re.search(r"Final Answer:\s*(.+)", response_text, re.DOTALL | re.IGNORECASE)
                    if final_answer_match:
                        final_answer = final_answer_match.group(1).strip()
                    else:
                        final_answer = response_text.split("Final Answer:")[-1].strip()
                    
                    return {
                        "response": final_answer,
                        "sources": list(set(sources))
                    }
                
                # Execute tool action
                if has_action:
                    tool_name = action_match.group(1).strip()
                    tool_input = action_input_match.group(1).strip()
                    tool_input = tool_input.replace("[", "").replace("]", "").strip()
                    
                    if tool_name in current_tools:
                        try:
                            observation = current_tools[tool_name]["tool"].run(tool_input)
                            tools_used += 1
                            sources.append(f"{tool_name}: {tool_input}")

                            messages.append(AIMessage(content=response_text))

                            if has_document:
                                # Document mode: model may ONLY use the observation to answer
                                follow_up = (
                                    f"Observation: {observation}\n\n"
                                    f"CRITICAL: Your Final Answer MUST be based SOLELY on the above Observation. "
                                    f"Do NOT add any information from your training data. "
                                    f"If the Observation does not contain enough information, say so explicitly."
                                )
                            else:
                                follow_up = (
                                    f"Observation: {observation}\n\n"
                                    f"You can now either use another tool or provide a Final Answer based on this information."
                                )
                            messages.append(HumanMessage(content=follow_up))

                        except Exception as e:
                            error_msg = f"Error using {tool_name}: {str(e)}"
                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"{error_msg}\n\nPlease try a different approach."))
                    else:
                        error_msg = f"Unknown tool: {tool_name}. Must be exactly one of: {', '.join(current_tools.keys())}"
                        messages.append(AIMessage(content=response_text))
                        messages.append(HumanMessage(content=error_msg))

            fallback = (
                "I was unable to retrieve enough information to fully answer your question. "
                "Please try rephrasing or ask a more specific question."
            )
            return {
                "response": fallback,
                "sources": list(set(sources))
            }
            
        except Exception as e:
            return {
                "response": f"An error occurred: {str(e)}",
                "sources": []
            }
