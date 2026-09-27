"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  PageHeader,
  WorkSurface,
} from "@/components/PageChrome";
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

export default function ListsPage() {
  const [lists, setLists] = useState<Graph8List[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [members, setMembers] = useState<ContactItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLists();
      setLists(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  async function openList(id: number) {
    setActiveId(id);
    setMembersLoading(true);
    setError(null);
    try {
      const res = await fetchListContacts(id);
      setMembers(res.items);
    } catch (err) {
      setMembers([]);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setMembersLoading(false);
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
            <p className="px-5 py-8 text-sm text-[var(--muted)]">No lists yet.</p>
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
                    className={
                      activeId === list.id
                        ? "bg-[var(--tint)]/60"
                        : "hover:bg-[var(--tint)]/40"
                    }
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--ink)]">
                      {list.title}
                      <div className="text-xs text-[var(--muted)]">
                        {formatDate(list.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">
                      {list.total ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--accent)]"
                        onClick={() => void openList(list.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WorkSurface>

        <WorkSurface>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              {activeId ? `List #${activeId} members` : "Members"}
            </h2>
            {activeId && (
              <Link
                href="/enrich"
                className="text-xs font-semibold text-[var(--accent)]"
              >
                Enrich this list →
              </Link>
            )}
          </div>
          {!activeId && (
            <p className="text-sm text-[var(--muted)]">
              Open a list to see CRM contacts on it.
            </p>
          )}
          {membersLoading && (
            <p className="text-sm text-[var(--muted)]">Loading members…</p>
          )}
          {!membersLoading && activeId && members.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No CRM contacts on this list yet. Add people from Prospect.
            </p>
          )}
          <ul className="divide-y divide-[var(--line)]">
            {members.map((m, i) => (
              <li key={`${m.id}-${i}`} className="py-2.5 text-sm">
                <p className="font-medium text-[var(--ink)]">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") ||
                    "Contact"}
                  {m.id != null && (
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      #{m.id}
                    </span>
                  )}
                </p>
                <p className="text-[var(--muted)]">
                  {[m.job_title, m.company_name, m.work_email]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </li>
            ))}
          </ul>
        </WorkSurface>
      </div>
    </div>
  );
}
