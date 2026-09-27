"use client";

import { useEffect, useState } from "react";
import { PageHeader, WorkSurface } from "@/components/PageChrome";
import { fetchActivity } from "@/lib/api";

type Item = { id: number; action: string; detail_json?: string; created_at?: string };

export default function ActivityPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchActivity()
      .then((res) => setItems(res.items))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load activity"),
      );
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="SQLite activity"
        title="Your workspace history"
        description="Per-user actions stored in ClinicReach SQLite (searches, lists, enrich, campaigns)."
      />
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <WorkSurface className="!p-0 overflow-hidden">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--muted)]">
            No activity yet. Search, save to a list, or run enrich to populate this.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map((item) => (
              <li key={item.id} className="px-5 py-3 text-sm">
                <p className="font-semibold text-[var(--ink)]">{item.action}</p>
                <p className="text-xs text-[var(--muted)]">
                  {item.created_at || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </WorkSurface>
    </div>
  );
}
