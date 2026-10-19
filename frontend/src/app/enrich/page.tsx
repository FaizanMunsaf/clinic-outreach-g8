"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  enrichContacts,
  fetchListContacts,
  fetchLists,
  getEnrichmentJob,
  type ContactItem,
  type Graph8List,
} from "@/lib/api";

function contactId(c: ContactItem): number | null {
  const raw = c.id as number | string | null | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function EnrichPage() {
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [listId, setListId] = useState<number | "">("");
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [jobResult, setJobResult] = useState<unknown>(null);
  const [targetField, setTargetField] = useState("email");

  const selectableIds = useMemo(
    () =>
      contacts
        .map(contactId)
        .filter((id): id is number => id != null),
    [contacts],
  );

  const allSelected =
    selectableIds.length > 0 && selected.size === selectableIds.length;
  const someSelected = selected.size > 0 && !allSelected;

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
    setSelected(new Set());
    setPreview(null);
    setJobResult(null);
    void fetchListContacts(listId)
      .then((res) => {
        setContacts(res.items);
        // Start with nothing selected — user chooses (safer for credits)
        setSelected(new Set());
      })
      .catch((err) => {
        setContacts([]);
        setError(err instanceof Error ? err.message : "Failed to load contacts");
      })
      .finally(() => setLoading(false));
  }, [listId]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(selectableIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function run(dryRun: boolean) {
    if (typeof listId !== "number") {
      setError("Pick a list first.");
      return;
    }
    if (!selected.size) {
      setError("Select at least one CRM contact with an id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await enrichContacts({
        list_id: listId,
        contact_ids: [...selected],
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
                disabled={busy || loading || selected.size === 0}
                onClick={() => void run(true)}
              >
                {busy ? "Working…" : "Dry-run preview"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || loading || !preview || selected.size === 0}
                onClick={() => {
                  if (
                    confirm(
                      `This may charge Graph8 credits for ${selected.size} contact(s). Run enrichment for real?`,
                    )
                  ) {
                    void run(false);
                  }
                }}
              >
                Confirm enrich ({selected.size || 0})
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Preview / job
            </p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--ink)]">
              {JSON.stringify(
                jobResult ??
                  preview ?? {
                    tip: "Select contacts, then run dry-run first",
                  },
                null,
                2,
              )}
            </pre>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              Contacts on list{" "}
              {loading ? "(loading…)" : `(${contacts.length})`}
            </h2>
            {selectableIds.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--accent)]"
                  onClick={() => (allSelected ? clearSelection() : selectAll())}
                >
                  {allSelected
                    ? "Unselect all"
                    : `Select all (${selectableIds.length})`}
                </button>
                {someSelected && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--muted)]"
                    onClick={clearSelection}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {contacts.length === 0 && !loading ? (
            <p className="text-sm text-[var(--muted)]">
              No CRM contacts with ids yet. Save prospects from the Prospect page
              first.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-[var(--line)] overflow-auto rounded-xl border border-[var(--line)] bg-white">
              {selectableIds.length > 0 && (
                <li className="sticky top-0 z-10 flex items-center gap-3 bg-[var(--surface-solid)] px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() =>
                      allSelected ? clearSelection() : selectAll()
                    }
                    aria-label={allSelected ? "Unselect all" : "Select all"}
                  />
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {selected.size} selected
                  </span>
                </li>
              )}
              {contacts.map((c, i) => {
                const id = contactId(c);
                const name =
                  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  "Contact";
                const checked = id != null && selected.has(id);
                return (
                  <li
                    key={`${id ?? "x"}-${i}`}
                    className="flex items-start gap-3 px-4 py-3"
                  >
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
