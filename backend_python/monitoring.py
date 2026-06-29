from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# ── Counters ─────────────────────────────────────────────────────────────────
REQUEST_COUNT = Counter(
    "data2dash_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

MODEL_REQUESTS = Counter(
    "data2dash_model_requests_total",
    "Total LLM model requests",
    ["agent", "model"],
)

MODEL_ERRORS = Counter(
    "data2dash_model_errors_total",
    "Total LLM model errors",
    ["agent", "error_type"],
)

RATE_LIMIT_HITS = Counter(
    "data2dash_rate_limit_hits_total",
    "Total rate limit hits from Groq API",
    ["model"],
)

# ── Histograms ───────────────────────────────────────────────────────────────
REQUEST_LATENCY = Histogram(
    "data2dash_request_latency_seconds",
    "Request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
)

MODEL_LATENCY = Histogram(
    "data2dash_model_latency_seconds",
    "LLM model call latency in seconds",
    ["agent"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60],
)

# ── Gauges ───────────────────────────────────────────────────────────────────
ACTIVE_REQUESTS = Gauge(
    "data2dash_active_requests",
    "Currently active requests",
)

RATE_LIMITED_MODELS = Gauge(
    "data2dash_rate_limited_models",
    "Number of currently rate-limited models",
)


def metrics_endpoint():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


def track_request(method, endpoint, status, duration):
    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status=status).inc()
    REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration)


def track_model_call(agent, model, duration):
    MODEL_REQUESTS.labels(agent=agent, model=model).inc()
    MODEL_LATENCY.labels(agent=agent).observe(duration)


def track_model_error(agent, error_type):
    MODEL_ERRORS.labels(agent=agent, error_type=error_type).inc()


def track_rate_limit(model):
    RATE_LIMIT_HITS.labels(model=model).inc()
