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

    def _get_system_prompt(self, tools_dict):
        tools_desc = "\n".join([
            f"- {name}: {info['description']}" 
            for name, info in tools_dict.items()
        ])
        
        return f"""You are the Data2Dash AI, a specialized research assistant focused EXCLUSIVELY on Artificial Intelligence, Machine Learning, Data Science, and related scientific fields.

CRITICAL SCOPE RULE:
If the user asks a question completely unrelated to AI, Machine Learning, Data Science, or scientific research (e.g., cooking recipes, personal advice, random trivia), you MUST politely decline to answer, stating that you are a specialized AI Research Assistant.

Available tools:
{tools_desc}

PROCESS:
1. If the system context already contains the paper title, abstract, or relevant information to answer the question, answer DIRECTLY using that context — do NOT call a tool unnecessarily.
2. If the user mentions an uploaded document and a DocumentReader tool is available, use it.
3. For questions requiring external facts, citations, or recent publications → use Arxiv, Wikipedia, or Search.
4. For general AI news or recent model releases → use Search.

MATH & EQUATION FORMATTING (CRITICAL — ALWAYS FOLLOW):
- ALL mathematical expressions MUST be formatted using LaTeX notation.
- Display equations (standalone on their own line) → wrap in $$...$$
  Example:  $$P(T=1 \\mid X) = \\dfrac{{1}}{{1 + e^{{-z}}}}$$
- Inline math (within a sentence) → wrap in $...$
  Example:  The loss function is $\\mathcal{{L}} = -\\sum_i y_i \\log(\\hat{{y}}_i)$
- Use proper LaTeX commands:
    Fractions   → \\frac{{a}}{{b}}  or  \\dfrac{{a}}{{b}}
    Exponents   → x^{{2}}  or  e^{{-z}}
    Subscripts  → x_{{i}}
    Summation   → \\sum_{{i=1}}^{{n}}
    Integral    → \\int_{{a}}^{{b}} f(x)\\,dx
    Square root → \\sqrt{{x}}
    Greek       → \\alpha, \\beta, \\sigma, \\mu, \\theta, etc.
    Absolute    → \\left| x \\right|
    Matrix      → \\begin{{bmatrix}} a & b \\\\ c & d \\end{{bmatrix}}
- NEVER write equations as plain ASCII like "1/(1 + exp(-z))" — always use $$...$$

CODE FORMATTING (CRITICAL):
- NEVER use inline backticks (`like this`) for Python keywords, variable names, or partial code.
- ALL code — even a single line — MUST be in a complete fenced block with a language tag:
  ```python
  b = set()
  for e in range(10):
      b.add(e)
  ```
- When a paper contains a complete code listing (e.g. Listing 3, Listing 4), reproduce it
  IN FULL as a single fenced block — do not split it across multiple blocks.
- Always pick the correct language tag: python, bash, sql, javascript, r, etc.
- Use markdown formatting (bold, bullet points, headers) for all non-code prose.

Response format when using a tool:

Thought: [explain which tool you'll use and why]
Action: [exactly one of the tool names available]
Action Input: [your search query]

After receiving the Observation:
- Use another tool OR provide Final Answer

To finish:
Thought: [explain your conclusion]
Final Answer: [comprehensive, well-formatted answer with LaTeX for all math]

CRITICAL RULES:
- If context is available in the system message, answer from it directly — skip tools.
- Never guess facts about uploaded documents without using DocumentReader.
- Action must be an EXACT match to an available tool name.

Begin!"""

    def run(self, query: str, history=None, session_id=None):
        """Run the chat agent with history and optional session context"""
        history = history or []
        
        # Prepare tools for this specific run
        current_tools = self.base_tools.copy()
        
        if session_id:
            # Create a wrapper function that calls PDFAgent for this session
            from agents.pdf_agent import PDFAgent
            import os
            
            def run_document_reader(q: str) -> str:
                 groq_api_key = os.getenv("GROQ_API_KEY")
                 temp_pdf_agent = PDFAgent(groq_api_key=groq_api_key)
                 result = temp_pdf_agent.get_response(q, session_id)
                 # get_response now returns a structured dict — convert to readable string
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
                     return "\n".join(parts) if parts else "No content found."
                 return str(result)
            
            # Create a dummy class that looks like a langchain tool to our loop
            class DocumentReaderTool:
                 def run(self, q): return run_document_reader(q)
                 
            current_tools["DocumentReader"] = {
                "tool": DocumentReaderTool(),
                "description": "Read and query the content of the PDF document the user has uploaded in this chat session. Input should be a question or search query about the document."
            }

        try:
            # Extract any system-role entries from history and prepend to system prompt
            extra_system = " ".join(
                msg.get("content", "")
                for msg in (history or [])
                if msg.get("role") == "system"
            )
            base_system = self._get_system_prompt(current_tools)
            full_system = (extra_system + "\n\n" + base_system) if extra_system else base_system
            messages = [SystemMessage(content=full_system)]
            
            # Format history (converting dicts from frontend if needed)
            for msg in (history or []):
                if msg.get("role") == "user":
                    messages.append(HumanMessage(content=msg.get("content", "")))
                elif msg.get("role") == "ai":
                    messages.append(AIMessage(content=msg.get("content", "")))
                # 'system' entries already merged above — skip them here

            messages.append(HumanMessage(content=f"User Message: {query}\n\nRemember: Use tools if it's a factual/research question, or politely decline if it's completely out of scope of AI/Data Science!"))
            
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
                action_input_match = re.search(r"Action Input:\s*(.+?)(?=\n\n|\n(?=[A-Z])|$)", response_text, re.DOTALL | re.IGNORECASE)
                
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
                            messages.append(HumanMessage(content=f"Observation: {observation}\n\nYou can now either use another tool or provide a Final Answer based on this information."))
                            
                        except Exception as e:
                            error_msg = f"Error using {tool_name}: {str(e)}"
                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"{error_msg}\n\nPlease try a different tool or search query."))
                    else:
                        error_msg = f"Unknown tool: {tool_name}. Must be exactly one of: {', '.join(self.tools.keys())}"
                        messages.append(AIMessage(content=response_text))
                        messages.append(HumanMessage(content=error_msg))
            
            return {
                "response": "I reached the maximum number of search steps. Here is the best I found: Please rephrase your question for better results.",
                "sources": list(set(sources))
            }
            
        except Exception as e:
            return {
                "response": f"An error occurred: {str(e)}",
                "sources": []
            }
