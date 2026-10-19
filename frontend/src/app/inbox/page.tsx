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
  return String(t.reply_id || t.id || "");
}

function tagLabel(t: InboxThread) {
  const tags = t.tags;
  if (!tags?.length) return null;
  const first = tags[0];
  if (typeof first === "string") return first;
  return first?.name || null;
}

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftText, setDraftText] = useState("");
  const [channel, setChannel] = useState("email");
  const [usedFallback, setUsedFallback] = useState(false);

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

  async function onOpen(id: string, threadChannel?: string | null) {
    const ch = (threadChannel || "email").toLowerCase();
    setChannel(ch === "sms" || ch === "phone" ? ch : "email");
    setBusyId(id);
    setError(null);
    setMessage(null);
    setActiveId(id);
    setUsedFallback(false);
    try {
      const res = await draftReply(id, ch === "sms" || ch === "phone" ? ch : "email");
      const draft = res.result;
      setDraftSubject(draft?.subject || "Re: clinic intro — ClinicReach");
      setDraftText(
        draft?.body ||
          "Hi — thank you for your reply. Happy to share how ClinicReach helps Practice Admins with referrals and scheduling.",
      );
      setUsedFallback(Boolean(draft?.fallback));
      if (draft?.channel) setChannel(String(draft.channel));
    } catch (err) {
      setDraftSubject("Re: clinic intro — ClinicReach");
      setDraftText(
        "Hi {{first_name}},\n\nThank you for getting back to us.\n\nHappy to share how ClinicReach helps Practice Admins and Office Managers with referral outreach and scheduling capacity.\n\nWould a 15-minute intro work this week?\n\nBest regards,\nClinicReach",
      );
      setUsedFallback(true);
      setError(
        err instanceof Error
          ? `${err.message} — clinic draft loaded for you to edit.`
          : "Draft failed — clinic template loaded for edit.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onSend() {
    if (!activeId || !draftText.trim()) {
      setError("Write or load a reply first.");
      return;
    }
    const ok = window.confirm(
      `Send this ${channel} reply via Graph8? This is a live send.`,
    );
    if (!ok) return;
    setBusyId(activeId);
    setError(null);
    setMessage(null);
    try {
      await sendReply(
        activeId,
        draftText.trim(),
        channel,
        channel === "email" ? draftSubject.trim() || undefined : undefined,
      );
      setMessage(`${channel.toUpperCase()} reply sent.`);
      setDraftText("");
      setDraftSubject("");
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
        eyebrow="Clinic inbox"
        title="Triage practice replies"
        description="Open a thread, review the generated reply (email / SMS / phone), edit it, then confirm send."
        action={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load()}
          >
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
          <div className="space-y-3 px-5 py-8 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--ink)]">No clinic replies yet</p>
            <p>
              Inbox fills after a campaign actually sends and someone replies
              (email, SMS, or phone). Until then Graph8 returns an empty thread
              list — that is expected.
            </p>
            <p>
              Next: Campaigns → Prepare copy → edit email/phone/SMS → connect a
              Graph8 mailbox → Preview launch.
            </p>
          </div>
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
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => id && void onOpen(id, t.channel)}
                  >
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
                  </button>
                  {id && (
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                      disabled={busyId === id}
                      onClick={() => void onOpen(id, t.channel)}
                    >
                      {busyId === id ? "Loading…" : "Open & edit"}
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
            Edit before send · {activeId}
          </p>
          {usedFallback && (
            <p className="mt-2 text-xs text-[var(--warm)]">
              Using clinic template (AI draft unavailable). Edit freely before
              send.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {(["email", "sms", "phone"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  channel === c
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <input
              className="field mt-3"
              placeholder="Subject"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
            />
          )}
          <textarea
            className="field mt-3 min-h-44 text-sm"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={
              channel === "phone"
                ? "Call script…"
                : channel === "sms"
                  ? "SMS text…"
                  : "Email body…"
            }
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!!busyId || !draftText.trim()}
              onClick={() => void onSend()}
            >
              {busyId === activeId ? "Sending…" : `Confirm & send ${channel}`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setActiveId(null);
                setDraftText("");
                setDraftSubject("");
              }}
            >
              Cancel
            </button>
          </div>
        </WorkSurface>
      )}
    </div>
  );
}
