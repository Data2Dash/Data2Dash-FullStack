FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend_python/requirements.txt /app/backend_python/requirements.txt
RUN pip install --no-cache-dir -r backend_python/requirements.txt

COPY multimodelrag/requirements.txt /app/multimodelrag/requirements.txt
RUN pip install --no-cache-dir -r multimodelrag/requirements.txt

COPY summarizer/requirements.txt /app/summarizer/requirements.txt
RUN pip install --no-cache-dir -r summarizer/requirements.txt

COPY Knowledge_Graph_0.1/requirements.txt /app/Knowledge_Graph_0.1/requirements.txt
RUN pip install --no-cache-dir -r Knowledge_Graph_0.1/requirements.txt

COPY "summarization with critical review/requirements.txt" "/app/summarization with critical review/requirements.txt"
RUN pip install --no-cache-dir -r "/app/summarization with critical review/requirements.txt"

RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY backend_python/ /app/backend_python/
COPY multimodelrag/ /app/multimodelrag/
COPY summarizer/ /app/summarizer/
COPY Knowledge_Graph_0.1/ /app/Knowledge_Graph_0.1/
COPY "summarization with critical review/" "/app/summarization with critical review/"

WORKDIR /app/backend_python

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
