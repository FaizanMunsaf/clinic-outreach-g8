"use client";

import { useEffect, useState } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  addContactsToList,
  createList,
  fetchLists,
  searchClinics,
  searchContacts,
  type CompanyItem,
  type ContactItem,
  type Graph8List,
} from "@/lib/api";

type Mode = "clinics" | "contacts";

const clinicChips = ["Medical", "Dermatology", "Pediatrics", "Orthopedic"];
const contactChips = [
  "Practice Admin",
  "Office Manager",
  "Practice Administrator",
  "Clinic Manager",
];

function place(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ") || "—";
}

function contactKey(c: ContactItem, idx: number) {
  return `${c.linkedin_url || ""}-${c.first_name}-${c.last_name}-${idx}`;
}

function displayValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t.includes("***")) return null;
    return t;
  }
  return null;
}

function ProfileField({ label, value }: { label: string; value?: unknown }) {
  const text = displayValue(value);
  if (!text) return null;
  const isUrl = /^https?:\/\//i.test(text);
  return (
    <div className="border-b border-[var(--line)] py-2.5 last:border-0">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      {isUrl ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 break-all text-sm font-medium text-[var(--accent)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </a>
      ) : (
        <p className="mt-0.5 break-words text-sm text-[var(--ink)]">{text}</p>
      )}
    </div>
  );
}

