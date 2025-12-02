import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import { diffLines } from 'diff';
import type { Interaction, Action } from '../types';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

function calculateDuration(interaction: Interaction): number | null {
  const startTime = new Date(interaction.timestamp).getTime();

  // Find the last action with a timestamp
  let endTime: number | null = null;
  for (const action of interaction.actions) {
    if (action.timestamp) {
      const actionTime = new Date(action.timestamp).getTime();
      if (endTime === null || actionTime > endTime) {
        endTime = actionTime;
      }
    }
  }

  if (endTime === null) return null;
  return endTime - startTime;
}

type Lean4CheckStatus = 'pass' | 'pass_with_sorry' | 'fail';

interface EditInfo {
  file_path: string;
  old_string: string;
  new_string: string;
}

interface ToolInfo {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  is_error?: boolean;
}

interface Lean4CheckInfo {
  file_path?: string;
  result: string;
  status: Lean4CheckStatus;
}

type ThinkingItem = { type: 'thinking'; thinking: string };
type ToolItem = { type: 'tool'; tool: ToolInfo };
type GroupableItem = ThinkingItem | ToolItem;

type DisplayItem =
  | { type: 'edit'; edit: EditInfo }
  | { type: 'text'; text: string }
  | ThinkingItem
  | ToolItem
  | { type: 'lean4check'; lean4check: Lean4CheckInfo }
  | { type: 'auto_compact'; summary: string }
  | { type: 'group'; items: GroupableItem[] };

function getLean4CheckStatus(rawResult: string): Lean4CheckStatus {
  // Parse JSON if needed to get the actual result string
  let result = rawResult;
  try {
    const parsed = JSON.parse(rawResult);
    if (parsed.result) {
      result = parsed.result;
    }
  } catch {
    // Not JSON, use as-is
  }

  // Check for actual Lean compiler errors (not boilerplate text)
  const lines = result.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and boilerplate
    if (!trimmed) continue;
    if (trimmed.startsWith('Lake produces')) continue;
    if (trimmed.startsWith('These may indicate')) continue;
    if (trimmed.startsWith('Or they may be')) continue;

    // Actual error indicators from Lean compiler (case-insensitive)
    if (/^error:/i.test(trimmed)) return 'fail';
    if (/^ERROR:/.test(trimmed)) return 'fail';  // Explicit ERROR: prefix
    if (/^[^:]+:\d+:\d+: error:/i.test(trimmed)) return 'fail';  // file:line:col: error:

    // Lean proof failures
    if (trimmed === 'unsolved goals') return 'fail';

    // Build failure indicators (✗ or explicit failure)
    if (trimmed.includes('✗')) return 'fail';
    if (/failed|failure/i.test(trimmed) && !trimmed.includes('may')) return 'fail';
  }

  // Check for sorry usage (pass but with sorrys)
  if (result.includes("eclaration uses 'sorry'")) {
    return 'pass_with_sorry';
  }

  // If we have successful builds (✔) and no errors, it's a success
  if (result.includes('✔')) return 'pass';

  // No clear indicators - assume success if no errors found
  return 'pass';
}

