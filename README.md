# APA Explorer

An interactive web application for exploring Claude Code interaction history, designed for the "Agentic Proof Automation: A Case Study" research project.

## Project Structure

```
apa-explorer/
├── backend/           # Python FastAPI backend
│   ├── server.py
│   ├── claude_history.py
│   └── Dockerfile
├── frontend/          # React + TypeScript frontend
│   ├── src/
│   └── Dockerfile
├── data/              # Your data files
│   ├── sessions/      # Session JSONL files
│   └── tasks.jsonl    # Task definitions
├── docker-compose.yml
├── run.sh             # Local development script
└── README.md
```

## Quick Start with Docker

1. **Place your data files**

   ```
   data/
   ├── sessions/
   │   ├── 1_abc123.jsonl
   │   ├── 2_def456.jsonl
   │   └── ...
   └── tasks.jsonl
   ```

2. **Start the application**

   ```bash
   docker compose up --build
   ```

3. **Open in browser**

   Visit http://localhost:22025

## Local Development

### Prerequisites

- Python 3.12+ with [uv](https://github.com/astral-sh/uv)
- [Bun](https://bun.sh/) (for frontend)

### Running locally

```bash
# Option 1: Use the run script
./run.sh

# Option 2: Run manually
# Terminal 1: Backend
cd backend
uv run python server.py ../data/sessions --tasks-file ../data/tasks.jsonl

# Terminal 2: Frontend
cd frontend
bun install
bun dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/docs

## Data Format

### Session Files

Session files are JSONL files containing Claude Code interaction history. Each line is a JSON object representing an entry (user message, assistant response, system event, etc.).

### Tasks File

The `tasks.jsonl` file contains labeled tasks that group interactions:

```json
{
  "id": "task-uuid",
  "description": "Task description",
  "category": "proof|state-and-prove|repair|refactor|query|chore",
  "outcome": "success|partial|failure|success_with_human|partial_with_human|failure_with_human",
  "interactions": [
    {"session_id": "session-uuid", "interaction_id": "interaction-1"}
  ],
  "created_at": "2024-01-01T00:00:00Z"
}
```

## License

MIT
