import type { SessionSummary, SessionInteractions, Stats, Task, TaskCreate, TaskWithDetails } from './types';

const API_BASE = '/api';

export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE}/sessions`);
  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSessionInteractions(sessionId: string): Promise<SessionInteractions> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/interactions`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session interactions: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchStats(): Promise<Stats> {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  return response.json();
}

// Task API functions
export async function fetchTasks(): Promise<Task[]> {
  const response = await fetch(`${API_BASE}/tasks`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchTask(taskId: string): Promise<TaskWithDetails> {
  const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch task: ${response.statusText}`);
  }
  return response.json();
}

export async function createTask(task: TaskCreate): Promise<Task> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create task: ${errorText}`);
  }
  return response.json();
}

export async function deleteTask(taskId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete task: ${response.statusText}`);
  }
}
