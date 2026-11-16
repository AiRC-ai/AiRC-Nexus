import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { previewKnowledgePulse } from '../../packages/interop/knowledgepulse.js';
import { previewRoCrate } from '../../packages/interop/ro-crate.js';

describe('interoperability boundaries', () => {
  it('keeps network SOPs private and refuses to turn scores into evidence', () => {
    const fixture = JSON.parse(readFileSync('fixtures/knowledgepulse-sop.json', 'utf8'));
    fixture.metadata.validated_by = ['claimed-validator'];
    const result = previewKnowledgePulse(fixture);
    expect(result.draft.intended_visibility).toBe('private');
    expect(result.unmapped).toContain('validated_by');
    expect(JSON.stringify(result.draft)).not.toContain('claimed-validator');
    expect(result.draft.content.demo).toBe(true);
  });
  it('maps research-object references without claiming execution or fetching URLs', () => {
    const fixture = JSON.parse(readFileSync('fixtures/knowledgepulse-sop.json', 'utf8'));
    const crate = previewRoCrate(previewKnowledgePulse(fixture).draft.content, 'demo-revision');
    expect(crate['@graph']).toHaveLength(3);
    expect(JSON.stringify(crate)).not.toContain('passed');
  });
});
