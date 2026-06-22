"""
eval_pdf_agent.py — Isolated RAG Evaluation Engine
===================================================
Evaluates the PDF RAG pipeline against ground-truth QA pairs.
Dynamically selects test cases based on the input PDF filename.

Usage:
    python eval_pdf_agent.py --pdf path/to/paper.pdf

Metrics computed:
  - Hit Rate / Context Relevance
  - Faithfulness / Strict Grounding Rate
  - Semantic / Exact Match Accuracy
"""

import os
import sys
import re
import time
import argparse
from typing import Dict, List, Any, Optional

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
CURRENT_FILE = os.path.abspath(__file__)
BACKEND_DIR = os.path.dirname(CURRENT_FILE)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
MULTIMODELRAG_DIR = os.path.join(PROJECT_ROOT, "multimodelrag")

if MULTIMODELRAG_DIR not in sys.path:
    sys.path.insert(0, MULTIMODELRAG_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Ground-Truth Benchmark Datasets (keyed by paper identifier)
# ---------------------------------------------------------------------------

BENCHMARK_ATTENTION = [
    {
        "id": "math_attention_formula",
        "category": "Math Formula",
        "query": "What is the scaled dot-product attention formula?",
        "expected_keywords": ["softmax", "QK", "sqrt", "d_k", "V"],
        "expected_answer_contains": ["softmax", "d_k"],
        "exact_match": None,
        "context_should_contain": ["attention", "softmax", "sqrt"],
        "is_negative_control": False,
        "description": "Should retrieve and correctly render the Attention(Q,K,V) equation",
    },
    {
        "id": "table2_bleu_score",
        "category": "Table 2 BLEU Score",
        "query": "What is the BLEU score of the Transformer (big) model on the EN-DE WMT 2014 task in Table 2?",
        "expected_keywords": ["28.4", "table", "bleu"],
        "expected_answer_contains": ["28.4"],
        "exact_match": "28.4",
        "context_should_contain": ["28.4", "EN-DE", "Transformer"],
        "is_negative_control": False,
        "description": "Should extract exact BLEU=28.4 from Table 2",
    },
    {
        "id": "table1_complexity",
        "category": "Table 1 Complexity",
        "query": "According to Table 1, what is the complexity per layer of Self-Attention?",
        "expected_keywords": ["O(n^2", "n^2", "d"],
        "expected_answer_contains": ["n", "d"],
        "exact_match": None,
        "context_should_contain": ["self-attention", "complexity", "n^2"],
        "is_negative_control": False,
        "description": "Should retrieve Table 1 and report O(n^2 * d) complexity",
    },
    {
        "id": "hyperparameter_dropout",
        "category": "Hyperparameter Dropout",
        "query": "What dropout rate is used in the Transformer base model and how many training steps were used?",
        "expected_keywords": ["0.1", "dropout", "100000", "100,000", "100k"],
        "expected_answer_contains": ["0.1"],
        "exact_match": None,
        "context_should_contain": ["dropout", "0.1"],
        "is_negative_control": False,
        "description": "Should find P_drop=0.1 and 100K training steps",
    },
    {
        "id": "negative_arabic_translation",
        "category": "Anti-Hallucination (Negative)",
        "query": "What is the Arabic-to-English translation BLEU score reported in this paper?",
        "expected_keywords": [],
        "expected_answer_contains": ["cannot find", "does not contain", "not present", "not available"],
        "exact_match": None,
        "context_should_contain": [],
        "is_negative_control": True,
        "description": "Paper has EN-DE and EN-FR only. Must NOT hallucinate an Arabic score.",
    },
]

BENCHMARK_RL_GENETIC = [
    {
        "id": "math_population_measure",
        "category": "Math Formula (Population)",
        "query": "What is the population-level measure or fitness function used in this paper?",
        "expected_keywords": ["population-level", "measure", "ordering"],
        "expected_answer_contains": ["population", "measure"],
        "exact_match": None,
        "context_should_contain": ["population", "measure"],
        "is_negative_control": False,
        "description": "Should retrieve population-level measures or function mu",
    },
    {
        "id": "core_strategy_hybrid",
        "category": "Core Strategy (Hybrid GA)",
        "query": "How does the paper combine global and local search in the hybrid genetic algorithm?",
        "expected_keywords": ["global search", "local search", "heuristic"],
        "expected_answer_contains": ["search"],
        "exact_match": None,
        "context_should_contain": ["search", "genetic"],
        "is_negative_control": False,
        "description": "Should describe the hybrid genetic algorithm search combination",
    },
    {
        "id": "model_mutation",
        "category": "Model Mutation Rules",
        "query": "What model transformation or mutation rules are used to operationalize environment changes?",
        "expected_keywords": ["model transformation", "mutation"],
        "expected_answer_contains": ["mutation"],
        "exact_match": None,
        "context_should_contain": ["mutation", "model"],
        "is_negative_control": False,
        "description": "Should describe transformation rules or mutation operators",
    },
    {
        "id": "benchmark_validation",
        "category": "Benchmark Lookup",
        "query": "What benchmarks or validation frameworks are used to evaluate the approach (e.g., OpenAI Gym, Meta-World)?",
        "expected_keywords": ["benchmark", "validation", "Gym"],
        "expected_answer_contains": [],
        "exact_match": None,
        "context_should_contain": ["benchmark", "evaluat"],
        "is_negative_control": False,
        "description": "Should identify validation benchmarks used in the paper",
    },
    {
        "id": "negative_arabic_ga",
        "category": "Anti-Hallucination (Negative)",
        "query": "What Arabic translation benchmarks are used for this genetic algorithm?",
        "expected_keywords": [],
        "expected_answer_contains": ["cannot find", "does not contain", "not present", "not available"],
        "exact_match": None,
        "context_should_contain": [],
        "is_negative_control": True,
        "description": "No Arabic translation in an RL/GA paper. Must refuse cleanly.",
    },
]


def select_benchmark(pdf_path: str) -> List[Dict[str, Any]]:
    """Select the appropriate benchmark dataset based on PDF filename."""
    filename = os.path.basename(pdf_path).lower()

    if "1706.03762" in filename or "attention" in filename:
        print("  Benchmark: Attention Is All You Need (1706.03762)")
        return BENCHMARK_ATTENTION
    elif "2606.20324" in filename or "genetic" in filename or "reinforcement" in filename:
        print("  Benchmark: Reinforcement Learning / Genetic Algorithm (2606.20324)")
        return BENCHMARK_RL_GENETIC
    else:
        print(f"  Benchmark: No specific benchmark for '{filename}' — using Attention default")
        return BENCHMARK_ATTENTION


# ---------------------------------------------------------------------------
# Evaluation Functions
# ---------------------------------------------------------------------------

def evaluate_hit_rate(result: Dict[str, Any], test_case: Dict[str, Any]) -> float:
    """Check if retrieved context contains expected keywords (0.0-1.0)."""
    expected = test_case["context_should_contain"]
    if not expected:
        return 1.0

    answer = (result.get("answer") or "").lower()
    sources_text = " ".join(str(s) for s in result.get("sources", [])).lower()
    equations_text = " ".join(
        str(eq.get("latex", "") or eq.get("raw_text", ""))
        for eq in result.get("equations", [])
    ).lower()
    tables_text = " ".join(
        str(tb.get("markdown", "") or tb.get("raw_text", ""))
        for tb in result.get("tables", [])
    ).lower()

    full_context = f"{answer} {sources_text} {equations_text} {tables_text}"
    hits = sum(1 for kw in expected if kw.lower() in full_context)
    return hits / len(expected)


def evaluate_faithfulness(result: Dict[str, Any], test_case: Dict[str, Any]) -> float:
    """Check grounding: negative controls must refuse; positives must answer."""
    answer = (result.get("answer") or "").lower()

    if test_case["is_negative_control"]:
        refusal_phrases = [
            "cannot find", "does not contain", "not present",
            "not available", "no information", "not mentioned",
            "i cannot", "the document does not",
        ]
        return 1.0 if any(p in answer for p in refusal_phrases) else 0.0
    else:
        hallucination_phrases = [
            "cannot find", "does not contain", "not present", "not available",
        ]
        if any(p in answer for p in hallucination_phrases):
            return 0.0
        expected = test_case["expected_answer_contains"]
        if not expected:
            return 1.0
        hits = sum(1 for kw in expected if kw.lower() in answer)
        return hits / len(expected)


def evaluate_exact_match(result: Dict[str, Any], test_case: Dict[str, Any]) -> Optional[float]:
    """For numeric extraction tests, check if the exact value appears."""
    target = test_case.get("exact_match")
    if target is None:
        return None
    answer = result.get("answer") or ""
    return 1.0 if target in answer else 0.0


# ---------------------------------------------------------------------------
# Pipeline Runner
# ---------------------------------------------------------------------------

def run_evaluation(pdf_path: str) -> List[Dict[str, Any]]:
    """Run all benchmark queries against the RAG pipeline."""
    from enhanced_rag_system import EnhancedRAGSystem, EnhancedRAGConfig

    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_api_key:
        print("ERROR: GROQ_API_KEY environment variable not set.")
        sys.exit(1)

    config = EnhancedRAGConfig(
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
        groq_model="llama-3.1-8b-instant",
        groq_vision_model="meta-llama/llama-4-scout-17b-16e-instruct",
        chunk_size=1400,
        chunk_overlap=250,
        top_k=8,
        use_multiquery=True,
        use_self_rag_validation=True,
        strict_grounding=True,
        temp_dir="data/eval_temp",
        exports_dir="data/eval_exports",
        debug=False,
    )

    print("=" * 70)
    print("  RAG EVALUATION ENGINE")
    print("=" * 70)
    print(f"\n  PDF: {pdf_path}")

    benchmark = select_benchmark(pdf_path)

    system = EnhancedRAGSystem(config=config, groq_api_key=groq_api_key)
    system.process_document(pdf_path)
    print("  Document processed successfully.\n")
    print("-" * 70)

    results = []
    for i, tc in enumerate(benchmark, 1):
        print(f"  [{i}/{len(benchmark)}] {tc['category']}...")
        start = time.time()

        try:
            raw_result = system._query_async(
                user_query=tc["query"],
                mode="standard",
                include_sources=True,
                image_mode=False,
            )
        except Exception as e:
            raw_result = {"answer": f"ERROR: {e}", "sources": [], "equations": [], "tables": []}

        elapsed = time.time() - start

        hit_rate = evaluate_hit_rate(raw_result, tc)
        faithfulness = evaluate_faithfulness(raw_result, tc)
        exact = evaluate_exact_match(raw_result, tc)

        results.append({
            "test_case": tc,
            "raw_result": raw_result,
            "metrics": {
                "hit_rate": hit_rate,
                "faithfulness": faithfulness,
                "exact_match": exact,
                "latency_s": round(elapsed, 2),
            },
        })
        status = "PASS" if (hit_rate >= 0.5 and faithfulness >= 0.5) else "FAIL"
        print(f"       [{status}] Hit={hit_rate:.0%} Faith={faithfulness:.0%} "
              f"Exact={'N/A' if exact is None else f'{exact:.0%}'} ({elapsed:.1f}s)")

    return results


# ---------------------------------------------------------------------------
# Summary Report
# ---------------------------------------------------------------------------

def print_summary(results: List[Dict[str, Any]]) -> None:
    """Print a structured evaluation summary table."""
    print("\n")
    print("=" * 70)
    print("  EVALUATION SUMMARY")
    print("=" * 70)
    print()

    header = f"  {'#':<3} {'Category':<32} {'Hit%':<7} {'Faith%':<8} {'Exact%':<8} {'Time':<6}"
    print(header)
    print("  " + "-" * 66)

    total_hit = 0.0
    total_faith = 0.0
    exact_scores: List[float] = []
    total_latency = 0.0
    n = len(results)

    for i, r in enumerate(results, 1):
        m = r["metrics"]
        tc = r["test_case"]
        exact_str = "N/A" if m["exact_match"] is None else f"{m['exact_match']:.0%}"
        if m["exact_match"] is not None:
            exact_scores.append(m["exact_match"])

        row = (
            f"  {i:<3} {tc['category']:<32} "
            f"{m['hit_rate']:.0%}{'':>3} "
            f"{m['faithfulness']:.0%}{'':>4} "
            f"{exact_str:<8} "
            f"{m['latency_s']:.1f}s"
        )
        print(row)

        total_hit += m["hit_rate"]
        total_faith += m["faithfulness"]
        total_latency += m["latency_s"]

    print("  " + "-" * 66)

    avg_hit = total_hit / n if n else 0
    avg_faith = total_faith / n if n else 0
    avg_exact = (sum(exact_scores) / len(exact_scores)) if exact_scores else None
    avg_latency = total_latency / n if n else 0

    print(f"  {'AVG':<3} {'AGGREGATE':<32} "
          f"{avg_hit:.0%}{'':>3} "
          f"{avg_faith:.0%}{'':>4} "
          f"{'N/A' if avg_exact is None else f'{avg_exact:.0%}':<8} "
          f"{avg_latency:.1f}s")

    print()
    print("  " + "=" * 66)
    print("  METRIC DEFINITIONS")
    print("  " + "-" * 66)
    print("  Hit Rate      : Retriever pulled sections with expected keywords")
    print("  Faithfulness  : LLM refused for negatives, answered correctly for positives")
    print("  Exact Match   : Answer contains the exact expected numeric value")
    print("  " + "=" * 66)

    passing = sum(1 for r in results
                  if r["metrics"]["hit_rate"] >= 0.5 and r["metrics"]["faithfulness"] >= 0.5)
    print(f"\n  Result: {passing}/{n} test cases PASSED")
    if passing == n:
        print("  ALL TESTS PASSED")
    else:
        failed = [r["test_case"]["id"] for r in results
                  if r["metrics"]["hit_rate"] < 0.5 or r["metrics"]["faithfulness"] < 0.5]
        print(f"  Failed: {', '.join(failed)}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RAG Evaluation Engine for PDF Agent")
    parser.add_argument("--pdf", required=True, help="Path to the PDF to evaluate")
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        print(f"ERROR: PDF not found at: {args.pdf}")
        sys.exit(1)

    results = run_evaluation(args.pdf)
    print_summary(results)
