'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/lib/api';
import { Send, Search, Download, ArrowDownCircle, X } from 'lucide-react';

const MAX_LINES = 2000;
const HISTORY_KEY_PREFIX = 'console-history:';

function lineColorClass(line: string) {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fatal') || l.includes('exception')) return 'text-red-400';
  if (l.includes('warn')) return 'text-amber-500';
  if (l.includes('[panel]')) return 'text-signal-500';
  if (l.match(/^\s*>|debug/)) return 'text-[#6f8478]';
  return 'text-[#d3e3da]';
}

export default function Console({ serverId }: { serverId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const [autoScroll, setAutoScroll] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyKey = `${HISTORY_KEY_PREFIX}${serverId}`;

  // Load command history for this server from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey);
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      /* ignore malformed history */
    }
  }, [historyKey]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setReconnecting(false);
      socket.emit('subscribe', { serverId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('reconnect_attempt', () => setReconnecting(true));
    socket.on('reconnect', () => {
      setReconnecting(false);
      setLines((prev) => [...prev, '[panel] reconnected']);
    });
    socket.on('log', (chunk: string) => {
      setLines((prev) => (prev.length >= MAX_LINES ? [...prev.slice(-MAX_LINES + 1), chunk] : [...prev, chunk]));
    });
    socket.on('error', (msg: string) => {
      setLines((prev) => [...prev, `[panel] ${msg}`]);
    });

    return () => {
      socket.emit('unsubscribe');
      socket.disconnect();
    };
  }, [serverId]);

  // Auto-scroll unless the user has scrolled up to read history
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  function pushHistory(cmd: string) {
    setHistory((prev) => {
      const next = [...prev.filter((c) => c !== cmd), cmd].slice(-100);
      try {
        localStorage.setItem(historyKey, JSON.stringify(next));
      } catch {
        /* storage may be unavailable/full — non-fatal */
      }
      return next;
    });
  }

  function sendCommand() {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('command', { serverId, input });
    pushHistory(input);
    setInput('');
    setHistoryIndex(null);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      sendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(historyIndex - 1, 0);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput('');
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
    }
  }

  function downloadLogs() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverId}-console-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visibleLines = useMemo(() => {
    if (!search.trim()) return lines.map((l, i) => ({ line: l, i, match: false }));
    const q = search.toLowerCase();
    return lines.map((l, i) => ({ line: l, i, match: l.toLowerCase().includes(q) })).filter((l) => l.match || !search);
  }, [lines, search]);

  const matchCount = useMemo(() => (search.trim() ? visibleLines.filter((l) => l.match).length : 0), [visibleLines, search]);

  return (
    <div className="rounded-lg border border-base-700 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-base-700 bg-base-900/60 gap-2 flex-wrap">
        <span className="text-xs font-mono text-[#8ea095]">console</span>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono ${connected ? 'text-signal-500' : reconnecting ? 'text-amber-500' : 'text-red-400'}`}>
            {connected ? '● connected' : reconnecting ? '○ reconnecting…' : '○ disconnected'}
          </span>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="text-[#8ea095] hover:text-signal-500 transition-colors"
            title="Search logs"
          >
            <Search size={14} />
          </button>
          <button onClick={downloadLogs} className="text-[#8ea095] hover:text-signal-500 transition-colors" title="Download logs">
            <Download size={14} />
          </button>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
              }}
              className="flex items-center gap-1 text-xs text-signal-500 hover:underline"
              title="Resume auto-scroll"
            >
              <ArrowDownCircle size={14} /> jump to latest
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-base-700 bg-base-950/60">
          <Search size={13} className="text-[#8ea095]" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-[#5a6b62]"
          />
          {search && <span className="text-xs text-[#8ea095]">{matchCount} match{matchCount === 1 ? '' : 'es'}</span>}
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearch('');
            }}
            className="text-[#8ea095] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="h-96 overflow-y-auto scrollbar-thin px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
        {lines.length === 0 && <p className="text-[#5a6b62]">Waiting for output…</p>}
        {visibleLines.map(({ line, i, match }) => (
          <div key={i} className={`${lineColorClass(line)} ${search && match ? 'bg-signal-500/10 rounded px-1 -mx-1' : ''}`}>
            {line}
          </div>
        ))}
      </div>

      <div className="flex items-center border-t border-base-700">
        <span className="pl-4 text-signal-500 font-mono">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Type a command, ↑/↓ for history…"
          className="flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none placeholder:text-[#5a6b62]"
        />
        <button onClick={sendCommand} className="px-4 text-[#8ea095] hover:text-signal-500">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
