import { useState, useEffect } from 'react';
import { SessionList } from './components/SessionList';
import { SessionView } from './components/SessionView';
import { TasksPage } from './components/TasksPage';

type Route =
  | { type: 'home' }
  | { type: 'sessions'; sessionId: string | null }
  | { type: 'tasks'; taskId: string | null };

function parseHash(): Route {
  const hash = window.location.hash;

  if (hash === '' || hash === '#' || hash === '#/') {
    return { type: 'home' };
  }

  if (hash === '#/sessions') {
    return { type: 'sessions', sessionId: null };
  }

  const sessionMatch = hash.match(/^#\/sessions\/(.+)$/);
  if (sessionMatch) {
    return { type: 'sessions', sessionId: sessionMatch[1] };
  }

  // Legacy route support
  const legacyMatch = hash.match(/^#\/session\/(.+)$/);
  if (legacyMatch) {
    return { type: 'sessions', sessionId: legacyMatch[1] };
  }

  if (hash === '#/tasks') {
    return { type: 'tasks', taskId: null };
  }

  const taskMatch = hash.match(/^#\/tasks\/(.+)$/);
  if (taskMatch) {
    return { type: 'tasks', taskId: taskMatch[1] };
  }

  return { type: 'home' };
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Header & Description */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight mb-4">
            Agentic Proof Automation: A Case Study
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
            <strong className="text-[var(--text-primary)]">Agentic Proof Automation</strong> is an emerging paradigm where humans and AI agents collaborate on mechanized proof development. This website is an interactive explorer for a case study of this approach, documenting the mechanization of <a href="https://dl.acm.org/doi/10.1145/3763112" target="_blank" rel="noopener noreferrer" className="text-[var(--text-primary)] underline decoration-neutral-300 hover:decoration-neutral-400 transition-colors">System Capless</a>.
          </p>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">Mechanization</span>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/linyxus/semantic/tree/case-study"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                Source
              </a>
              <span className="text-neutral-300">|</span>
              <a
                href="https://docs.univalence.xyz/Semantic/CC.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Docs
              </a>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-3">
          <a
            href="#/sessions"
            className="flex items-center justify-between px-5 py-4 rounded-lg border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm transition-all group"
          >
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-blue-600 transition-colors">
                Explore All Sessions
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed max-w-md">
                Browse raw data from each agent session. See the complete conversation history including prompts, tool calls, and responses.
              </p>
            </div>
            <svg className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>

          <a
            href="#/tasks"
            className="flex items-center justify-between px-5 py-4 rounded-lg border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm transition-all group"
          >
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)] group-hover:text-violet-600 transition-colors">
                See All Tasks
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed max-w-md">
                View interactions organized by tasks. Tasks are minimal units where a human expressed an intention and the agent attempted to accomplish it. Each task is categorized and has a recorded outcome.
              </p>
            </div>
            <svg className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

function SessionsPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    const route = parseHash();
    return route.type === 'sessions' ? route.sessionId : null;
  });

  // Update URL when session changes
  useEffect(() => {
    if (selectedSessionId) {
      window.location.hash = `/sessions/${selectedSessionId}`;
    } else {
      window.location.hash = '/sessions';
    }
  }, [selectedSessionId]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHash();
      if (route.type === 'sessions') {
        setSelectedSessionId(route.sessionId);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleBack = () => {
    setSelectedSessionId(null);
  };

  return (
    <div className="h-screen flex bg-neutral-50 overflow-hidden">
      {/* Sidebar - card style */}
      <div className={`${selectedSessionId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 flex-col bg-white md:m-3 md:rounded-2xl md:shadow-lg md:border md:border-neutral-200/60 overflow-hidden`}>
        <SessionList
          onSelectSession={setSelectedSessionId}
          selectedSessionId={selectedSessionId}
        />
      </div>

      {/* Main Content */}
      <div className={`${selectedSessionId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 overflow-hidden`}>
        {selectedSessionId ? (
          <SessionView sessionId={selectedSessionId} onBack={handleBack} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-[var(--text-muted)]">
              <p className="text-sm">Select a session to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  switch (route.type) {
    case 'home':
      return <LandingPage />;
    case 'sessions':
      return <SessionsPage />;
    case 'tasks':
      return <TasksPage />;
  }
}

export default App;
