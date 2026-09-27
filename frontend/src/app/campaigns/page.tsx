"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  createCampaign,
  fetchCampaigns,
  fetchLists,
  launchCampaign,
  type CampaignItem,
  type Graph8List,
} from "@/lib/api";

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
  const [pendingLaunchId, setPendingLaunchId] = useState<string | null>(null);
  const [launchPreview, setLaunchPreview] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, l] = await Promise.all([fetchCampaigns(), fetchLists()]);
      setCampaigns(c.items);
      setLists(l.items);
      if (!listId && l.items[0]) setListId(String(l.items[0].id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createCampaign({
        name: name.trim(),
        audience_list_id: listId || undefined,
        brief: "Clinic outreach from ClinicReach",
      });
      setName("");
      setShowForm(false);
      setMessage("Campaign created. Copy may take ~1–2 minutes to generate.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDryRun(id: string) {
    setBusy(true);
    setError(null);
    setPendingLaunchId(null);
    try {
      const res = await launchCampaign(id, true, false);
      setLaunchPreview(res);
      setPendingLaunchId(id);
      setMessage(
        `Dry-run ready for ${id}. Review below, then confirm a real launch.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmLaunch() {
    if (!pendingLaunchId) return;
    const ok = window.confirm(
      `Really launch campaign ${pendingLaunchId}? This starts live outreach.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await launchCampaign(pendingLaunchId, false, true);
      setLaunchPreview(res);
      setMessage(`Campaign ${pendingLaunchId} launched.`);
      setPendingLaunchId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Campaigns"
        title="Sequences for clinic outreach"
        description="Create Graph8 GTM campaigns, dry-run launch, then confirm a real send."
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Create campaign"}
          </button>
        }
      />

      {showForm && (
        <WorkSurface className="mb-4">
          <form className="space-y-3" onSubmit={(e) => void onCreate(e)}>
            <input
              className="field"
              placeholder="Campaign name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="field"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              <option value="">No audience list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create"}
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
            No campaigns yet. Create one with an audience list.
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
                    {c.status && (
                      <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--accent-deep)]">
                        {c.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{c.id}</p>
                </div>
                {c.id && (
                  <button
                    type="button"
                    className="btn-secondary !py-2 text-sm"
                    disabled={busy}
                    onClick={() => void onDryRun(c.id!)}
                  >
                    Preview launch
                  </button>
                )}
              </div>
            </WorkSurface>
          ))}
        </div>
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