function extractDisplayItems(actions: Action[]): DisplayItem[] {
  const rawItems: DisplayItem[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // Handle Edit tool calls
    if (action.type === 'tool_use' && action.tool_name === 'Edit' && action.tool_input) {
      const input = action.tool_input as { file_path?: string; old_string?: string; new_string?: string };
      if (input.file_path && input.old_string !== undefined && input.new_string !== undefined) {
        rawItems.push({
          type: 'edit',
          edit: {
            file_path: input.file_path,
            old_string: input.old_string,
            new_string: input.new_string,
          },
        });
      }
    }
    // Handle lean4check tool calls specially
    else if (action.type === 'tool_use' && action.tool_name === 'mcp__lean4check__check') {
      if (action.tool_result) {
        const input = action.tool_input as { file_path?: string } | undefined;
        rawItems.push({
          type: 'lean4check',
          lean4check: {
            file_path: input?.file_path,
            result: action.tool_result,
            status: action.is_error ? 'fail' : getLean4CheckStatus(action.tool_result),
          },
        });
      }
    }
    // Handle other tool calls (not Edit, not lean4check)
    else if (action.type === 'tool_use' && action.tool_name) {
      rawItems.push({
        type: 'tool',
        tool: {
          name: action.tool_name,
          input: action.tool_input || {},
          result: action.tool_result,
          is_error: action.is_error,
        },
      });
    }
    // Handle text responses
    else if (action.type === 'text' && action.text) {
      rawItems.push({ type: 'text', text: action.text });
    }
    // Handle thinking
    else if (action.type === 'thinking' && action.thinking) {
      rawItems.push({ type: 'thinking', thinking: action.thinking });
    }
    // Handle auto_compact
    else if (action.type === 'auto_compact' && action.summary) {
      rawItems.push({ type: 'auto_compact', summary: action.summary });
    }
  }

  // Group consecutive thinking and tool items
  const items: DisplayItem[] = [];
  let currentGroup: GroupableItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    if (currentGroup.length === 1) {
      items.push(currentGroup[0]);
    } else {
      items.push({ type: 'group', items: currentGroup });
    }
    currentGroup = [];
  };

  for (const item of rawItems) {
    if (item.type === 'thinking' || item.type === 'tool') {
      currentGroup.push(item);
    } else {
      flushGroup();
      items.push(item);
    }
  }
  flushGroup();

  return items;
}

function DiffView({ edit }: { edit: EditInfo }) {
  const [expanded, setExpanded] = useState(false);

  const fileName = edit.file_path.split('/').pop() || edit.file_path;

  const diff = useMemo(() => diffLines(edit.old_string, edit.new_string), [edit.old_string, edit.new_string]);

  // Count additions and deletions
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const part of diff) {
      const lines = part.value.split('\n').filter(l => l !== '' || part.value === '\n').length;
      if (part.added) added += lines;
      else if (part.removed) removed += lines;
    }
    return { added, removed };
  }, [diff]);

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden mb-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 hover:bg-neutral-100 flex items-center gap-2 text-left"
      >
        <span className={`text-neutral-400 text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="font-medium text-neutral-800">{fileName}</span>
        <span className="text-neutral-500 ml-auto font-mono text-[10px]">
          {stats.removed > 0 && <span className="text-red-500">-{stats.removed}</span>}
          {stats.removed > 0 && stats.added > 0 && ' '}
          {stats.added > 0 && <span className="text-emerald-500">+{stats.added}</span>}
        </span>
      </button>
      {expanded && (
        <div className="font-mono text-[11px] leading-relaxed border-t border-neutral-200">
          <div className="px-3 py-1.5 bg-neutral-100 text-neutral-500 truncate">
            {edit.file_path}
          </div>
          <div>
            {diff.map((part, i) => {
              const lines = part.value.split('\n');
              // Remove last empty element if the string ends with newline
              if (lines[lines.length - 1] === '') lines.pop();

              if (part.added) {
                return (
                  <div key={i} className="bg-emerald-50/70">
                    {lines.map((line, j) => (
                      <div key={j} className="px-3 py-0.5 text-emerald-700 flex">
                        <span className="text-emerald-500 select-none w-5 flex-shrink-0">+</span>
                        <span className="whitespace-pre-wrap break-all">{line}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              if (part.removed) {
                return (
                  <div key={i} className="bg-red-50/70">
                    {lines.map((line, j) => (
                      <div key={j} className="px-3 py-0.5 text-red-700 flex">
                        <span className="text-red-400 select-none w-5 flex-shrink-0">-</span>
                        <span className="whitespace-pre-wrap break-all">{line}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              // Unchanged lines - show for context
              return (
                <div key={i} className="bg-neutral-50">
                  {lines.map((line, j) => (
                    <div key={j} className="px-3 py-0.5 text-neutral-500 flex">
                      <span className="select-none w-5 flex-shrink-0"> </span>
                      <span className="whitespace-pre-wrap break-all">{line}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Lean4CheckView({ lean4check }: { lean4check: Lean4CheckInfo }) {
  const [expanded, setExpanded] = useState(false);

  const fileName = lean4check.file_path?.split('/').pop() || 'lean4check';

  const getResultText = () => {
    try {
      const parsed = JSON.parse(lean4check.result);
      return parsed.result || lean4check.result;
    } catch {
      return lean4check.result;
    }
  };

  const statusConfig = {
    pass: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      icon: '✓',
      iconColor: 'text-emerald-500',
      label: 'pass',
      labelBg: 'bg-emerald-500/20 text-emerald-600',
      text: 'text-emerald-700',
      glow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_2px_rgba(16,185,129,0.1)]',
    },
    pass_with_sorry: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      icon: '⚠',
      iconColor: 'text-amber-500',
      label: 'sorry',
      labelBg: 'bg-amber-500/20 text-amber-600',
      text: 'text-amber-700',
      glow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_2px_rgba(245,158,11,0.1)]',
    },
    fail: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      icon: '✗',
      iconColor: 'text-red-500',
      label: 'fail',
      labelBg: 'bg-red-500/20 text-red-600',
      text: 'text-red-700',
      glow: 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_2px_rgba(239,68,68,0.1)]',
    },
  };

  const config = statusConfig[lean4check.status];

  return (
    <div className={`${config.bg} ${config.border} ${config.glow} border rounded-xl overflow-hidden mb-2 text-xs backdrop-blur-sm`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-white/20 transition-all"
      >
        <span className={`text-sm ${config.iconColor}`}>{config.icon}</span>
        <span className="font-medium text-neutral-800">lean4check</span>
        <span className="text-neutral-500 font-mono text-[10px] truncate max-w-[150px]">{fileName}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto ${config.labelBg}`}>
          {config.label}
        </span>
        <span className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {expanded && (
        <div className={`border-t ${config.border} bg-white/30`}>
          <pre className={`px-3 py-2 whitespace-pre-wrap break-all font-mono text-[11px] ${config.text}`}>
            {getResultText()}
          </pre>
        </div>
      )}
    </div>
  );
}

