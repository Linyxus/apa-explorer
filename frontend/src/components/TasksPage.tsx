import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TASK_CATEGORIES, TASK_OUTCOMES } from '../types';
import type { Task, TaskWithDetails, TaskCategory, TaskOutcome } from '../types';
import { fetchTasks, fetchTask } from '../api';
import { InteractionView } from './InteractionView';

// Category colors - semantic coloring based on task type
const CATEGORY_COLORS: Record<TaskCategory, string> = {
  'proof': 'bg-violet-100 text-violet-700',
  'state-and-prove': 'bg-purple-100 text-purple-700',
  'repair': 'bg-orange-100 text-orange-700',
  'refactor': 'bg-blue-100 text-blue-700',
  'query': 'bg-cyan-100 text-cyan-700',
  'chore': 'bg-neutral-100 text-neutral-600',
};

// Outcome colors - success/failure spectrum
const OUTCOME_COLORS: Record<TaskOutcome, string> = {
  'success': 'bg-emerald-100 text-emerald-700',
  'success with human intervention (NL)': 'bg-teal-100 text-teal-700',
  'success with human intervention (code edits)': 'bg-sky-100 text-sky-700',
  'success with human intervention (both natural language and code edits)': 'bg-indigo-100 text-indigo-700',
  'partial': 'bg-amber-100 text-amber-700',
  'problem identified': 'bg-orange-100 text-orange-700',
  'failure': 'bg-red-100 text-red-700',
};

// Short labels for outcomes (for compact display in list)
const OUTCOME_SHORT_LABELS: Record<TaskOutcome, string> = {
  'success': 'success',
  'success with human intervention (NL)': 'success+NL',
  'success with human intervention (code edits)': 'success+code',
  'success with human intervention (both natural language and code edits)': 'success+both',
  'partial': 'partial',
  'problem identified': 'problem-identified',
  'failure': 'failure',
};

// Descriptions for categories (shown below badges)
const CATEGORY_DESCRIPTIONS: Record<TaskCategory, string> = {
  'proof': 'Human states a theorem, agent proves it',
  'state-and-prove': 'Human gives NL description, agent states and proves the property',
  'repair': 'Human made changes that broke proofs, agent fixes the errors',
  'refactor': 'Update definitions and proofs based on NL instructions',
  'query': 'Ask questions about the codebase',
  'chore': 'Fix style warnings',
};

// Descriptions for outcomes (shown below badges)
const OUTCOME_DESCRIPTIONS: Record<TaskOutcome, string> = {
  'success': 'Completed without human intervention',
  'success with human intervention (NL)': 'Completed with natural language hints',
  'success with human intervention (code edits)': 'Completed with human code edits',
  'success with human intervention (both natural language and code edits)': 'Completed with NL guidance and code edits',
  'partial': 'Completed with some sorrys left (but provable)',
  'problem identified': 'Failed but identified actual problem in reasoning',
  'failure': 'Failed even with human intervention',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category as TaskCategory] || 'bg-neutral-100 text-neutral-600';
}

function getOutcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome as TaskOutcome] || 'bg-neutral-100 text-neutral-600';
}

function getOutcomeShortLabel(outcome: string): string {
  return OUTCOME_SHORT_LABELS[outcome as TaskOutcome] || outcome;
}

function getCategoryDescription(category: string): string {
  return CATEGORY_DESCRIPTIONS[category as TaskCategory] || '';
}

function getOutcomeDescription(outcome: string): string {
  return OUTCOME_DESCRIPTIONS[outcome as TaskOutcome] || '';
}

