export interface Action {
  type: 'thinking' | 'tool_use' | 'text' | 'auto_compact';
  timestamp?: string;
  thinking?: string;
  tool_name?: string;
  tool_id?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  is_error?: boolean;
  text?: string;
  summary?: string;
}

export interface Interaction {
  id: string;
  timestamp: string;
  user_prompt: string;
  actions: Action[];
  final_response: string | null;
  model: string | null;
  cancel_reason: string | null;
}

export interface SessionSummary {
  session_id: string;
  file_name: string;
  numeric_id: number | null;
  interaction_count: number;
  start_time: string | null;
  summary: string | null;
}

export interface SessionInteractions {
  session_id: string;
  file_name: string;
  numeric_id: number | null;
  summary: string | null;
  interactions: Interaction[];
}

export interface Stats {
  total_sessions: number;
  total_interactions: number;
}

// Task types
export const TASK_CATEGORIES = [
  'proof',
  'state-and-prove',
  'repair',
  'refactor',
  'query',
  'chore',
] as const;

export type TaskCategory = typeof TASK_CATEGORIES[number];

export const TASK_OUTCOMES = [
  'success',
  'success with human intervention (NL)',
  'success with human intervention (code edits)',
  'success with human intervention (both natural language and code edits)',
  'partial',
  'problem identified',
  'failure',
] as const;

export type TaskOutcome = typeof TASK_OUTCOMES[number];

export interface InteractionRef {
  session_id: string;
  interaction_id: string;
}

export interface TaskCreate {
  description: string;
  category: TaskCategory;
  outcome: TaskOutcome;
  interactions: InteractionRef[];
}

export interface Task {
  id: string;
  description: string;
  category: string;
  outcome: string;
  interactions: InteractionRef[];
  created_at: string;
}

export interface InteractionWithContext {
  session_id: string;
  session_numeric_id: number | null;
  session_summary: string | null;
  interaction: Interaction;
}

export interface TaskWithDetails {
  id: string;
  description: string;
  category: string;
  outcome: string;
  interactions: InteractionWithContext[];
  created_at: string;
}