function ThinkingView({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);

  const preview = thinking.slice(0, 80) + (thinking.length > 80 ? '...' : '');

  return (
    <div className="text-[11px] text-[var(--text-muted)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors"
      >
        <span className={`text-[9px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="italic">Thinking</span>
        {!expanded && (
          <span className="truncate max-w-md">— {preview}</span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-4 text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed italic max-h-40 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

function ToolView({ tool }: { tool: ToolInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-[10px] text-[var(--text-muted)]/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 hover:text-[var(--text-muted)] transition-colors"
      >
        <span className={`text-[8px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="font-mono">{tool.name}</span>
        {tool.result !== undefined && (
          <span className={`w-1.5 h-1.5 rounded-full ${tool.is_error ? 'bg-red-400' : 'bg-emerald-400'}`} />
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-3 space-y-1 max-h-32 overflow-y-auto text-[var(--text-muted)]">
          <pre className="text-[9px] font-mono whitespace-pre-wrap">{JSON.stringify(tool.input, null, 2)}</pre>
          {tool.result !== undefined && (
            <pre className={`text-[9px] font-mono whitespace-pre-wrap ${tool.is_error ? 'text-red-500' : ''}`}>
              → {tool.result.slice(0, 300)}{tool.result.length > 300 ? '...' : ''}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AutoCompactView(_props: { summary: string }) {
  return (
    <div className="text-[11px] text-[var(--text-muted)] italic">
      Context resumed
    </div>
  );
}

function GroupedView({ items }: { items: GroupableItem[] }) {
  const [expanded, setExpanded] = useState(false);

  const thinkingCount = items.filter(i => i.type === 'thinking').length;
  const toolCount = items.filter(i => i.type === 'tool').length;

  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} tool call${toolCount > 1 ? 's' : ''}`);
  }
  if (thinkingCount > 0) {
    parts.push(`${thinkingCount} thought${thinkingCount > 1 ? 's' : ''}`);
  }
  const label = parts.join(' and ');

  return (
    <div className="text-[11px] text-[var(--text-muted)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors"
      >
        <span className={`text-[9px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span className="italic">{label}</span>
      </button>
      {expanded && (
        <div className="mt-2 pl-3 space-y-2 border-l border-white/30">
          {items.map((item, i) => {
            if (item.type === 'thinking') {
              return <ThinkingView key={i} thinking={item.thinking} />;
            }
            return <ToolView key={i} tool={item.tool} />;
          })}
        </div>
      )}
    </div>
  );
}

interface InteractionViewProps {
  interaction: Interaction;
  index: number;
}

export function InteractionView({ interaction, index }: InteractionViewProps) {
  const displayItems = extractDisplayItems(interaction.actions);
  const hasDisplayItems = displayItems.length > 0;
  const duration = useMemo(() => calculateDuration(interaction), [interaction]);

  const stats = useMemo(() => {
    let edits = 0;
    let lean4checks = 0;
    for (const item of displayItems) {
      if (item.type === 'edit') edits++;
      if (item.type === 'lean4check') lean4checks++;
    }
    return { edits, lean4checks };
  }, [displayItems]);

  const agentSummary = useMemo(() => {
    const parts: string[] = [];
    if (duration !== null) {
      parts.push(`worked ${formatDuration(duration)}`);
    }
    const countParts: string[] = [];
    if (stats.edits > 0) {
      countParts.push(`${stats.edits} edit${stats.edits > 1 ? 's' : ''}`);
    }
    if (stats.lean4checks > 0) {
      countParts.push(`${stats.lean4checks} lean4check${stats.lean4checks > 1 ? 's' : ''}`);
    }
    if (countParts.length > 0) {
      parts.push(`with ${countParts.join(' and ')}`);
    }
    return parts.join(' ');
  }, [duration, stats]);

  return (
    <div>
      {/* Interaction number */}
      <div className="flex items-center gap-2 mb-2 px-4 md:px-5">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">#{index + 1}</span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {new Date(interaction.timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
        {interaction.model && (
          <span className="text-[10px] text-[var(--text-muted)] font-mono ml-auto">
            {interaction.model.replace(/^claude-/, '').replace(/-\d{8}$/, '')}
          </span>
        )}
      </div>

      {/* Human message with highlighted header */}
      <div className="bg-blue-50 rounded-lg px-4 py-3 md:px-5 md:py-4">
        <div className="text-xs font-semibold text-blue-600 mb-1.5">Human</div>
        <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed break-words">
          {interaction.user_prompt}
        </div>
      </div>

      {/* Agent response */}
      {hasDisplayItems && (
        <div className="mt-3 px-4 md:px-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-violet-500">Agent</span>
            {agentSummary && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {agentSummary}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {displayItems.map((item, i) => {
              if (item.type === 'edit') {
                return <DiffView key={i} edit={item.edit} />;
              }
              if (item.type === 'thinking') {
                return <ThinkingView key={i} thinking={item.thinking} />;
              }
              if (item.type === 'tool') {
                return <ToolView key={i} tool={item.tool} />;
              }
              if (item.type === 'lean4check') {
                return <Lean4CheckView key={i} lean4check={item.lean4check} />;
              }
              if (item.type === 'auto_compact') {
                return <AutoCompactView key={i} summary={item.summary} />;
              }
              if (item.type === 'group') {
                return <GroupedView key={i} items={item.items} />;
              }
              return (
                <div key={i} className="text-sm text-[var(--text-primary)] leading-relaxed prose prose-sm max-w-none prose-pre:bg-neutral-100 prose-pre:text-[var(--text-primary)] prose-code:before:content-none prose-code:after:content-none prose-code:bg-neutral-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[var(--text-primary)] prose-pre:overflow-x-auto">
                  <Markdown>{item.text}</Markdown>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No response */}
      {!hasDisplayItems && !interaction.cancel_reason && (
        <div className="mt-3 px-4 md:px-5 text-[var(--text-muted)] text-xs italic">
          No response
        </div>
      )}

      {/* Cancelled */}
      {interaction.cancel_reason && (
        <div className="mt-3 px-4 md:px-5 py-2 rounded-lg bg-amber-50">
          <span className="text-xs text-amber-600 font-medium">{interaction.cancel_reason}</span>
        </div>
      )}
    </div>
  );
}