// Tooltip component for badges - renders in portal to avoid clipping
function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ x: rect.left, y: rect.bottom + 4 });
      setShow(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShow(false);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
      {show && createPortal(
        <div
          className="fixed z-[9999] px-2 py-1 text-xs text-white bg-neutral-800 rounded shadow-lg max-w-xs pointer-events-none animate-tooltip-in"
          style={{ left: position.x, top: position.y }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
}

interface TaskListProps {
  onSelectTask: (taskId: string) => void;
  selectedTaskId: string | null;
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

function TaskList({ onSelectTask, selectedTaskId, tasks, loading, error }: TaskListProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [showLegend, setShowLegend] = useState(false);

  const filteredTasks = tasks.filter((task) => {
    if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
    if (outcomeFilter !== 'all' && task.outcome !== outcomeFilter) return false;
    return true;
  });

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
      <div className="px-5 py-4 border-b border-neutral-200 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            Tasks
            <span className="text-xs font-normal text-[var(--text-muted)] bg-neutral-100 px-1.5 py-0.5 rounded">
              {filteredTasks.length}{filteredTasks.length !== tasks.length ? ` / ${tasks.length}` : ''}
            </span>
          </h1>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`w-6 h-6 rounded-full text-xs font-medium transition-colors ${
              showLegend
                ? 'bg-neutral-200 text-[var(--text-primary)]'
                : 'bg-neutral-100 text-[var(--text-muted)] hover:bg-neutral-200'
            }`}
            title="Show legend"
          >
            ?
          </button>
        </div>

        {/* Legend Popup */}
        {showLegend && createPortal(
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowLegend(false)}>
            <div
              className="absolute top-16 left-4 md:left-8 bg-white rounded-xl shadow-xl border border-neutral-200 p-4 max-w-sm animate-popup-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Legend</h3>
                <button
                  onClick={() => setShowLegend(false)}
                  className="w-6 h-6 rounded-full bg-neutral-100 text-[var(--text-muted)] hover:bg-neutral-200 text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs space-y-4">
                <div>
                  <div className="text-[var(--text-muted)] mb-2 font-medium">Categories</div>
                  <div className="space-y-1.5">
                    {TASK_CATEGORIES.map((cat) => (
                      <div key={cat} className="flex items-baseline gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${getCategoryColor(cat)}`}>
                          {cat}
                        </span>
                        <span className="text-[var(--text-secondary)]">{getCategoryDescription(cat)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)] mb-2 font-medium">Outcomes</div>
                  <div className="space-y-1.5">
                    {TASK_OUTCOMES.map((out) => (
                      <div key={out} className="flex items-baseline gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${getOutcomeColor(out)}`}>
                          {getOutcomeShortLabel(out)}
                        </span>
                        <span className="text-[var(--text-secondary)]">{getOutcomeDescription(out)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All categories</option>
            {TASK_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded-md border border-neutral-200 bg-white text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All outcomes</option>
            {TASK_OUTCOMES.map((out) => (
              <option key={out} value={out}>{getOutcomeShortLabel(out)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredTasks.length === 0 ? (
          <div className="p-4 text-[var(--text-muted)] text-sm text-center">
            {tasks.length === 0 ? (
              <>
                <p>No tasks yet</p>
                <a href="#/labeling" className="text-emerald-500 hover:text-emerald-600 mt-2 inline-block">
                  Start labeling
                </a>
              </>
            ) : (
              <p>No tasks match filters</p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`group w-full text-left px-4 py-3 rounded-lg transition-all duration-150 ${
                  selectedTaskId === task.id
                    ? 'bg-neutral-100'
                    : 'hover:bg-neutral-50 active:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Tooltip text={getCategoryDescription(task.category)}>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCategoryColor(task.category)}`}>
                      {task.category}
                    </span>
                  </Tooltip>
                  <Tooltip text={getOutcomeDescription(task.outcome)}>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getOutcomeColor(task.outcome)}`}>
                      {getOutcomeShortLabel(task.outcome)}
                    </span>
                  </Tooltip>
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                    {task.interactions.length} interaction{task.interactions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className={`text-sm line-clamp-2 leading-snug transition-colors ${
                  selectedTaskId === task.id
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                }`}>
                  {task.description}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1">
                  {new Date(task.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskViewProps {
  taskId: string;
  onBack?: () => void;
}

function TaskView({ taskId, onBack }: TaskViewProps) {
  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadTask() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTask(taskId);
        setTask(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setLoading(false);
      }
    }
    loadTask();
  }, [taskId]);

  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [taskId]);

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

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Task not found
      </div>
    );
  }

  // Compute stats across all interactions
  const stats = (() => {
    let lean4checkCalls = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const item of task.interactions) {
      for (const action of item.interaction.actions) {
        if (action.type === 'tool_use') {
          if (action.tool_name === 'mcp__lean4check__check') {
            lean4checkCalls++;
          } else if (action.tool_name === 'Edit' && action.tool_input) {
            const oldString = (action.tool_input.old_string as string) || '';
            const newString = (action.tool_input.new_string as string) || '';
            linesRemoved += oldString.split('\n').length;
            linesAdded += newString.split('\n').length;
          }
        }
      }
    }

    return { lean4checkCalls, linesAdded, linesRemoved };
  })();

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <div className="max-w-2xl mx-auto w-full py-6 md:py-8 px-4 md:px-6 space-y-5 md:space-y-6">
        {/* Header */}
        <div>
          {/* Back button - mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden -ml-1 mb-3 p-2 rounded-lg text-[var(--text-secondary)] hover:bg-neutral-200"
              aria-label="Back to tasks"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Task description */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-snug">
            {task.description}
          </h2>

          {/* Metadata - compact with descriptions */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[var(--text-muted)] w-16">Category</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${getCategoryColor(task.category)}`}>
                {task.category}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {getCategoryDescription(task.category)}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[var(--text-muted)] w-16">Outcome</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${getOutcomeColor(task.outcome)}`}>
                {getOutcomeShortLabel(task.outcome)}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {getOutcomeDescription(task.outcome)}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] pt-0.5">
              {task.interactions.length} interaction{task.interactions.length !== 1 ? 's' : ''}, {stats.lean4checkCalls} lean4check call{stats.lean4checkCalls !== 1 ? 's' : ''}, <span className="text-emerald-600">+{stats.linesAdded}</span> <span className="text-red-500">-{stats.linesRemoved}</span> total edits
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-200" />

        {/* Interactions */}
        <div className="space-y-5 md:space-y-6">
          {task.interactions.map((item) => {
            // Extract original interaction index from id (e.g., "interaction-5" -> 4)
            const originalIndex = parseInt(item.interaction.id.replace('interaction-', ''), 10) - 1;
            return (
              <div key={`${item.session_id}-${item.interaction.id}`}>
                {/* Session context - subtle label */}
                <div className="flex items-center gap-2 mb-1 px-4 md:px-5">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    from session #{item.session_numeric_id}
                  </span>
                  {item.session_summary && (
                    <span className="text-[10px] text-[var(--text-muted)] truncate">— {item.session_summary}</span>
                  )}
                </div>
                <InteractionView
                  interaction={item.interaction}
                  index={originalIndex}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function parseTaskIdFromHash(): string | null {
  const hash = window.location.hash;
  const taskMatch = hash.match(/^#\/tasks\/(.+)$/);
  return taskMatch ? taskMatch[1] : null;
}

export function TasksPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => parseTaskIdFromHash());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update URL when task changes
  useEffect(() => {
    if (selectedTaskId) {
      window.location.hash = `/tasks/${selectedTaskId}`;
    } else {
      window.location.hash = '/tasks';
    }
  }, [selectedTaskId]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      // Only update if we're still on the tasks route
      if (hash.startsWith('#/tasks')) {
        setSelectedTaskId(parseTaskIdFromHash());
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    async function loadTasks() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTasks();
        // Sort by created_at ascending (earliest first)
        data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setTasks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    }
    loadTasks();
  }, []);

  const handleBack = () => {
    setSelectedTaskId(null);
  };

  return (
    <div className="h-screen flex bg-neutral-50 overflow-hidden">
      {/* Sidebar */}
      <div className={`${selectedTaskId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 flex-col bg-white md:m-3 md:rounded-2xl md:shadow-lg md:border md:border-neutral-200/60 overflow-hidden`}>
        <TaskList
          onSelectTask={setSelectedTaskId}
          selectedTaskId={selectedTaskId}
          tasks={tasks}
          loading={loading}
          error={error}
        />
      </div>

      {/* Main Content */}
      <div className={`${selectedTaskId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 overflow-hidden`}>
        {selectedTaskId ? (
          <TaskView
            taskId={selectedTaskId}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[var(--text-muted)]">
              <p className="text-sm">Select a task to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
