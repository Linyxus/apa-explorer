#!/usr/bin/env python3
"""
Backend server for APA Explorer.

Usage:
    python server.py <sessions_dir>
    python server.py  # defaults to ../data/sessions
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from claude_history import (
    parse_session_file,
    SummaryEntry,
    Session,
    Action,
    Interaction,
)

app = FastAPI(title="APA Explorer API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state for loaded data
loaded_sessions: list[Session] = []
tasks_file: Path | None = None


# =============================================================================
# Pydantic models for API responses
# =============================================================================

class ActionResponse(BaseModel):
    """An action taken by Claude during an interaction."""
    type: str
    timestamp: str | None = None
    thinking: str | None = None
    tool_name: str | None = None
    tool_id: str | None = None
    tool_input: dict | None = None
    tool_result: str | None = None
    is_error: bool = False
    text: str | None = None
    summary: str | None = None


class InteractionResponse(BaseModel):
    """A single interaction: user prompt -> Claude actions -> final response."""
    id: str
    timestamp: str
    user_prompt: str
    actions: list[ActionResponse]
    final_response: str | None = None
    model: str | None = None
    cancel_reason: str | None = None


class SessionSummary(BaseModel):
    session_id: str
    file_name: str
    numeric_id: int | None
    interaction_count: int
    start_time: str | None
    summary: str | None


class SessionInteractions(BaseModel):
    session_id: str
    file_name: str
    numeric_id: int | None
    summary: str | None
    interactions: list[InteractionResponse]


# =============================================================================
# Task models
# =============================================================================

class InteractionRef(BaseModel):
    """Reference to an interaction by session_id and interaction_id."""
    session_id: str
    interaction_id: str


class TaskCreate(BaseModel):
    """Request body for creating a task."""
    description: str
    category: str
    outcome: str
    interactions: list[InteractionRef]


class TaskResponse(BaseModel):
    """A labeled task containing multiple interactions."""
    id: str
    description: str
    category: str
    outcome: str
    interactions: list[InteractionRef]
    created_at: str


class TaskWithDetails(BaseModel):
    """Task with full interaction details for display."""
    id: str
    description: str
    category: str
    outcome: str
    interactions: list[dict]  # Full interaction data
    created_at: str


# =============================================================================
# Conversion functions
# =============================================================================

def action_to_response(action: Action) -> ActionResponse:
    """Convert library Action to API ActionResponse."""
    return ActionResponse(
        type=action.action_type,
        timestamp=action.timestamp.isoformat() if action.timestamp else None,
        thinking=action.thinking,
        tool_name=action.tool_name,
        tool_id=action.tool_id,
        tool_input=action.tool_input,
        tool_result=action.tool_result,
        is_error=action.is_error,
        text=action.text,
        summary=action.summary,
    )


def interaction_to_response(interaction: Interaction) -> InteractionResponse:
    """Convert library Interaction to API InteractionResponse."""
    return InteractionResponse(
        id=interaction.id,
        timestamp=interaction.timestamp.isoformat() if interaction.timestamp else "",
        user_prompt=interaction.user_prompt,
        actions=[action_to_response(a) for a in interaction.actions],
        final_response=interaction.final_response,
        model=interaction.model,
        cancel_reason=interaction.cancel_reason,
    )


# =============================================================================
# Helper functions
# =============================================================================

def normalize_timestamp(ts: datetime) -> datetime:
    """Ensure timestamp is timezone-aware (UTC)."""
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def extract_numeric_id(file_name: str) -> int | None:
    """Extract numeric ID from filename format: {id}_{uuid}.jsonl"""
    stem = file_name.replace('.jsonl', '')
    parts = stem.split('_', 1)
    if len(parts) >= 1 and parts[0].isdigit():
        return int(parts[0])
    return None


def get_session_summary(session: Session) -> SessionSummary:
    """Create a summary for a session."""
    # Find earliest timestamp
    start_time: datetime | None = None
    for entry in session.entries:
        if entry.timestamp:
            ts = normalize_timestamp(entry.timestamp)
            if start_time is None or ts < start_time:
                start_time = ts

    # Find summary if present
    summary_text = None
    for entry in session.entries:
        if isinstance(entry, SummaryEntry):
            summary_text = entry.summary
            break

    return SessionSummary(
        session_id=session.session_id or session.file_path.stem,
        file_name=session.file_path.name,
        numeric_id=extract_numeric_id(session.file_path.name),
        interaction_count=len(session.interactions),
        start_time=start_time.isoformat() if start_time else None,
        summary=summary_text,
    )


# =============================================================================
# API Endpoints
# =============================================================================

@app.get("/api/sessions", response_model=list[SessionSummary])
def list_sessions():
    """List all loaded sessions."""
    summaries = [get_session_summary(s) for s in loaded_sessions]
    # Sort by numeric_id (newest/highest first), fallback to start_time
    summaries.sort(key=lambda s: (s.numeric_id or 0), reverse=True)
    return summaries


@app.get("/api/sessions/{session_id}/interactions", response_model=SessionInteractions)
def get_session_interactions(session_id: str):
    """Get session as grouped interactions."""
    for session in loaded_sessions:
        sid = session.session_id or session.file_path.stem
        if sid == session_id:
            interactions = [interaction_to_response(i) for i in session.interactions]
            # Extract summary if present
            summary_text = None
            for entry in session.entries:
                if isinstance(entry, SummaryEntry):
                    summary_text = entry.summary
                    break
            return SessionInteractions(
                session_id=sid,
                file_name=session.file_path.name,
                numeric_id=extract_numeric_id(session.file_path.name),
                summary=summary_text,
                interactions=interactions,
            )

    raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")


@app.get("/api/stats")
def get_stats():
    """Get overall statistics."""
    total_interactions = sum(len(s.interactions) for s in loaded_sessions)
    return {
        "total_sessions": len(loaded_sessions),
        "total_interactions": total_interactions,
    }


# =============================================================================
# Task Endpoints
# =============================================================================

def load_tasks() -> list[dict]:
    """Load all tasks from tasks.jsonl file."""
    global tasks_file
    if tasks_file is None or not tasks_file.exists():
        return []
    tasks = []
    with open(tasks_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                tasks.append(json.loads(line))
    return tasks


def get_interaction_by_ref(ref: InteractionRef) -> InteractionResponse | None:
    """Find an interaction by its reference."""
    for session in loaded_sessions:
        sid = session.session_id or session.file_path.stem
        if sid == ref.session_id:
            for interaction in session.interactions:
                if interaction.id == ref.interaction_id:
                    return interaction_to_response(interaction)
    return None


@app.get("/api/tasks", response_model=list[TaskResponse])
def list_tasks():
    """List all tasks."""
    tasks = load_tasks()
    # Sort by created_at (newest first)
    tasks.sort(key=lambda t: t.get('created_at', ''), reverse=True)
    return [
        TaskResponse(
            id=t['id'],
            description=t['description'],
            category=t['category'],
            outcome=t['outcome'],
            interactions=[InteractionRef(**ref) for ref in t['interactions']],
            created_at=t['created_at'],
        )
        for t in tasks
    ]


@app.get("/api/tasks/{task_id}", response_model=TaskWithDetails)
def get_task(task_id: str):
    """Get a task with full interaction details."""
    tasks = load_tasks()
    task = next((t for t in tasks if t['id'] == task_id), None)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")

    # Fetch full interaction details
    interactions_with_details = []
    for ref in task['interactions']:
        interaction = get_interaction_by_ref(InteractionRef(**ref))
        if interaction:
            # Get session info for context
            session_summary = None
            session_numeric_id = None
            for session in loaded_sessions:
                sid = session.session_id or session.file_path.stem
                if sid == ref['session_id']:
                    session_summary = get_session_summary(session).summary
                    session_numeric_id = extract_numeric_id(session.file_path.name)
                    break
            interactions_with_details.append({
                'session_id': ref['session_id'],
                'session_numeric_id': session_numeric_id,
                'session_summary': session_summary,
                'interaction': interaction.model_dump(),
            })

    return TaskWithDetails(
        id=task['id'],
        description=task['description'],
        category=task['category'],
        outcome=task['outcome'],
        interactions=interactions_with_details,
        created_at=task['created_at'],
    )


# =============================================================================
# Data Loading
# =============================================================================

def load_sessions_directory(sessions_dir: Path) -> None:
    """Load all session files from a flat directory."""
    global loaded_sessions
    loaded_sessions = []

    for jsonl_file in sorted(sessions_dir.glob("*.jsonl")):
        try:
            session = parse_session_file(jsonl_file)
            loaded_sessions.append(session)
        except Exception as e:
            print(f"Warning: Failed to parse {jsonl_file}: {e}")


# =============================================================================
# Main
# =============================================================================

def main():
    global tasks_file

    parser = argparse.ArgumentParser(description="APA Explorer Backend")
    parser.add_argument(
        "sessions_dir",
        nargs="?",
        type=Path,
        help="Directory containing session JSONL files"
    )
    parser.add_argument("--port", "-p", type=int, default=8000, help="Port to run on")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument(
        "--tasks-file",
        type=Path,
        help="Path to tasks.jsonl file (default: tasks.jsonl in data directory)"
    )

    args = parser.parse_args()

    # Determine sessions directory
    if args.sessions_dir:
        sessions_dir = args.sessions_dir
    else:
        # Default: data/sessions in project root
        sessions_dir = Path(__file__).parent.parent / "data" / "sessions"

    if not sessions_dir.exists():
        print(f"Error: Sessions directory not found: {sessions_dir}")
        print("\nPlace your session JSONL files in the data/sessions directory.")
        sys.exit(1)

    # Set tasks file path
    if args.tasks_file:
        tasks_file = args.tasks_file
    else:
        tasks_file = Path(__file__).parent.parent / "data" / "tasks.jsonl"

    print(f"Loading sessions from: {sessions_dir}")
    load_sessions_directory(sessions_dir)
    print(f"Loaded {len(loaded_sessions)} sessions")
    print(f"Tasks file: {tasks_file}")

    print(f"\nStarting server at http://{args.host}:{args.port}")
    print(f"API docs available at http://{args.host}:{args.port}/docs")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
