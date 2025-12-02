import { useEffect, useState, useRef } from 'react';
import type { SessionInteractions } from '../types';
import { fetchSessionInteractions } from '../api';
import { InteractionView } from './InteractionView';

interface SessionViewProps {
  sessionId: string;
  onBack?: () => void;
}

function extractUuid(fileName: string): string {
  // Filename format: {id}_{uuid}.jsonl
  const stem = fileName.replace('.jsonl', '');
  const underscoreIdx = stem.indexOf('_');
  if (underscoreIdx !== -1) {
    return stem.slice(underscoreIdx + 1);
  }
  return stem;
}

export function SessionView({ sessionId, onBack }: SessionViewProps) {
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

  // Scroll to top when session changes
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [sessionId]);

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
          {/* Back button - mobile only */}
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

        {/* Interactions */}
        {session.interactions.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] text-sm py-12">
            No interactions
          </div>
        ) : (
          <div className="space-y-5 md:space-y-6">
            {session.interactions.map((interaction, index) => (
              <InteractionView
                key={interaction.id}
                interaction={interaction}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
