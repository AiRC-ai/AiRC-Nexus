import { ContentSchema } from '../contracts/index.js';

export function screen(content: unknown) {
  const reasons: string[] = [];
  const envelope =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : { invalid_content: content };
  const { intended_visibility: intended, ...fields } = envelope;
  const valid = ContentSchema.safeParse(fields);
  if (!valid.success) reasons.push('invalid_schema');
  const raw = JSON.stringify(content);
  if (Buffer.byteLength(raw) > 65_536) reasons.push('oversized_content');
  reasons.push(...screenText(raw));
  return {
    policy_version: 'screen-v1',
    blocked: reasons.length > 0,
    reasons,
    limitations: ['Pattern screening is fallible. Human review remains required.'],
  };
}
export function screenText(raw: string) {
  const reasons: string[] = [];
  if (
    /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
      raw,
    )
  )
    reasons.push('possible_credential');
  if (
    /ignore (?:all |previous |system )*instructions|reveal (?:your |the )?(?:secrets|system prompt)|exfiltrat|override (?:the )?(?:policy|permissions)/i.test(
      raw,
    )
  )
    reasons.push('instruction_injection');
  if (/<script\b|javascript\s*:|\\u0000|[\u202a-\u202e\u2066-\u2069]/i.test(raw))
    reasons.push('unsafe_content');
  return reasons;
}
