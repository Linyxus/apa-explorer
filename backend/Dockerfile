FROM python:3.13-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn pydantic

# Copy backend code
COPY backend/server.py /app/
COPY backend/claude_history.py /app/

# Create data directory (will be mounted as volume)
RUN mkdir -p /app/data/sessions

EXPOSE 8000

CMD ["python", "server.py", "--host", "0.0.0.0", "--tasks-file", "/app/data/tasks.jsonl", "/app/data/sessions"]
