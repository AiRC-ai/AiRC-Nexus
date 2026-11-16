import semver from 'semver';

export function compatibility(required: Record<string, string>, supplied: Record<string, string>) {
  let unknown = false;
  for (const [key, expected] of Object.entries(required)) {
    const actual = supplied[key];
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
  requires_detail: { id: string; revision_id: string }[];
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
      const ref = { id: String(candidate.id), revision_id: String(candidate.revision_id) };
      const detailTrial = { ...result, requires_detail: [...result.requires_detail, ref] };
      measure(detailTrial);
      if (byteSize(detailTrial) <= budget - 96) result.requires_detail.push(ref);
    }
  }
  if (!result.data.length && result.requires_detail.length) result.status = 'requires_detail';
  if (!result.data.length && incomplete) result.status = 'refine_query';
  measure(result);
  return result;
}
