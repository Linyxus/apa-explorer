import { useState, useEffect, useRef } from 'react';
import type { SessionSummary, SessionInteractions, InteractionRef, Stats, Interaction, Task, TaskCategory, TaskOutcome } from '../types';
import { TASK_CATEGORIES, TASK_OUTCOMES } from '../types';
import { fetchSessions, fetchSessionInteractions, fetchStats, createTask, fetchTasks, deleteTask } from '../api';
import { InteractionView } from './InteractionView';

interface LabelingSessionListProps {
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
}

function LabelingSessionList({ onSelectSession, selectedSessionId }: LabelingSessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [sessionsData, statsData] = await Promise.all([
          fetchSessions(),
          fetchStats(),
        ]);
        setSessions(sessionsData);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-[var(--text-muted)] text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-neutral-200">
        <h1 className="text-base font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
          Sessions
          {stats && (
            <span className="text-xs font-normal text-[var(--text-muted)] bg-neutral-100 px-1.5 py-0.5 rounded">
              {stats.total_sessions}
            </span>
          )}
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">Select interactions to label</p>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="p-4 text-[var(--text-muted)] text-sm">No sessions found</div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <button
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className={`group w-full text-left px-4 py-3 rounded-lg transition-all duration-150 ${
                  selectedSessionId === session.session_id
                    ? 'bg-neutral-100'
                    : 'hover:bg-neutral-50 active:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  {session.numeric_id && (
                    <span className="text-[10px] font-mono text-[var(--text-secondary)]">#{session.numeric_id}</span>
                  )}
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {session.interaction_count} interaction{session.interaction_count !== 1 ? 's' : ''}
                  </span>
                  {session.start_time && (
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                      {new Date(session.start_time).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  )}
                </div>
                <div className={`text-sm line-clamp-2 leading-snug transition-colors ${
                  selectedSessionId === session.session_id
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                }`}>
                  {session.summary || <span className="text-[var(--text-muted)] italic">Unnamed Session</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SelectableInteractionViewProps {
  interaction: Interaction;
  index: number;
  selected: boolean;
  onToggle: () => void;
}

function SelectableInteractionView({ interaction, index, selected, onToggle }: SelectableInteractionViewProps) {
  return (
    <div className="flex gap-3">
      {/* Selection checkbox */}
      <div className="flex-shrink-0 pt-2">
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors duration-75 ${
            selected
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-white border-neutral-300 hover:border-emerald-400'
          }`}
        >
          {selected && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      </div>
      {/* Interaction content */}
      <div className={`flex-1 min-w-0 rounded-xl transition-colors duration-75 ${selected ? 'bg-emerald-50/40' : ''}`}>
        <InteractionView interaction={interaction} index={index} />
      </div>
    </div>
  );
}

interface LabelingSessionViewProps {
  sessionId: string;
  selectedInteractions: Map<string, Set<string>>;
  onToggleInteraction: (sessionId: string, interactionId: string) => void;
  onBack?: () => void;
}

function extractUuid(fileName: string): string {
  const stem = fileName.replace('.jsonl', '');
  const underscoreIdx = stem.indexOf('_');
  if (underscoreIdx !== -1) {
    return stem.slice(underscoreIdx + 1);
  }
  return stem;
}

