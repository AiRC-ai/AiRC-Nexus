import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const EnvironmentSchema = z
  .record(text(64), text(128))
  .refine((v) => Object.keys(v).length <= 16)
  .describe(
    'Environment key/value map. For Node use {"runtime":"node","version":"24.22.3"}; keep the version separate. Authored computational demo methods use {"dataset":"nexus-synthetic-v1"}. Unknown applicability is not a compatibility guarantee.',
  );
export const VisibilitySchema = z.enum(['private', 'team', 'public']);
export const ProfileSchema = z.enum(['software_fix', 'computational_method']);
export const ContentSchema = z
  .object({
    title: text(160),
    profile: ProfileSchema,
    problem: text(8_000),
    resolution: text(12_000),
    environment: EnvironmentSchema.default({}),
    limitations: z.array(text(1_000)).min(1).max(12),
    sources: z
      .array(
        z
          .object({
            title: text(200),
            url: z
              .url()
              .max(2_048)
              .refine((u) => new URL(u).protocol === 'https:'),
            license: text(100),
            attribution: text(200),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    rights: z
      .object({ license: text(100), can_share: z.literal(true), attribution: text(200) })
      .strict(),
    demo: z.literal(true).default(true),
  })
  .strict();
export const DraftSchema = z
  .object({
    content: ContentSchema,
    intended_visibility: VisibilitySchema.default('private'),
    team_id: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.intended_visibility !== 'team' || !!v.team_id, {
    message: 'Team required for team visibility',
  });
export const SearchSchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(2_048)
      .default('')
      .refine((v) => new TextEncoder().encode(v).byteLength <= 2_048),
    environment: EnvironmentSchema.default({}),
    profile: ProfileSchema.optional(),
    limit: z.coerce.number().int().min(1).max(10).default(5),
    budget_bytes: z.coerce.number().int().min(512).max(32_000).default(12_000),
    include_unknown: z.boolean().default(false),
    show_disputed: z.boolean().default(false),
  })
  .strict();
export const EvidenceOutcomeSchema = z.enum(['not_run', 'passed', 'failed', 'inconclusive']);
export const OutcomeSchema = z
  .object({
    record_id: z.uuid(),
    revision_id: z.uuid(),
    outcome: EvidenceOutcomeSchema,
    environment: EnvironmentSchema.default({}),
    note: text(4_000),
    method: z.literal('contributor_test').default('contributor_test'),
  })
  .strict();
export const ReviewSchema = z
  .object({
    record_id: z.uuid(),
    revision_id: z.uuid(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(['approved', 'rejected']),
    note: text(1_000),
  })
  .strict();
export const PublishSchema = z
  .object({
    record_id: z.uuid(),
    revision_id: z.uuid(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    visibility: VisibilitySchema,
    confirmed: z.literal(true),
  })
  .strict();
export const AssessmentSchema = z
  .object({
    record_id: z.uuid(),
    revision_id: z.uuid(),
    method: z.enum([
      'source_review',
      'contributor_test',
      'artifact_review',
      'independent_reproduction',
    ]),
    outcome: EvidenceOutcomeSchema,
    note: text(2_000),
    environment: EnvironmentSchema.default({}),
    affiliation: text(200),
    independence: z.enum(['not_claimed', 'declared_external_owner']).default('not_claimed'),
  })
  .strict();
export const HelpRequestSchema = z
  .object({ question: text(4_000), environment: EnvironmentSchema.default({}) })
  .strict();
export const HelpReplySchema = z
  .object({
    request_id: z.uuid(),
    answer: text(8_000),
    limitations: z.array(text(500)).min(1).max(8),
    sources: ContentSchema.shape.sources,
    equations: z.array(text(800)).max(3).optional(),
  })
  .strict();
export type Content = z.infer<typeof ContentSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type Search = z.infer<typeof SearchSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;
export interface Principal {
  id: string;
  owner_id: string;
  name: string;
  kind: 'human' | 'agent' | 'anonymous';
  role: 'owner' | 'reviewer' | 'reader';
  scopes: string[];
}
export const ANONYMOUS: Principal = {
  id: '00000000-0000-4000-8000-000000000000',
  owner_id: '00000000-0000-4000-8000-000000000000',
  name: 'Public reader',
  kind: 'anonymous',
  role: 'reader',
  scopes: ['read'],
};
