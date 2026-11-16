import semver from 'semver';

export function compatibility(required: Record<string, string>, supplied: Record<string, string>) {
  const normalized = { ...supplied };
  const node = supplied.runtime?.match(/^node(?:\.js)?(?:\s+v?(\d+\.\d+\.\d+))?$/i);
  if (node) {
    normalized.runtime = 'node';
    if (!normalized.version && node[1]) normalized.version = node[1];
  }
  let unknown = false;
  for (const [key, expected] of Object.entries(required)) {
    const actual = normalized[key];
    if (!actual) {
      unknown = true;
      continue;
    }
    if (key === 'version') {
      if (!semver.valid(actual) || !semver.validRange(expected)) {
        unknown = true;
        continue;
      }
      if (!semver.satisfies(actual, expected)) return 'incompatible';
    } else if (actual.toLowerCase() !== expected.toLowerCase()) return 'incompatible';
  }
  return unknown ? 'unknown' : 'applicable';
}
export function byteSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
export interface PackedContext {
  data: Record<string, unknown>[];
  requires_detail: { id: string; revision_id: string; origin_node?: string }[];
  truncated: boolean;
  status: string;
  demo: true;
  returned_bytes: number;
}
function measure(value: PackedContext) {
  for (let i = 0; i < 5; i++) {
    const bytes = byteSize(value);
    if (bytes === value.returned_bytes) break;
    value.returned_bytes = bytes;
  }
}
export function packContext(
  candidates: Record<string, unknown>[],
  budget: number,
  incomplete = false,
  priorDetails: PackedContext['requires_detail'] = [],
): PackedContext {
  const result: PackedContext = {
    data: [],
    requires_detail: [],
    truncated: incomplete,
    status: 'no_match',
    demo: true,
    returned_bytes: 0,
  };
  for (const candidate of candidates) {
    const trial = { ...result, data: [...result.data, candidate], status: 'matches' };
    measure(trial);
    if (byteSize(trial) <= budget - 96) {
      result.data.push(candidate);
      result.status = 'matches';
    } else {
      result.truncated = true;
      const ref = {
        id: String(candidate.id),
        revision_id: String(candidate.revision_id),
        ...(candidate.origin_node ? { origin_node: String(candidate.origin_node) } : {}),
      };
      const detailTrial = { ...result, requires_detail: [...result.requires_detail, ref] };
      measure(detailTrial);
      if (byteSize(detailTrial) <= budget - 96) result.requires_detail.push(ref);
    }
  }
  for (const ref of priorDetails) {
    if (
      result.data.some((r) => r.id === ref.id && r.origin_node === ref.origin_node) ||
      result.requires_detail.some((r) => r.id === ref.id && r.origin_node === ref.origin_node)
    )
      continue;
    const trial = { ...result, requires_detail: [...result.requires_detail, ref] };
    measure(trial);
    if (byteSize(trial) <= budget - 96) result.requires_detail.push(ref);
    result.truncated = true;
  }
  if (!result.data.length && result.requires_detail.length) result.status = 'requires_detail';
  if (!result.data.length && incomplete) result.status = 'refine_query';
  measure(result);
  return result;
}
