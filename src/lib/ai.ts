import { api } from "./api";
import type {
  ProofreadResult,
  AnalysisSummary,
  Classification,
  ValidationIssue,
  RelatedDocument,
} from "./types";

/** Run proofread on the document's current version → persisted analysis result. */
export function proofread(docId: string) {
  return api.post<ProofreadResult>(`/documents/${docId}/proofread`);
}

/** AI analysis history (metadata only). */
export function listAnalyses(docId: string, type?: string) {
  return api.get<AnalysisSummary[]>(
    `/documents/${docId}/analyses${type ? `?type=${type}` : ""}`,
  );
}

/** Full analysis result (with findings). */
export function getAnalysis(docId: string, analysisId: number) {
  return api.get<ProofreadResult>(`/documents/${docId}/analyses/${analysisId}`);
}

export function classify(docId: string) {
  return api.post<Classification>(`/documents/${docId}/classify`);
}

export function validate(docId: string) {
  return api.post<{ issues: ValidationIssue[] }>(`/documents/${docId}/validate`);
}

export function related(docId: string) {
  return api.post<RelatedDocument[]>(`/documents/${docId}/related`);
}

export type DiffResult = {
  added: number;
  removed: number;
  modified: number;
  semantic: number;
  explanation: string;
};

export function compare(baseVersionId: string, targetVersionId: string) {
  return api.post<DiffResult>("/documents/compare", { baseVersionId, targetVersionId });
}
