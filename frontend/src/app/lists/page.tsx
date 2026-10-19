"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import {
  createList,
  fetchListContacts,
  fetchLists,
  type ContactItem,
  type Graph8List,
} from "@/lib/api";

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function contactName(m: ContactItem) {
  return (
    [m.first_name, m.last_name].filter(Boolean).join(" ") || "Contact"
  );
}

function contactMeta(m: ContactItem) {
  return (
    [m.job_title, m.company_name, m.work_email, m.city, m.state]
      .filter((v) => typeof v === "string" && v.trim() && v !== "Empty")
      .join(" · ") || "—"
  );
}

export default function ListsPage() {
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [members, setMembers] = useState<ContactItem[]>([]);
  const [membersTotal, setMembersTotal] = useState<number | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLists();
      setLists(res.items);
      return res.items;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
      return [] as Graph8List[];
    } finally {
      setLoading(false);
    }
  }, []);

  const openList = useCallback(async (list: Graph8List) => {
    const seq = ++requestSeq.current;
    setActiveId(list.id);
    setActiveTitle(list.title);
    setMembers([]);
    setMembersTotal(null);
    setMembersLoading(true);
    setError(null);
    try {
      const res = await fetchListContacts(list.id);
      if (seq !== requestSeq.current) return;
      setMembers(res.items);
      setMembersTotal(res.total);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setMembers([]);
      setMembersTotal(null);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      if (seq === requestSeq.current) setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().then((items) => {
      const firstWithMembers = items.find((l) => (l.total ?? 0) > 0) ?? items[0];
      if (firstWithMembers) void openList(firstWithMembers);
    });
  }, [load, openList]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const title = name.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      await createList(title);
      setName("");
      setShowForm(false);
      const items = await load();
      const created = items.find((l) => l.title === title) ?? items[0];
      if (created) await openList(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Lists"
        title="Outreach lists"
        description="Manage Graph8 lists, inspect members, then enrich or campaign."
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "New list"}
          </button>
        }
      />

      {showForm && (
        <WorkSurface className="mb-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => void onCreate(e)}
          >
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name"
            />
            <button
              type="submit"
              className="btn-primary shrink-0 disabled:opacity-60"
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        </WorkSurface>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkSurface className="!p-0 overflow-hidden">
          {loading ? (
            <p className="px-5 py-8 text-sm text-[var(--muted)]">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--muted)]">
              No lists yet. Create one or save contacts from Prospect.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-solid)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Members</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-white/80">
                {lists.map((list) => (
                  <tr
                    key={list.id}
                    className={`cursor-pointer ${
                      activeId === list.id
                        ? "bg-[var(--tint)]/60"
                        : "hover:bg-[var(--tint)]/40"
                    }`}
                    onClick={() => void openList(list)}
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--ink)]">
                      {list.title || `List #${list.id}`}
                      <div className="text-xs text-[var(--muted)]">
                        {formatDate(list.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">
                      {list.total ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-xs font-semibold text-[var(--accent)]">
                        {activeId === list.id ? "Open" : "View"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WorkSurface>

        <WorkSurface>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--ink)]">
                {activeTitle
                  ? activeTitle
                  : activeId
                    ? `List #${activeId}`
                    : "Members"}
              </h2>
              {activeId && (
                <p className="text-xs text-[var(--muted)]">
                  {membersLoading
                    ? "Loading members…"
                    : membersTotal != null
                      ? `Showing ${members.length} of ${membersTotal.toLocaleString()}`
                      : `${members.length} loaded`}
                </p>
              )}
            </div>
            {activeId && (
              <div className="flex shrink-0 gap-3">
                <Link
                  href="/enrich"
                  className="text-xs font-semibold text-[var(--accent)]"
                >
                  Enrich →
                </Link>
                <Link
                  href="/campaigns"
                  className="text-xs font-semibold text-[var(--accent)]"
                >
                  Campaign →
                </Link>
              </div>
            )}
          </div>

          {!activeId && (
            <p className="text-sm text-[var(--muted)]">
              Select a list to see its CRM contacts.
            </p>
          )}
          {membersLoading && (
            <p className="text-sm text-[var(--muted)]">Loading members…</p>
          )}
          {!membersLoading && activeId && members.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 px-4 py-6 text-sm text-[var(--muted)]">
              No contacts on this list yet. Go to Prospect, select decision-makers,
              and save them here.
            </p>
          )}
          <ul className="divide-y divide-[var(--line)]">
            {!membersLoading &&
              members.map((m, i) => (
                <li key={`${m.id ?? "x"}-${i}`} className="py-2.5 text-sm">
                  <p className="font-medium text-[var(--ink)]">
                    {contactName(m)}
                    {m.id != null && (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        #{m.id}
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--muted)]">{contactMeta(m)}</p>
                  {m.linkedin_url && (
                    <a
                      href={
                        m.linkedin_url.startsWith("http")
                          ? m.linkedin_url
                          : `https://${m.linkedin_url}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </WorkSurface>
      </div>
    </div>
  );
}
