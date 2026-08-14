import { api, ApiError, BASE_URL, getAccessToken } from "./api";
import type { Document, DocumentUploadResponse } from "./types";

export function listDocuments(
  projectId: string,
  filters?: { folder_id?: number; status?: string; type?: string },
) {
  const params = new URLSearchParams();
  if (filters?.folder_id != null) params.set("folder_id", String(filters.folder_id));
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  const q = params.toString();
  return api.get<Document[]>(`/projects/${projectId}/documents${q ? `?${q}` : ""}`);
}

/** Multipart upload → 202 Accepted; processing continues in the background. */
export function uploadDocument(
  projectId: string,
  file: File,
  opts?: { folder_id?: number; name?: string; description?: string },
) {
  const form = new FormData();
  form.append("file", file);
  if (opts?.folder_id != null) form.append("folder_id", String(opts.folder_id));
  if (opts?.name) form.append("name", opts.name);
  if (opts?.description) form.append("description", opts.description);
  return api.post<DocumentUploadResponse>(`/projects/${projectId}/documents`, form, {
    form: true,
  });
}

export function getDocument(docId: string) {
  return api.get<Document>(`/documents/${docId}`);
}

export function deleteDocument(docId: string) {
  return api.delete<void>(`/documents/${docId}`);
}

/**
 * Download the original file. The endpoint needs a Bearer header, so a plain
 * <a href> would 401 — fetch as a blob with auth, then trigger a save.
 */
export async function downloadDocument(docId: string, filename?: string) {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}/documents/${docId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, "다운로드에 실패했습니다.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
