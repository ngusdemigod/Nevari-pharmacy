import { normalizeBaseUrl } from "./swrKeys";

export function adminRequestHeaders(session, hasBody = false) {
  const headers = {
    Accept: "application/json",
    "X-Nevari-Frontend-Type": session?.frontendType || "storefront",
    "X-Nevari-Frontend-Origin": session?.frontendOrigin || ""
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  return headers;
}

export function withSessionParams(key, session) {
  const url = new URL(key, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (session?.baseUrl && !url.searchParams.has("baseUrl")) {
    url.searchParams.set("baseUrl", normalizeBaseUrl(session.baseUrl));
  }
  return url.toString();
}

export function extractApiErrorMessage(payload, fallback = "Request failed.") {
  return payload?.error?.message || payload?.message || fallback;
}

export async function swrJsonFetcher(key, { session } = {}) {
  const response = await fetch(withSessionParams(key, session), {
    headers: adminRequestHeaders(session)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && payload.success === false)) {
    const error = new Error(extractApiErrorMessage(payload, response.statusText));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function swrMutationFetcher(key, { arg } = {}) {
  const { session, method = "POST", body } = arg || {};
  const response = await fetch(withSessionParams(key, session), {
    method,
    headers: adminRequestHeaders(session, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && payload.success === false)) {
    const error = new Error(extractApiErrorMessage(payload, response.statusText));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function listData(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

export function updateListPayload(payload, updater) {
  if (!payload) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return updater(payload);
  }
  if (Array.isArray(payload.data)) {
    return {
      ...payload,
      data: updater(payload.data)
    };
  }
  return payload;
}

export function upsertById(list, item) {
  if (!item?.id) {
    return list;
  }
  const exists = list.some((row) => String(row.id) === String(item.id));
  return exists
    ? list.map((row) => (String(row.id) === String(item.id) ? { ...row, ...item } : row))
    : [item, ...list];
}

export function replaceById(list, item) {
  if (!item?.id) {
    return list;
  }
  return list.map((row) => (String(row.id) === String(item.id) ? { ...row, ...item } : row));
}

export function removeById(list, id) {
  return list.filter((row) => String(row.id) !== String(id));
}

export function snapshotMatchingCache(cache, predicate) {
  const snapshots = [];
  for (const key of cache.keys()) {
    if (predicate(key)) {
      snapshots.push([key, cache.get(key)]);
    }
  }
  return snapshots;
}

export async function restoreSnapshots(mutate, snapshots) {
  await Promise.all(
    snapshots.map(([key, value]) => mutate(key, value, { revalidate: false }))
  );
}

