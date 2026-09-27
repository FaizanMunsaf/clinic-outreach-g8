"use client";

import { useEffect, useState } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  enrichContacts,
  fetchListContacts,
  fetchLists,
  getEnrichmentJob,
  type ContactItem,
  type Graph8List,
} from "@/lib/api";

export default function EnrichPage() {
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [listId, setListId] = useState<number | "">("");
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [jobResult, setJobResult] = useState<unknown>(null);
  const [targetField, setTargetField] = useState("email");

  useEffect(() => {
    void fetchLists()
      .then((res) => {
        setLists(res.items);
        if (res.items[0]) setListId(res.items[0].id);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load lists"),
      );
  }, []);

  useEffect(() => {
    if (typeof listId !== "number") return;
    setLoading(true);
    setError(null);
    setSelected([]);
    setPreview(null);
    setJobResult(null);
    void fetchListContacts(listId)
      .then((res) => {
        setContacts(res.items);
        setSelected(
          res.items
            .map((c) => c.id)
            .filter((id): id is number => typeof id === "number"),
        );
      })
      .catch((err) => {
        setContacts([]);
        setError(err instanceof Error ? err.message : "Failed to load contacts");
      })
      .finally(() => setLoading(false));
  }, [listId]);

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function run(dryRun: boolean) {
    if (typeof listId !== "number") {
      setError("Pick a list first.");
      return;
    }
    if (!selected.length) {
      setError("Select at least one CRM contact with an id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await enrichContacts({
        list_id: listId,
        contact_ids: selected,
        dry_run: dryRun,
        mode: "waterfall",
        target_field: targetField,
      });
      if (dryRun) {
        setPreview(res);
        setJobResult(null);
      } else {
        setJobResult(res);
        const jobId =
          (res as { result?: { job_id?: string; id?: string } })?.result
            ?.job_id ||
          (res as { result?: { id?: string } })?.result?.id;
        if (typeof jobId === "string") {
          const status = await getEnrichmentJob(jobId);
          setJobResult({ launch: res, status });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Enrich"
        title="Fill missing emails & phones"
        description="Enrich CRM contacts already on a list. Dry-run first — enrichment can charge Graph8 credits."
      />

      <WorkSurface>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-semibold text-[var(--ink)]">
              Target list
            </label>
            <select
              className="field"
              value={listId === "" ? "" : String(listId)}
              onChange={(e) =>
                setListId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="" disabled>
                Select a list
              </option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.total ?? 0})
                </option>
              ))}
            </select>

            <label className="text-sm font-semibold text-[var(--ink)]">
              Field to enrich
            </label>
            <div className="flex flex-wrap gap-2">
              {["email", "phone", "mobile", "linkedin"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTargetField(f)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                    targetField === f
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] bg-white text-[var(--muted)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || loading}
                onClick={() => void run(true)}
              >
                {busy ? "Working…" : "Dry-run preview"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || loading || !preview}
                onClick={() => {
                  if (
                    confirm(
                      "This may charge Graph8 credits. Run enrichment for real?",
                    )
                  ) {
                    void run(false);
                  }
                }}
              >
                Confirm enrich
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Preview / job
            </p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--ink)]">
              {JSON.stringify(jobResult ?? preview ?? { tip: "Run dry-run first" }, null, 2)}
            </pre>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-[var(--ink)]">
            Contacts on list {loading ? "(loading…)" : `(${contacts.length})`}
          </h2>
          {contacts.length === 0 && !loading ? (
            <p className="text-sm text-[var(--muted)]">
              No CRM contacts with ids yet. Save prospects from the Prospect page
              first.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-[var(--line)] overflow-auto rounded-xl border border-[var(--line)] bg-white">
              {contacts.map((c, i) => {
                const id = c.id;
                const name =
                  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  "Contact";
                const checked = id != null && selected.includes(id);
                return (
                  <li key={`${id}-${i}`} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={id == null}
                      checked={checked}
                      onChange={() => id != null && toggle(id)}
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {name}{" "}
                        {id != null && (
                          <span className="text-xs font-normal text-[var(--muted)]">
                            #{id}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {[c.job_title, c.company_name, c.work_email]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </WorkSurface>
    </div>
  );
}