function LabelingSessionView({ sessionId, selectedInteractions, onToggleInteraction, onBack }: LabelingSessionViewProps) {
  const [session, setSession] = useState<SessionInteractions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSession() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSessionInteractions(sessionId);
        setSession(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [sessionId]);

  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [sessionId]);

  const sessionSelected = selectedInteractions.get(sessionId) || new Set();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Session not found
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <div className="max-w-2xl mx-auto w-full py-6 md:py-8 px-4 md:px-6 space-y-5 md:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden -ml-1 p-2 rounded-lg text-[var(--text-secondary)] hover:bg-neutral-200"
              aria-label="Back to sessions"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--text-primary)] truncate">
              Session {session.numeric_id ? `#${session.numeric_id}` : ''}
              {session.summary && (
                <span className="font-normal text-[var(--text-secondary)] ml-2">— {session.summary}</span>
              )}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono truncate hidden sm:block">
              {extractUuid(session.file_name)}
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p className="text-sm text-emerald-700">
            Click the checkbox on any interaction to select it for a task.
            {sessionSelected.size > 0 && (
              <span className="font-medium"> ({sessionSelected.size} selected in this session)</span>
            )}
          </p>
        </div>

        {/* Interactions */}
        {session.interactions.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] text-sm py-12">
            No interactions
          </div>
        ) : (
          <div className="space-y-5 md:space-y-6">
            {session.interactions.map((interaction, index) => (
              <SelectableInteractionView
                key={interaction.id}
                interaction={interaction}
                index={index}
                selected={sessionSelected.has(interaction.id)}
                onToggle={() => onToggleInteraction(sessionId, interaction.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CreateTaskModalProps {
  selectedInteractions: InteractionRef[];
  onClose: () => void;
  onSuccess: () => void;
}

function CreateTaskModal({ selectedInteractions, onClose, onSuccess }: CreateTaskModalProps) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [outcome, setOutcome] = useState<TaskOutcome | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !category || !outcome) {
      setError('All fields are required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createTask({
        description: description.trim(),
        category,
        outcome,
        interactions: selectedInteractions,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Create Task</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {selectedInteractions.length} interaction{selectedInteractions.length !== 1 ? 's' : ''} selected
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the human was trying to accomplish..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
            >
              <option value="">Select category...</option>
              {TASK_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Outcome
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as TaskOutcome)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
            >
              <option value="">Select outcome...</option>
              {TASK_OUTCOMES.map((out) => (
                <option key={out} value={out}>{out}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-neutral-300 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-emerald-500 rounded-lg text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface TasksFloatingWidgetProps {
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: (taskId: string) => void;
}

function TasksFloatingWidget({ tasks, expanded, onToggle, onDelete }: TasksFloatingWidgetProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this task?')) return;
    setDeletingId(taskId);
    try {
      await deleteTask(taskId);
      onDelete(taskId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden flex flex-col transition-all duration-200 ease-out ${
        expanded ? 'w-80 max-h-96' : 'w-auto max-h-12'
      }`}
    >
      {/* Header / Collapsed button */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-4 py-3 text-left transition-colors ${
          expanded ? 'border-b border-neutral-200 hover:bg-neutral-50' : 'hover:bg-neutral-50'
        }`}
      >
        <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {expanded ? 'Tasks' : ''} ({tasks.length})
        </span>
        {expanded && (
          <svg className="w-4 h-4 text-[var(--text-muted)] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="p-4 text-sm text-[var(--text-muted)] text-center">
              No tasks yet
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {tasks.map((task) => (
                <div key={task.id} className="px-4 py-3 hover:bg-neutral-50">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                          {task.category}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                          {task.outcome}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-primary)] line-clamp-2">
                        {task.description}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {task.interactions.length} interaction{task.interactions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(task.id, e)}
                      disabled={deletingId === task.id}
                      className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Delete task"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LabelingPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedInteractions, setSelectedInteractions] = useState<Map<string, Set<string>>>(new Map());
  const [showModal, setShowModal] = useState(false);
  const [showTaskList, setShowTaskList] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Load tasks
  const loadTasks = async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleToggleInteraction = (sessionId: string, interactionId: string) => {
    setSelectedInteractions((prev) => {
      const newMap = new Map(prev);
      const sessionSet = new Set(newMap.get(sessionId) || []);
      if (sessionSet.has(interactionId)) {
        sessionSet.delete(interactionId);
      } else {
        sessionSet.add(interactionId);
      }
      if (sessionSet.size === 0) {
        newMap.delete(sessionId);
      } else {
        newMap.set(sessionId, sessionSet);
      }
      return newMap;
    });
  };

  const getTotalSelected = () => {
    let total = 0;
    selectedInteractions.forEach((set) => {
      total += set.size;
    });
    return total;
  };

  const getSelectedRefs = (): InteractionRef[] => {
    const refs: InteractionRef[] = [];
    selectedInteractions.forEach((interactionIds, sessionId) => {
      interactionIds.forEach((interactionId) => {
        refs.push({ session_id: sessionId, interaction_id: interactionId });
      });
    });
    return refs;
  };

  const handleCreateSuccess = () => {
    setShowModal(false);
    setSelectedInteractions(new Map());
    loadTasks();
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const totalSelected = getTotalSelected();

  const handleBack = () => {
    setSelectedSessionId(null);
  };

  return (
    <div className="h-screen flex bg-neutral-50 overflow-hidden">
      {/* Sidebar */}
      <div className={`${selectedSessionId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 flex-col bg-white md:m-3 md:rounded-2xl md:shadow-lg md:border md:border-neutral-200/60 overflow-hidden`}>
        <LabelingSessionList
          onSelectSession={setSelectedSessionId}
          selectedSessionId={selectedSessionId}
        />
      </div>

      {/* Main Content */}
      <div className={`${selectedSessionId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 overflow-hidden`}>
        {selectedSessionId ? (
          <LabelingSessionView
            sessionId={selectedSessionId}
            selectedInteractions={selectedInteractions}
            onToggleInteraction={handleToggleInteraction}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[var(--text-muted)]">
              <p className="text-sm">Select a session to start labeling</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-40 flex items-end gap-3">
        {/* Tasks Widget */}
        <TasksFloatingWidget
          tasks={tasks}
          expanded={showTaskList}
          onToggle={() => setShowTaskList(!showTaskList)}
          onDelete={handleDeleteTask}
        />

        {/* Create Task Button */}
        {totalSelected > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Task ({totalSelected})
          </button>
        )}
      </div>

      {/* Create Task Modal */}
      {showModal && (
        <CreateTaskModal
          selectedInteractions={getSelectedRefs()}
          onClose={() => setShowModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}
