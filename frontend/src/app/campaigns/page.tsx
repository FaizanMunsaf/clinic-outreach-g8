"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  createCampaign,
  fetchCampaigns,
  fetchCampaignSequence,
  fetchLists,
  launchCampaign,
  prepareCampaign,
  updateCampaignStep,
  type CampaignItem,
  type CampaignStep,
  type Graph8List,
} from "@/lib/api";

const CHANNEL_OPTS = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "sms", label: "SMS / mobile" },
] as const;

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [channels, setChannels] = useState<string[]>(["email", "phone", "sms"]);
  const [pendingLaunchId, setPendingLaunchId] = useState<string | null>(null);
  const [launchPreview, setLaunchPreview] = useState<unknown>(null);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [savingStep, setSavingStep] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    const c = await fetchCampaigns();
    setCampaigns(c.items);
    return c.items;
  }, []);

  const loadLists = useCallback(async () => {
    const l = await fetchLists();
    setLists(l.items);
    setListId((prev) => prev || (l.items[0] ? String(l.items[0].id) : ""));
    return l.items;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const errors: string[] = [];
    try {
      await Promise.all([
        loadCampaigns().catch((err) => {
          errors.push(
            err instanceof Error ? err.message : "Failed to load campaigns",
          );
          return [] as CampaignItem[];
        }),
        loadLists().catch((err) => {
          errors.push(
            err instanceof Error ? err.message : "Failed to load lists",
          );
          return [] as Graph8List[];
        }),
      ]);
      if (errors.length) setError(errors.join(" · "));
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, loadLists]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleChannel(id: string) {
    setChannels((prev) => {
      if (prev.includes(id)) {
        if (id === "email") return prev; // keep email
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const title = name.trim();
    if (!title) {
      setError("Enter a campaign name.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { campaign } = await createCampaign({
        name: title,
        audience_list_id: listId || undefined,
        brief:
          "Outbound clinic GTM for medical practices via email, phone, and SMS: Practice Admins / Office Managers — referrals, scheduling, practice growth.",
        channels,
      });

      if (campaign) {
        setCampaigns((prev) => {
          const without = prev.filter((c) => c.id !== campaign.id);
          return [campaign, ...without];
        });
        if (campaign.id) {
          setEditCampaignId(campaign.id);
          try {
            const prepared = await prepareCampaign(campaign.id);
            setSteps(prepared.result?.steps ?? []);
          } catch {
            /* prepare optional right after create */
          }
        }
      }

      setName("");
      setShowForm(false);
      setMessage(
        campaign?.id
          ? `Created “${campaign.name || title}”. Review/edit clinic copy below before launch.`
          : `Created “${title}”.`,
      );
      await loadCampaigns().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPrepare(id: string) {
    setBusy(true);
    setError(null);
    setEditCampaignId(id);
    try {
      const res = await prepareCampaign(id);
      setSteps(res.result?.steps ?? []);
      setLaunchPreview(res);
      setMessage(
        "Clinic email + phone + SMS copy ready. Edit any step below, then Preview launch.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prepare failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLoadSteps(id: string) {
    setBusy(true);
    setError(null);
    setEditCampaignId(id);
    try {
      const s = await fetchCampaignSequence(id);
      setSteps(s);
      if (!s.length) {
        const res = await prepareCampaign(id);
        setSteps(res.result?.steps ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sequence");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveStep(step: CampaignStep) {
    if (!editCampaignId || !step.step_id) return;
    setSavingStep(step.step_id);
    setError(null);
    try {
      await updateCampaignStep(editCampaignId, step.step_id, {
        subject: step.subject ?? "",
        body: step.body ?? "",
      });
      setMessage(`Saved ${step.channel || "step"} copy for ${step.name || step.step_id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save step failed");
    } finally {
      setSavingStep(null);
    }
  }

  function patchStep(stepId: string, patch: Partial<CampaignStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.step_id === stepId ? { ...s, ...patch } : s)),
    );
  }

  async function onDryRun(id: string) {
    setBusy(true);
    setError(null);
    setPendingLaunchId(null);
    setEditCampaignId(id);
    try {
      // Load steps for editing (best-effort) — launch endpoint soft-prepares itself
      try {
        const s = await fetchCampaignSequence(id);
        if (s.length) setSteps(s);
      } catch {
        /* ignore */
      }
      const res = (await launchCampaign(id, true, false)) as {
        result?: { action_label?: string; warning?: string; details?: unknown };
        clinicreach_blocked?: boolean;
        clinicreach_block_reasons?: string[];
        clinicreach_hint?: string;
        clinicreach_prepare?: { steps?: CampaignStep[] };
      };
      setLaunchPreview(res);
      if (res.clinicreach_prepare?.steps?.length) {
        setSteps(res.clinicreach_prepare.steps);
      }
      const blocked =
        Boolean(res.clinicreach_blocked) ||
        String(res.result?.action_label || "")
          .toLowerCase()
          .includes("blocked");
      setPendingLaunchId(blocked ? null : id);
      if (blocked) {
        const reasons = (res.clinicreach_block_reasons || []).join(" · ");
        setMessage(
          res.clinicreach_hint ||
            `Launch preview BLOCKED${reasons ? ` (${reasons})` : ""}. Fix mailbox/audience in Graph8, then retry. You can still edit copy above.`,
        );
        setError(null);
      } else {
        setMessage(
          `Dry-run ready for ${id}. Review step copy above, then confirm real launch.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Launch preview failed";
      setError(msg);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmLaunch() {
    if (!pendingLaunchId) return;
    const ok = window.confirm(
      `Really launch campaign ${pendingLaunchId}? This starts live email/phone/SMS outreach.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await launchCampaign(pendingLaunchId, false, true);
      setLaunchPreview(res);
      setMessage(`Campaign ${pendingLaunchId} launched.`);
      setPendingLaunchId(null);
      await loadCampaigns().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Clinic campaigns"
        title="Email, phone & SMS for practices"
        description="Multi-channel clinic outreach. Prepare copy, edit every step before send, then dry-run launch."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setShowForm((v) => !v);
                setError(null);
              }}
            >
              {showForm ? "Cancel" : "Create campaign"}
            </button>
          </div>
        }
      />

      {showForm && (
        <WorkSurface className="mb-4">
          <form className="space-y-3" onSubmit={(e) => void onCreate(e)}>
            <input
              className="field"
              placeholder="e.g. Dermatology practice admins — Q1 intros"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={busy}
            />
            <select
              className="field"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              disabled={busy}
            >
              <option value="">No audience list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.total ?? 0})
                </option>
              ))}
            </select>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Channels
              </p>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy || (c.id === "email" && channels.includes("email"))}
                    onClick={() => toggleChannel(c.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                      channels.includes(c.id)
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] bg-white text-[var(--muted)]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary disabled:opacity-60"
              disabled={busy || !name.trim()}
            >
              {busy ? "Creating… (~20s)" : "Create"}
            </button>
          </form>
        </WorkSurface>
      )}

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

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <WorkSurface>
          <p className="text-sm text-[var(--muted)]">
            No campaigns yet. Create one with email + phone/SMS channels.
          </p>
        </WorkSurface>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <WorkSurface key={c.id || c.name} className="!p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="display text-xl text-[var(--ink)]">
                      {c.name || "Untitled"}
                    </h2>
                    {(c.status || c.generation_status) && (
                      <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--accent-deep)]">
                        {c.status || c.generation_status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-all text-sm text-[var(--muted)]">
                    {c.id}
                  </p>
                </div>
                {c.id && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary !py-2 text-sm"
                      disabled={busy}
                      onClick={() => void onLoadSteps(c.id!)}
                    >
                      View / edit copy
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !py-2 text-sm"
                      disabled={busy}
                      onClick={() => void onPrepare(c.id!)}
                    >
                      Prepare copy
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !py-2 text-sm"
                      disabled={busy}
                      onClick={() => void onDryRun(c.id!)}
                    >
                      Preview launch
                    </button>
                  </div>
                )}
              </div>
            </WorkSurface>
          ))}
        </div>
      )}

      {editCampaignId && steps.length > 0 && (
        <WorkSurface className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Review & edit before send · {editCampaignId}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Update subject/body (email) or call/SMS script, then Save step.
          </p>
          <div className="mt-4 space-y-4">
            {steps.map((step) => {
              const ch = (step.channel || "email").toLowerCase();
              const isEmail = ch === "email";
              return (
                <div
                  key={step.step_id}
                  className="rounded-xl border border-[var(--line)] bg-white p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase text-[var(--accent-deep)]">
                      {ch}
                    </span>
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {step.name || step.step_id}
                    </span>
                    {step.day != null && (
                      <span className="text-xs text-[var(--muted)]">
                        Day {step.day}
                      </span>
                    )}
                  </div>
                  {isEmail && (
                    <input
                      className="field mb-2"
                      placeholder="Subject"
                      value={step.subject || ""}
                      onChange={(e) =>
                        patchStep(step.step_id, { subject: e.target.value })
                      }
                    />
                  )}
                  <textarea
                    className="field min-h-28 text-sm"
                    placeholder={
                      isEmail
                        ? "Email body"
                        : ch === "phone"
                          ? "Phone call script"
                          : "SMS / mobile text"
                    }
                    value={step.body || ""}
                    onChange={(e) =>
                      patchStep(step.step_id, { body: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="btn-primary mt-2 !py-2 text-sm"
                    disabled={savingStep === step.step_id}
                    onClick={() => void onSaveStep(step)}
                  >
                    {savingStep === step.step_id ? "Saving…" : "Save step"}
                  </button>
                </div>
              );
            })}
          </div>
        </WorkSurface>
      )}

      {launchPreview != null && (
        <WorkSurface className="mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Launch response
            </p>
            {pendingLaunchId && (
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                disabled={busy}
                onClick={() => void onConfirmLaunch()}
              >
                {busy ? "Launching…" : "Confirm real launch"}
              </button>
            )}
          </div>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(launchPreview, null, 2)}
          </pre>
        </WorkSurface>
      )}
    </div>
  );
}
