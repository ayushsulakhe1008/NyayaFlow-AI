export type Status = "found" | "pending" | "not_found" | "unverified";

export interface Obligation {
  id: string;
  text: string;
  deadline: string;
  sourceDoc: string;
  page: number | null;
  status: Status;
  evidence: string; // where the requirement was found in uploaded records, or why not
}

export interface TimelineItem { date: string; event: string; source: string }
export interface DocInfo { name: string; type: string; pages: number }

export interface Analysis {
  mode: "ai" | "demo";
  summary: string;
  documents: DocInfo[];
  timeline: TimelineItem[];
  obligations: Obligation[];
  missingInfo: string[];
}

export interface CaseRecord {
  id: string;
  title: string;
  caseNumber: string;
  nextHearing: string;
  createdAt: string;
  analysis?: Analysis;
}

export const STATUS_LABEL: Record<Status, string> = {
  found: "Found in records",
  pending: "Pending",
  not_found: "Not found in available records",
  unverified: "Needs verification",
};

export function readiness(obs: Obligation[]) {
  if (!obs.length) return { score: 0, level: "No data" };
  const pts = obs.reduce((s, o) => s + (o.status === "found" ? 1 : o.status === "unverified" ? 0.5 : 0), 0);
  const score = Math.round((pts / obs.length) * 100);
  return { score, level: score >= 80 ? "Ready" : score >= 50 ? "Partially ready" : "Not ready" };
}
