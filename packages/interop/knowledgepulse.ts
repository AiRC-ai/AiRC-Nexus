import { z } from 'zod';
import { DraftSchema } from '../contracts/index.js';

// Deliberately bounded SOP preview, not a claim of general KnowledgePulse support.
const Sop = z
  .object({
    '@context': z.enum([
      'https://openknowledgepulse.org/schema/v1',
      'https://knowledgepulse.dev/schema/v1',
    ]),
    '@type': z.literal('ExpertSOP'),
    id: z.string().max(200),
    name: z.string().max(160),
    domain: z.string().max(100),
    decision_tree: z
      .array(
        z.object({ step: z.string().max(200), instruction: z.string().max(1_000) }).passthrough(),
      )
      .min(1)
      .max(10),
  })
  .passthrough();
export function previewKnowledgePulse(input: unknown) {
  const unit = Sop.parse(input);
  return {
    draft: DraftSchema.parse({
      intended_visibility: 'private',
      content: {
        title: unit.name,
        profile: 'software_fix',
        problem: `Imported SOP preview: ${unit.domain}`,
        resolution: unit.decision_tree.map((s) => `${s.step}: ${s.instruction}`).join('\n'),
        environment: {},
        demo: true,
        limitations: [
          'Authored interoperability fixture. Imported as an unverified private draft.',
          'Upstream scores and validator identities are not reproduced evidence. Source permissions need owner review.',
        ],
        sources: [
          {
            title: 'KnowledgePulse SOP fixture',
            url: 'https://openknowledgepulse.org/docs/architecture/protocol/',
            license: 'Apache-2.0 (Nexus-authored fixture only)',
            attribution: `AiRC Nexus contributors; source identifier ${unit.id}`,
          },
        ],
        rights: {
          license: 'Apache-2.0',
          can_share: true,
          attribution: 'AiRC Nexus contributors (authored fixture)',
        },
      },
    }),
    source_id: unit.id,
    unmapped: [
      'quality_score',
      'validated_by',
      'network visibility',
      'expert credentials',
      'dynamic decision criteria',
    ],
  };
}