function ProfileModal({
  title,
  subtitle,
  fields,
  onClose,
}: {
  title: string;
  subtitle?: string;
  fields: Array<[string, unknown]>;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(12,36,40,0.45)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="animate-rise max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-solid)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--warm)]">
              Profile
            </p>
            <h2
              id="profile-modal-title"
              className="display mt-1 text-xl text-[var(--ink)]"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary !px-3 !py-1.5 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(85vh-5.5rem)] overflow-y-auto px-5 py-2">
          {fields.map(([label, value]) => (
            <ProfileField key={label} label={label} value={value} />
          ))}
          {fields.every(([, v]) => !displayValue(v)) && (
            <p className="py-6 text-sm text-[var(--muted)]">
              No extra profile fields available for this result.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function contactProfileFields(c: ContactItem): Array<[string, unknown]> {
  return [
    ["First name", c.first_name],
    ["Last name", c.last_name],
    ["Job title", c.job_title],
    ["Department", c.job_department],
    ["Company", c.company_name],
    ["Company domain", c.company_domain],
    ["Work email", c.work_email],
    ["City", c.city],
    ["State", c.state],
    ["Country", c.country],
    ["LinkedIn", c.linkedin_url],
    ["Confidence score", c.confidence_score],
    ["Contact ID", c.id],
  ];
}

function companyProfileFields(c: CompanyItem): Array<[string, unknown]> {
  return [
    ["Company name", c.name],
    ["Domain", c.domain],
    ["Industry", c.industry],
    ["City", c.city],
    ["State", c.state],
    ["Country", c.country],
    ["Employee count", c.employee_count],
    ["Company ID", c.id],
  ];
}

function toRow(c: ContactItem): Record<string, string> {
  const row: Record<string, string> = {};
  const map: Array<[keyof ContactItem, string]> = [
    ["first_name", "first_name"],
    ["last_name", "last_name"],
    ["work_email", "work_email"],
    ["job_title", "job_title"],
    ["company_domain", "company_domain"],
    ["linkedin_url", "linkedin_url"],
    ["city", "city"],
    ["state", "state"],
    ["country", "country"],
    ["job_department", "job_department"],
  ];
  for (const [from, to] of map) {
    const v = c[from];
    if (typeof v === "string" && v && !v.includes("***")) row[to] = v;
  }
  return row;
}

export default function ProspectPage() {
  const [mode, setMode] = useState<Mode>("contacts");
  const [query, setQuery] = useState("Clinic Manager");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [listId, setListId] = useState<number | "">("");
  const [newListName, setNewListName] = useState("");
  const [profile, setProfile] = useState<
    | { kind: "contact"; item: ContactItem }
    | { kind: "company"; item: CompanyItem }
    | null
  >(null);

  useEffect(() => {
    void fetchLists()
      .then((res) => {
        setLists(res.items);
        if (res.items[0]) setListId(res.items[0].id);
      })
      .catch(() => {
        /* lists optional until save */
      });
  }, []);

  async function runSearch(nextQuery = query, nextMode = mode) {
    const q = nextQuery.trim();
    if (nextMode === "clinics") {
      if (!q && !city.trim() && !state.trim() && !industry.trim()) {
        setError("Enter a name, city, state, or industry.");
        return;
      }
    } else if (!q) {
      setError("Enter a search term.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    setSelected(new Set());
    try {
      if (nextMode === "clinics") {
        const res = await searchClinics(q, {
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          industry: industry.trim() || undefined,
          limit: 20,
        });
        setCompanies(res.items);
        setContacts([]);
        setTotal(res.total);
      } else {
        const res = await searchContacts(q, 20);
        const sorted = [...res.items].sort((a, b) => {
          const sa = a.confidence_score ?? -Infinity;
          const sb = b.confidence_score ?? -Infinity;
          return sb - sa;
        });
        setContacts(sorted);
        setCompanies([]);
        setTotal(res.total);
      }
    } catch (err) {
      setCompanies([]);
      setContacts([]);
      setTotal(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(contacts.map((_, i) => i)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const allSelected =
    contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0 && !allSelected;

  async function ensureListId(): Promise<number> {
    if (typeof listId === "number") return listId;
    const title =
      newListName.trim() || `ClinicReach ${new Date().toLocaleDateString()}`;
    await createList(title);
    const res = await fetchLists();
    setLists(res.items);
    const created =
      res.items.find((l) => l.title === title) ?? res.items[0];
    if (!created) throw new Error("Could not create list");
    setListId(created.id);
    setNewListName("");
    return created.id;
  }

  async function saveSelected() {
    if (mode !== "contacts") {
      setError("Save-to-list works for decision-makers. Switch to Decision-makers.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one contact.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const id = await ensureListId();
      const rows = [...selected]
        .map((idx) => toRow(contacts[idx]))
        .filter((r) => Object.keys(r).length > 0);
      if (!rows.length) {
        throw new Error("Selected contacts have no importable fields");
      }
      await addContactsToList(id, rows, false);
      setMessage(
        `Saved ${rows.length} contact(s) to list #${id}. Continue on Enrich.`,
      );
      setSelected(new Set());
      const refreshed = await fetchLists();
      setLists(refreshed.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const chips = mode === "clinics" ? clinicChips : contactChips;
  const hasResults =
    (mode === "clinics" && companies.length > 0) ||
    (mode === "contacts" && contacts.length > 0);

  return (
    <div>
      <PageHeader
        eyebrow="Prospect"
        title="Find clinics & decision-makers"
        description="Search Graph8 with filters, select people, and save them into an outreach list."
      />

      <WorkSurface>
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["contacts", "Decision-makers"],
              ["clinics", "Clinics / practices"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
                setMessage(null);
                setCompanies([]);
                setContacts([]);
                setSelected(new Set());
                setTotal(null);
                setCity("");
                setState("");
                setIndustry("");
                setQuery(value === "contacts" ? "Clinic Manager" : "Medical");
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                mode === value
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "clinics"
                  ? "Clinic / practice name"
                  : "e.g. Clinic Manager, Practice Admin"
              }
            />
            <button
              type="submit"
              className="btn-primary shrink-0 sm:min-w-32 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>

          {mode === "clinics" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="field"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <input
                className="field"
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
              <input
                className="field"
                placeholder="Industry (e.g. Medical Practice)"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
          )}
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuery(chip);
                void runSearch(chip, mode);
              }}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {chip}
            </button>
          ))}
        </div>

        {mode === "contacts" && (
          <div className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] p-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Save selected to list
                </label>
                {contacts.length > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--accent)]"
                      onClick={() => (allSelected ? clearSelection() : selectAll())}
                    >
                      {allSelected
                        ? "Unselect all"
                        : `Select all (${contacts.length})`}
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
              <select
                className="field"
                value={listId === "" ? "" : String(listId)}
                onChange={(e) =>
                  setListId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">Create new list…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} ({l.total ?? 0})
                  </option>
                ))}
              </select>
              {listId === "" && (
                <input
                  className="field"
                  placeholder="New list name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-primary w-full disabled:opacity-60"
                disabled={saving || selected.size === 0}
                onClick={() => void saveSelected()}
              >
                {saving
                  ? "Saving…"
                  : `Save ${selected.size || ""} to list`.trim()}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {message}
          </p>
        )}

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              {loading
                ? "Searching Graph8…"
                : hasResults
                  ? "Results"
                  : "No results yet"}
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {total != null ? `${total.toLocaleString()} matches` : "Live API"}
            </span>
          </div>

          {!loading && !error && !hasResults && (
            <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 px-4 py-6 text-sm text-[var(--muted)]">
              Run a search, then save decision-makers into a list.
            </p>
          )}

          {mode === "clinics" && companies.length > 0 && (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-white">
              {companies.map((clinic, idx) => (
                <li key={`${clinic.name}-${idx}`}>
                  <button
                    type="button"
                    className="w-full px-4 py-3.5 text-left transition hover:bg-[var(--tint)]/50"
                    onClick={() =>
                      setProfile({ kind: "company", item: clinic })
                    }
                  >
                    <p className="font-semibold text-[var(--ink)]">
                      {clinic.name || "Untitled company"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {place([
                        clinic.industry,
                        clinic.city,
                        clinic.state,
                        clinic.country,
                        clinic.domain,
                      ])}
                    </p>
                    <p className="mt-1 text-[0.7rem] font-semibold text-[var(--accent)]">
                      View profile
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === "contacts" && contacts.length > 0 && (
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-white">
              <li className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-solid)] px-4 py-2.5">
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
              {contacts.map((person, idx) => {
                const name =
                  [person.first_name, person.last_name]
                    .filter(Boolean)
                    .join(" ") || "Unknown contact";
                const checked = selected.has(idx);
                return (
                  <li
                    key={contactKey(person, idx)}
                    className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-[var(--tint)]/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggle(idx)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${name}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setProfile({ kind: "contact", item: person })
                      }
                    >
                      <p className="font-semibold text-[var(--ink)]">{name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {place([
                          person.job_title,
                          person.company_name,
                          person.city,
                          person.state,
                          person.work_email,
                        ])}
                      </p>
                      <p className="mt-1 text-[0.7rem] font-semibold text-[var(--accent)]">
                        View profile
                      </p>
                    </button>
                    {person.confidence_score != null && (
                      <span className="shrink-0 text-xs text-[var(--muted)]">
                        score {Math.round(person.confidence_score)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </WorkSurface>

      {profile?.kind === "contact" && (
        <ProfileModal
          title={
            [profile.item.first_name, profile.item.last_name]
              .filter(Boolean)
              .join(" ") || "Contact profile"
          }
          subtitle={place([
            profile.item.job_title,
            profile.item.company_name,
          ])}
          fields={contactProfileFields(profile.item)}
          onClose={() => setProfile(null)}
        />
      )}
      {profile?.kind === "company" && (
        <ProfileModal
          title={profile.item.name || "Company profile"}
          subtitle={place([
            profile.item.industry,
            profile.item.city,
            profile.item.state,
          ])}
          fields={companyProfileFields(profile.item)}
          onClose={() => setProfile(null)}
        />
      )}
    </div>
  );
}
