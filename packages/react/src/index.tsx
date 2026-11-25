'use client';

import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage
} from 'ai';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';

interface ToolResult {
  ok?: boolean;
  text?: string;
  href?: string;
  changed?: boolean;
}

interface ToolInput {
  op?: 'ls' | 'read';
  path?: string;
  action?: string;
  args?: Record<string, unknown>;
}

type ToolPart = {
  toolCallId: string;
  state: string;
  input?: ToolInput;
  output?: ToolResult;
  errorText?: string;
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean };
};

const screenState = new Map<string, Record<string, unknown>>();

/**
 * Tells the agent what is on the user's screen (a selection, an open form),
 * so "archive this one" resolves. Cleared when the component unmounts.
 */
export function useNetaiContext(state: Record<string, unknown>): void {
  const key = useId();
  const serialized = JSON.stringify(state);
  useEffect(() => {
    screenState.set(key, JSON.parse(serialized) as Record<string, unknown>);
    return () => {
      screenState.delete(key);
    };
  }, [key, serialized]);
}

const collectScreenState = () => Object.assign({}, ...screenState.values()) as Record<string, unknown>;

export interface AgentChatProps {
  api?: string;
  /** The route the user is on; the agent resolves "this" against it. */
  pathname?: string;
  onNavigate?: (href: string) => void;
  /** Called after a write lands, so server-rendered data on screen re-fetches. */
  onRefresh?: () => void;
  title?: string;
  placeholder?: string;
  defaultOpen?: boolean;
}

export function AgentChat({
  api = '/api/netai',
  pathname,
  onNavigate,
  onRefresh,
  title = 'Assistant',
  placeholder = 'Ask or tell the app to do something…',
  defaultOpen = false
}: AgentChatProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [follow, setFollow] = useState(true);
  const [draft, setDraft] = useState('');
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api,
        body: () => ({ pathname: pathnameRef.current, state: collectScreenState() })
      }),
    [api]
  );
  const { messages, sendMessage, status, stop, error, addToolApprovalResponse } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
  });

  useFollowAgent(messages, { follow, pathname, onNavigate, onRefresh });

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setDraft('');
  };

  return (
    <>
      <style>{STYLES}</style>
      {!open && (
        <button type="button" className="netai-launcher" onClick={() => setOpen(true)} aria-label={`Open ${title}`}>
          {title}
        </button>
      )}
      {open && (
        <section className="netai-panel" aria-label={title}>
          <header className="netai-header">
            <strong>{title}</strong>
            <label className="netai-follow" title="Move the page as the assistant works">
              <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
              Follow
            </label>
            <button type="button" className="netai-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>

          <div className="netai-messages" ref={listRef}>
            {!messages.length && <p className="netai-empty">I can find things in this app and make changes for you. Changes always ask first.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`netai-message netai-${message.role}`}>
                {message.parts.map((part, index) => {
                  if (part.type === 'text')
                    return part.text ? <p key={index} className="netai-text">{part.text}</p> : null;
                  if (!isToolUIPart(part)) return null;
                  const tool = part as unknown as ToolPart;
                  const name = getToolName(part);
                  if (tool.state === 'approval-requested' && !tool.approval?.isAutomatic)
                    return (
                      <ApprovalCard
                        key={tool.toolCallId}
                        input={tool.input}
                        onAnswer={(approved) => addToolApprovalResponse({ id: tool.approval!.id, approved })}
                      />
                    );
                  return <Step key={tool.toolCallId} name={name} part={tool} />;
                })}
              </div>
            ))}
            {status === 'submitted' && <p className="netai-step netai-pending">Thinking…</p>}
            {error && <p className="netai-error">Something went wrong: {error.message}</p>}
          </div>

          <form className="netai-composer" onSubmit={submit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              aria-label="Message"
            />
            {busy ? (
              <button type="button" onClick={() => void stop()}>Stop</button>
            ) : (
              <button type="submit" disabled={!draft.trim()}>Send</button>
            )}
          </form>
        </section>
      )}
    </>
  );
}

function useFollowAgent(
  messages: UIMessage[],
  options: { follow: boolean; pathname?: string; onNavigate?: (href: string) => void; onRefresh?: () => void }
) {
  const handled = useRef(new Set<string>());
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const { follow, pathname, onNavigate, onRefresh } = latest.current;
    let navigateTo: string | undefined;
    let refresh = false;
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const tool = part as unknown as ToolPart;
        if (tool.state !== 'output-available' || handled.current.has(tool.toolCallId)) continue;
        handled.current.add(tool.toolCallId);
        const output = tool.output;
        if (!output?.ok) continue;
        if (output.changed) refresh = true;
        // open_page is the user's own request, so it moves the page even with Follow off.
        if (output.href && (follow || getToolName(part) === 'open_page')) navigateTo = output.href;
      }
    }
    if (navigateTo && navigateTo !== pathname) onNavigate?.(navigateTo);
    if (refresh) onRefresh?.();
  }, [messages]);
}

