#!/bin/bash
# Run the APA Explorer locally
# Usage: ./run.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

SESSIONS_DIR="$SCRIPT_DIR/data/sessions"
TASKS_FILE="$SCRIPT_DIR/data/tasks.jsonl"

# Check if sessions directory exists
if [ ! -d "$SESSIONS_DIR" ]; then
    echo "Error: Sessions directory not found: $SESSIONS_DIR"
    echo ""
    echo "Place your session JSONL files in data/sessions/"
    exit 1
fi

echo "Starting APA Explorer..."
echo "Sessions directory: $SESSIONS_DIR"
echo "Tasks file: $TASKS_FILE"
echo ""

# Start backend in background
echo "Starting backend server on http://localhost:8000..."
cd "$SCRIPT_DIR/backend"
uv run python server.py "$SESSIONS_DIR" --tasks-file "$TASKS_FILE" &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start frontend
echo "Starting frontend on http://localhost:5173..."
cd "$SCRIPT_DIR/frontend"
bun dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "APA Explorer is running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Wait for both processes
wait
