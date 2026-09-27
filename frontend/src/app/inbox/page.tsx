"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  draftReply,
  fetchInbox,
  sendReply,
  type InboxThread,
} from "@/lib/api";

function threadId(t: InboxThread) {
  return t.reply_id || t.id || "";
}

function tagLabel(t: InboxThread) {
  const tags = t.tags;
  if (!tags?.length) return null;
  const first = tags[0];
  if (typeof first === "string") return first;
  return first?.name || null;
}

function extractDraftText(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  const result = obj.result;
  const candidates = [
    obj.body,
    obj.draft,
    obj.content,
    obj.text,
    result && typeof result === "object"
      ? (result as Record<string, unknown>).body
      : null,
    result && typeof result === "object"
      ? (result as Record<string, unknown>).draft
      : null,
    result && typeof result === "object"
      ? (result as Record<string, unknown>).content
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return JSON.stringify(data, null, 2);
}

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [rawDraft, setRawDraft] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInbox();
      setThreads(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDraft(id: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    setActiveId(id);
    try {
      const res = await draftReply(id);
      setRawDraft(res);
      setDraftText(extractDraftText(res));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Draft failed (may need credits)",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onSend() {
    if (!activeId || !draftText.trim()) {
      setError("Generate or write a reply first.");
      return;
    }
    const ok = window.confirm("Send this reply via Graph8? This is a live send.");
    if (!ok) return;
    setBusyId(activeId);
    setError(null);
    setMessage(null);
    try {
      await sendReply(activeId, draftText.trim(), "email");
      setMessage("Reply sent.");
      setDraftText("");
      setRawDraft(null);
      setActiveId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Triage clinic replies"
        description="Draft with AI, edit the copy, then confirm send."
        action={
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      )}

      <WorkSurface className="!p-0 overflow-hidden">
        {loading ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">Loading inbox…</p>
        ) : threads.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">
            No inbox threads yet. After campaigns send and people reply, they
            appear here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {threads.map((t, i) => {
              const id = threadId(t);
              const tag = tagLabel(t);
              const active = activeId === id;
              return (
                <li
                  key={`${id}-${i}`}
                  className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                    active ? "bg-[var(--tint)]/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {t.contact?.name || "Unknown contact"}
                      </p>
                      {tag && (
                        <span className="rounded-full bg-[var(--tint)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--accent-deep)]">
                          {tag}
                        </span>
                      )}
                      {t.channel && (
                        <span className="text-[0.65rem] uppercase text-[var(--muted)]">
                          {t.channel}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-[var(--muted)]">
                      {t.preview || t.status || "—"}
                    </p>
                  </div>
                  {id && (
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                      disabled={busyId === id}
                      onClick={() => void onDraft(id)}
                    >
                      {busyId === id ? "Drafting…" : "AI draft"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </WorkSurface>

      {activeId && (
        <WorkSurface className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Reply · {activeId}
          </p>
          <textarea
            className="field mt-3 min-h-40 font-mono text-sm"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="AI draft or write your reply…"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!!busyId || !draftText.trim()}
              onClick={() => void onSend()}
            >
              {busyId === activeId ? "Sending…" : "Confirm & send"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setActiveId(null);
                setDraftText("");
                setRawDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
          {rawDraft != null && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-[var(--muted)]">
                Raw draft response
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(rawDraft, null, 2)}
              </pre>
            </details>
          )}
        </WorkSurface>
      )}
    </div>
  );
}
