import { api } from "./api";
import type { DocumentVersion, VersionStatus, Section } from "./types";

export function listVersions(docId: string) {
  return api.get<DocumentVersion[]>(`/documents/${docId}/versions`);
}

export function getVersion(versionId: string) {
  return api.get<DocumentVersion>(`/versions/${versionId}`);
}

/** Parsed sections — powers the outline and the document viewer. */
export function getSections(versionId: number) {
  return api.get<Section[]>(`/versions/${versionId}/sections`);
}

/** Lightweight status for polling while a document is processed. */
export function getVersionStatus(versionId: number) {
  return api.get<VersionStatus>(`/versions/${versionId}/status`);
}

/**
 * Poll version status until READY/FAILED. Returns the terminal status.
 * Intended for the upload → processing UX; swap for SSE later.
 */
export async function pollUntilReady(
  versionId: number,
  { intervalMs = 2000, timeoutMs = 300_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await getVersionStatus(versionId);
    if (status === "READY" || status === "FAILED") return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("문서 처리 시간이 초과되었습니다.");
}