function describeStep(name: string, input: ToolInput = {}): string {
  const path = input.path ?? '';
  if (name === 'explore') {
    if (path.endsWith('/actions.json')) return `Checking what can be done at ${path.replace(/\/actions\.json$/, '') || '/'}`;
    return input.op === 'ls' ? `Looking in ${path}` : `Reading ${path}`;
  }
  if (name === 'find_action') return `Preparing ${input.action ?? 'an action'}`;
  if (name === 'call_action') return `${input.action ?? 'Action'} at ${path}`;
  if (name === 'open_page') return `Opening ${path}`;
  return name;
}

function Step({ name, part }: { name: string; part: ToolPart }) {
  const failed = part.state === 'output-error' || part.output?.ok === false || part.approval?.approved === false;
  const done = part.state === 'output-available' && !failed;
  const declined = part.approval?.approved === false;
  return (
    <p className={`netai-step${failed ? ' netai-step-failed' : ''}`}>
      <span aria-hidden>{done ? '✓' : failed ? '✕' : '…'}</span> {describeStep(name, part.input)}
      {declined ? ' — declined' : ''}
    </p>
  );
}

function ApprovalCard({ input = {}, onAnswer }: { input?: ToolInput; onAnswer: (approved: boolean) => void }) {
  const entries = Object.entries(input.args ?? {});
  return (
    <div className="netai-approval" role="group" aria-label="Approve change">
      <p>
        Allow <strong>{input.action}</strong> at <code>{input.path}</code>?
      </p>
      {entries.length > 0 && (
        <dl>
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="netai-approval-buttons">
        <button type="button" onClick={() => onAnswer(true)}>Approve</button>
        <button type="button" className="netai-secondary" onClick={() => onAnswer(false)}>Decline</button>
      </div>
    </div>
  );
}

const STYLES = `
.netai-launcher, .netai-panel {
  --netai-bg: #ffffff; --netai-fg: #18181b; --netai-muted: #71717a; --netai-line: #e4e4e7;
  --netai-soft: #f4f4f5; --netai-accent: #4f46e5; --netai-accent-fg: #ffffff; --netai-danger: #dc2626;
  font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; color: var(--netai-fg);
}
@media (prefers-color-scheme: dark) {
  .netai-launcher, .netai-panel {
    --netai-bg: #18181b; --netai-fg: #f4f4f5; --netai-muted: #a1a1aa; --netai-line: #3f3f46;
    --netai-soft: #27272a; --netai-accent: #818cf8; --netai-accent-fg: #18181b; --netai-danger: #f87171;
  }
}
.netai-launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; border: 0; border-radius: 999px;
  padding: 12px 18px; background: var(--netai-accent); color: var(--netai-accent-fg); font-weight: 600; cursor: pointer;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18); }
.netai-panel { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; flex-direction: column;
  width: min(400px, calc(100vw - 32px)); height: min(600px, calc(100vh - 40px)); background: var(--netai-bg);
  border: 1px solid var(--netai-line); border-radius: 14px; box-shadow: 0 16px 48px rgb(0 0 0 / 0.22); overflow: hidden; }
.netai-header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--netai-line); }
.netai-header strong { flex: 1; }
.netai-follow { display: flex; align-items: center; gap: 6px; color: var(--netai-muted); font-size: 13px; cursor: pointer; }
.netai-close { border: 0; background: none; color: var(--netai-muted); font-size: 20px; line-height: 1; cursor: pointer; }
.netai-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.netai-empty { color: var(--netai-muted); margin: auto 0; text-align: center; }
.netai-message { display: flex; flex-direction: column; gap: 4px; }
.netai-user { align-items: flex-end; }
.netai-user .netai-text { background: var(--netai-accent); color: var(--netai-accent-fg); padding: 8px 12px; border-radius: 12px 12px 2px 12px; max-width: 85%; }
.netai-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.netai-step { margin: 0; color: var(--netai-muted); font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.netai-step-failed { color: var(--netai-danger); }
.netai-error { color: var(--netai-danger); margin: 0; }
.netai-approval { border: 1px solid var(--netai-line); background: var(--netai-soft); border-radius: 10px; padding: 10px 12px; }
.netai-approval p { margin: 0 0 8px; }
.netai-approval code { font-size: 12.5px; }
.netai-approval dl { margin: 0 0 10px; display: grid; gap: 4px; font-size: 13px; }
.netai-approval dl div { display: flex; gap: 8px; }
.netai-approval dt { color: var(--netai-muted); min-width: 72px; }
.netai-approval dd { margin: 0; overflow-wrap: anywhere; }
.netai-approval-buttons { display: flex; gap: 8px; }
.netai-approval button, .netai-composer button { border: 0; border-radius: 8px; padding: 7px 14px; font: inherit; font-weight: 600;
  background: var(--netai-accent); color: var(--netai-accent-fg); cursor: pointer; }
.netai-approval .netai-secondary { background: transparent; color: var(--netai-fg); border: 1px solid var(--netai-line); }
.netai-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--netai-line); }
.netai-composer input { flex: 1; min-width: 0; border: 1px solid var(--netai-line); border-radius: 8px; padding: 8px 10px;
  font: inherit; background: var(--netai-bg); color: var(--netai-fg); }
.netai-composer button:disabled { opacity: 0.5; cursor: default; }
`;
