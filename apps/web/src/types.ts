import type { Content } from '../../../packages/contracts/index.js';
export interface Me {
  user: { id: string; name: string; kind: string; role: string; scopes: string[] };
  teams: { id: string; name: string }[];
}
export interface Assessment {
  id: string;
  method: string;
  outcome: string;
  note: string;
  affiliation: string;
  independence: string;
  environment: Record<string, string>;
  created_at: string;
}
export interface Knowledge {
  id: string;
  revision_id: string;
  digest: string;
  sequence: number;
  state: string;
  visibility: string;
  created_at: string;
  content: Content & { intended_visibility?: string };
  can_manage: boolean;
  can_review: boolean;
  assessments: Assessment[];
  assessment_counts: { outcome: string; count: number }[];
  assessments_truncated: boolean;
  revisions: { id: string; sequence: number; digest: string; created_at: string }[];
  screening: {
    state: string;
    attempts: number;
    result: { blocked: boolean; reasons: string[] } | null;
  } | null;
}
export interface Result extends Content {
  id: string;
  revision_id: string;
  compatibility: string;
  evidence: Assessment[];
}
export interface SearchResults {
  data: Result[];
  requires_detail: { id: string; revision_id: string }[];
  status: string;
  truncated: boolean;
  returned_bytes: number;
}
export interface Reply {
  id: string;
  digest: string;
  shared: boolean;
  mine: boolean;
  screening: { blocked: boolean; reasons: string[] };
  content?: { answer: string; limitations: string[]; sources: Content['sources'] };
  created_at: string;
}
export interface HelpRequest {
  id: string;
  question: string;
  environment: Record<string, string>;
  digest: string;
  state: string;
  mine: boolean;
  screening: { blocked: boolean; reasons: string[] };
  expires_at: string;
  created_at: string;
  replies: Reply[];
}
export interface HelpResults {
  requests: HelpRequest[];
}
export interface Activity {
  events: {
    id: string;
    action: string;
    record_id: string;
    revision_id: string;
    title: string | null;
    created_at: string;
  }[];
  outcomes: {
    id: string;
    record_id: string;
    revision_id: string;
    title: string | null;
    outcome: string;
    note: string;
    self_reported: boolean;
    created_at: string;
  }[];
  help: HelpRequest[];
}
