import { useEffect, useState } from 'react';
import type { SessionSummary, Stats } from '../types';
import { fetchSessions, fetchStats } from '../api';

interface SessionListProps {
  onSelectSession: (sessionId: string) => void;
  selectedSessionId: string | null;
}

export function SessionList({ onSelectSession, selectedSessionId }: SessionListProps) {
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
