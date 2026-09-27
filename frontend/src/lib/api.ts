import { getStoredToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    if (data.detail != null) return JSON.stringify(data.detail);
  } catch {
    /* not JSON */
  }
  return text || `Request failed: ${res.status}`;
}

function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (json) headers["Content-Type"] = "application/json";
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(true),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

export type CompanyItem = {
  id?: number | null;
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  employee_count?: string | null;
};

export type ContactItem = {
  id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  work_email?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
  confidence_score?: number | null;
  job_department?: string | null;
};

export type Graph8List = {
  id: number;
  title: string;
  type?: string | null;
  total?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CampaignItem = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  slug?: string | null;
  category?: string | null;
};

export type InboxThread = {
  id?: string | null;
  reply_id?: string | null;
  preview?: string | null;
  status?: string | null;
  channel?: string | null;
  contact?: { name?: string | null } | null;
  tags?: Array<{ name?: string } | string> | null;
  updated_at?: string | null;
};

function unwrapList<T>(data: Record<string, unknown>, key: string): T[] {
  const result = data.result as Record<string, unknown> | undefined;
  const fromResult = result?.[key];
  if (Array.isArray(fromResult)) return fromResult as T[];
  const top = data[key];
  if (Array.isArray(top)) return top as T[];
  return [];
}

function unwrapTotal(data: Record<string, unknown>): number | null {
  const result = data.result as Record<string, unknown> | undefined;
  const t = result?.total;
  return typeof t === "number" ? t : null;
}

export async function searchClinics(
  q: string,
  opts?: { city?: string; industry?: string; state?: string; limit?: number },
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (opts?.city) params.set("city", opts.city);
  if (opts?.industry) params.set("industry", opts.industry);
  if (opts?.state) params.set("state", opts.state);
  params.set("limit", String(opts?.limit ?? 20));
  const data = await apiGet<Record<string, unknown>>(
    `/api/clinics/search?${params.toString()}`,
  );
  return {
    items: unwrapList<CompanyItem>(data, "companies"),
    total: unwrapTotal(data),
  };
}

export async function searchContacts(q: string, limit = 20) {
  const data = await apiGet<Record<string, unknown>>(
    `/api/contacts/search?q=${encodeURIComponent(q)}&limit=${limit}&field=job_title`,
  );
  return {
    items: unwrapList<ContactItem>(data, "contacts"),
    total: unwrapTotal(data),
  };
}

export async function fetchLists() {
  const data = await apiGet<Record<string, unknown>>("/api/lists");
  return {
    items: unwrapList<Graph8List>(data, "lists"),
    total: unwrapTotal(data),
  };
}

export async function createList(name: string) {
  return apiPost("/api/lists", { name, type: "contacts" });
}

export async function fetchListContacts(listId: number, limit = 50) {
  const data = await apiGet<Record<string, unknown>>(
    `/api/lists/${listId}/contacts?limit=${limit}`,
  );
  return {
    items: unwrapList<ContactItem>(data, "contacts"),
    total: unwrapTotal(data),
  };
}

export async function addContactsToList(
  listId: number,
  rows: Array<Record<string, string>>,
  dryRun = false,
) {
  return apiPost(`/api/lists/${listId}/members`, { rows, dry_run: dryRun });
}

export async function enrichContacts(body: {
  list_id: number;
  contact_ids: number[];
  dry_run: boolean;
  mode?: string;
  target_field?: string | null;
}) {
  return apiPost("/api/enrich", body);
}

export async function getEnrichmentJob(jobId: string) {
  return apiGet(`/api/enrich/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchCampaigns() {
  const data = await apiGet<Record<string, unknown>>("/api/campaigns");
  return {
    items: unwrapList<CampaignItem>(data, "campaigns"),
    total: unwrapTotal(data),
  };
}

export async function createCampaign(body: {
  name: string;
  audience_list_id?: string;
  brief?: string;
}) {
  return apiPost("/api/campaigns", body);
}

export async function launchCampaign(
  campaignId: string,
  dryRun = true,
  confirm = false,
) {
  return apiPost(`/api/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    dry_run: dryRun,
    confirm,
  });
}

export async function fetchInbox() {
  const data = await apiGet<Record<string, unknown>>("/api/inbox");
  const result = (data.result as Record<string, unknown> | undefined) ?? data;
  const keys = ["threads", "items", "replies", "inbox"];
  for (const key of keys) {
    const val = result[key];
    if (Array.isArray(val)) {
      return { items: val as InboxThread[], total: unwrapTotal(data) };
    }
  }
  if (Array.isArray(data.result)) {
    return { items: data.result as InboxThread[], total: null };
  }
  return { items: [] as InboxThread[], total: unwrapTotal(data), raw: data };
}

export async function draftReply(replyId: string) {
  return apiPost(`/api/inbox/${encodeURIComponent(replyId)}/draft`);
}

export async function sendReply(
  replyId: string,
  body: string,
  channel = "email",
) {
  return apiPost(`/api/inbox/${encodeURIComponent(replyId)}/send`, {
    body,
    channel,
    confirm: true,
  });
}

export async function fetchActivity() {
  return apiGet<{ items: Array<{ id: number; action: string; created_at?: string }> }>(
    "/api/auth/activity",
  );
}

export { API_URL };
