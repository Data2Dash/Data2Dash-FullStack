import os
import re
import json
from typing import Literal

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


# Lazily loaded to avoid slow startup
_embeddings = None


def _get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings


class QuizAgent:
    """
    Generates multiple-choice quizzes from uploaded PDF sessions.
    Reuses the PDF already stored on disk (from the upload endpoint)
    without re-indexing from scratch if a vectorstore cache exists.
    """

    def __init__(self, groq_api_key: str):
        self._groq_api_key = groq_api_key
        # Cache vectorstores keyed by pdf_path so we don't re-embed on every call
        self._vectorstores: dict[str, Chroma] = {}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_vectorstore(self, pdf_path: str) -> Chroma:
        """Load (or return cached) Chroma vectorstore for `pdf_path`."""
        if pdf_path in self._vectorstores:
            return self._vectorstores[pdf_path]

        loader = PyPDFLoader(pdf_path)
        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(chunk_size=5000, chunk_overlap=200)
        splits = splitter.split_documents(docs)

        vectorstore = Chroma.from_documents(documents=splits, embedding=_get_embeddings())
        self._vectorstores[pdf_path] = vectorstore
        return vectorstore

    def _build_system_prompt(self, num_questions: int, difficulty: str) -> str:
        return (
            f"You are an expert educational assistant. Your task is to generate a multiple-choice quiz based on the provided text.\n"
            f"Generate exactly {num_questions} questions at a '{difficulty}' difficulty level.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. You MUST output the quiz strictly as a JSON array of objects.\n"
            "2. Do NOT include any introductory text, markdown fences, or any text outside the JSON array.\n"
            "3. Do NOT use letter prefixes (like A., B., C., D.) in the options or the answer. Provide JUST the text of the choice.\n"
            "4. Each object MUST have exactly these keys: \"question\", \"options\" (array of 4 strings), \"answer\" (string matching one of the options exactly).\n\n"
            "Format your response exactly like this example:\n"
            "[\n"
            "  {{\n"
            '    "question": "What is the capital of France?",\n'
            '    "options": ["London", "Berlin", "Paris", "Madrid"],\n'
            '    "answer": "Paris"\n'
            "  }}\n"
            "]\n\n"
            "Context from the document:\n"
            "{context}"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_quiz(
        self,
        pdf_path: str,
        num_questions: int = 5,
        difficulty: Literal["Easy", "Medium", "Hard"] = "Medium",
    ) -> list[dict]:
        """
        Generate a quiz from a PDF file.

        Args:
            pdf_path: Absolute path to the PDF file on disk.
            num_questions: Number of questions to generate (5, 10, or 20).
            difficulty: Difficulty level ("Easy", "Medium", or "Hard").

        Returns:
            A list of question dicts: [{question, options, answer}, ...]

        Raises:
            ValueError: If the LLM response cannot be parsed as valid JSON.
            FileNotFoundError: If the PDF file does not exist.
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        vectorstore = self._get_vectorstore(pdf_path)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 6})

        # Retrieve the most relevant chunks for quiz generation
        docs = retriever.invoke(
            f"Generate a {difficulty} {num_questions}-question multiple-choice quiz covering the key concepts, findings, and important details of this document."
        )
        context = "\n\n---\n\n".join(d.page_content for d in docs)

        system_prompt = self._build_system_prompt(num_questions, difficulty)
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", f"Generate the {difficulty} {num_questions}-question JSON quiz now. Output ONLY the JSON array."),
        ])

        llm = ChatGroq(
            groq_api_key=self._groq_api_key,
            model_name="llama-3.1-8b-instant",
            temperature=0.3,
        )

        chain = prompt | llm
        response = chain.invoke({"context": context})
        raw_text = response.content if hasattr(response, "content") else str(response)

        # Extract the JSON array from the response
        match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if not match:
            raise ValueError(
                f"LLM did not return a valid JSON array. Raw response:\n{raw_text[:500]}"
            )

        quiz_data = json.loads(match.group(0))

        # Basic validation
        validated = []
        for q in quiz_data:
            if (
                isinstance(q, dict)
                and "question" in q
                and "options" in q
                and "answer" in q
                and isinstance(q["options"], list)
                and len(q["options"]) >= 2
            ):
                validated.append({
                    "question": str(q["question"]),
                    "options": [str(o) for o in q["options"]],
                    "answer": str(q["answer"]),
                })

        if not validated:
            raise ValueError("No valid questions could be extracted from the LLM response.")

        return validated

    def clear_cache(self, pdf_path: str):
        """Remove cached vectorstore for a specific PDF."""
        self._vectorstores.pop(pdf_path, None)
