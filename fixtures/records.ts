import type { Content } from '../packages/contracts/index.js';

export const IDS = {
  anonymous: '00000000-0000-4000-8000-000000000000',
  alice: '00000000-0000-4000-8000-000000000001',
  bob: '00000000-0000-4000-8000-000000000002',
  reviewer: '00000000-0000-4000-8000-000000000003',
  aliceAgent: '00000000-0000-4000-8000-000000000011',
  bobAgent: '00000000-0000-4000-8000-000000000012',
  team: '00000000-0000-4000-8000-000000000101',
};
export const recordId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const revisionId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const software = [
  [
    'Preserve zero values during validation',
    'Numeric zero is rejected by a truthiness check.',
    'Check value === null or value === undefined explicitly. Zero is a valid numeric value.',
    'zero validation',
  ],
  [
    'Reject numeric strings with trailing characters',
    'parseInt silently truncates a string such as 12px.',
    'Convert the complete trimmed input with Number and require Number.isFinite. Reject an empty input separately.',
    'numeric trailing characters',
  ],
  [
    'Sort numbers by numeric value',
    'The default array sort orders numeric elements as strings.',
    'Use values.toSorted((a, b) => a - b) for a non-mutating ascending numeric sort.',
    'sort numbers numeric',
  ],
  [
    'Await asynchronous array mapping',
    'Mapping an async callback returns an array of unresolved promises.',
    'Use await Promise.all(values.map(asyncCallback)) when concurrency is appropriate.',
    'asynchronous mapping promises',
  ],
  [
    'Compare object values deliberately',
    'Two different object references compare unequal even with matching fields.',
    'Compare the domain-relevant fields explicitly; do not use reference equality as structural equality.',
    'object references equality',
  ],
  [
    'Escape literal text in a regular expression',
    'User-supplied punctuation is interpreted as regex syntax.',
    'Use RegExp.escape on the literal string before constructing the expression.',
    'escape literal expression',
  ],
  [
    'Encode query parameters separately',
    'A plus sign or ampersand in a query value changes the URL meaning.',
    'Build URLSearchParams from individual unencoded keys and values, then serialize once.',
    'query parameters ampersand',
  ],
  [
    'Compare dates in a declared timezone',
    'A local midnight date shifts when serialized in UTC.',
    'Keep a calendar date as a date-only string, or make the intended timezone conversion explicit before comparing instants.',
    'dates declared timezone',
  ],
  [
    'Avoid binary floating-point currency accumulation',
    'Repeated decimal additions produce small binary rounding differences.',
    'For this fixture, represent currency as integer minor units and validate the supported range.',
    'currency decimal accumulation',
  ],
  [
    'Preserve integers beyond the safe-number range',
    'Large integer IDs lose precision when coerced to Number.',
    'Keep identifiers as strings or use BigInt for integer arithmetic with an explicit serialization rule.',
    'integers precision identifiers',
  ],
  [
    'Distinguish missing JSON fields from null',
    'JSON.stringify omits object properties whose value is undefined.',
    'Choose an explicit schema: omit absent fields intentionally or serialize a meaningful null value.',
    'missing JSON null',
  ],
  [
    'Validate JSON before using nested fields',
    'Valid JSON text does not establish the expected object shape.',
    'Validate the parsed value against the declared schema and handle rejected input before reading nested fields.',
    'JSON nested schema',
  ],
  [
    'Sort without mutating shared state',
    'Array.sort modifies a shared input array.',
    'Use toSorted or copy the array before sorting when callers require the original ordering.',
    'mutating shared ordering',
  ],
  [
    'Handle a missing request body explicitly',
    'An endpoint assumes every request contains a JSON object.',
    'Require the JSON content type and expected body shape; return a bounded validation error for absent input.',
    'missing request body',
  ],
  [
    'Default an optional array without hiding invalid types',
    'Code treats a missing array and an incorrectly typed object as equivalent.',
    'Default only an absent field; reject present values that fail the array schema.',
    'optional array invalid',
  ],
  [
    'Measure text budgets in encoded bytes',
    'String.length counts UTF-16 code units rather than UTF-8 payload bytes.',
    'Measure TextEncoder().encode(text).byteLength when enforcing a UTF-8 payload limit.',
    'UTF encoded bytes',
  ],
  [
    'Decode base64 as bytes before text',
    'A base64 helper assumes arbitrary bytes are valid Unicode text.',
    'Decode into a byte array and apply a declared text encoding only when the content is actually text.',
    'base64 bytes Unicode',
  ],
  [
    'Preserve quoted commas when reading CSV',
    'Splitting every line on commas breaks quoted CSV fields.',
    'Use a CSV parser supporting quoted fields and escaped quotes; validate row widths after parsing.',
    'quoted commas CSV',
  ],
  [
    'Reject comments in strict JSON input',
    'A configuration parser accepts JavaScript comments as though they were JSON.',
    'Use a strict JSON parser for a JSON contract, and report the unsupported comment syntax clearly.',
    'strict JSON comments',
  ],
  [
    'Handle an empty arithmetic mean',
    'Dividing an empty sum by zero produces NaN.',
    'Return an explicit empty-result state or reject an empty sample before dividing by its count.',
    'empty arithmetic mean',
  ],
  [
    'Guard a zero denominator',
    'A ratio silently produces Infinity or NaN for a zero denominator.',
    'Check the denominator and return an explicit undefined-ratio state for zero.',
    'zero denominator ratio',
  ],
  [
    'Return an asynchronous result through each layer',
    'A wrapper starts a promise but does not return or await it.',
    'Return the inner promise or await it before returning the outer operation result.',
    'asynchronous wrapper result',
  ],
  [
    'Sequence asynchronous loops deliberately',
    'forEach does not await its asynchronous callback.',
    'Use for...of with await for sequential work, or Promise.all with a bounded concurrency policy.',
    'forEach asynchronous loops',
  ],
  [
    'Check HTTP status before accepting a fetch result',
    'A fetch promise resolves even when the server returns an HTTP error status.',
    'Inspect response.ok or the expected status before parsing a success payload.',
    'HTTP status fetch',
  ],
  [
    'Distinguish a missing Map key from an undefined value',
    'Map.get alone cannot tell whether a key was stored with undefined.',
    'Use Map.has when key presence is the question, then read its value separately.',
    'Map key undefined',
  ],
  [
    'Parse boolean text explicitly',
    'Boolean of the nonempty string false evaluates to true.',
    'Accept explicitly enumerated true/false representations and reject unsupported input.',
    'boolean text false',
  ],
  [
    'Handle duplicate configuration keys with a declared policy',
    'A parser silently overwrites a repeated key.',
    'For this fixture, detect duplicate keys during parsing and reject the ambiguous configuration.',
    'duplicate configuration keys',
  ],
  [
    'Preserve deterministic ordering for equal scores',
    'Items with equal ranking scores can move between requests.',
    'Add a stable unique identifier as a final sort key after the relevance score.',
    'deterministic equal scores',
  ],
  [
    'Compare approximate numeric results with a tolerance',
    'Strict equality rejects a numerically acceptable floating-point result.',
    'Choose absolute and relative tolerances appropriate to the calculation and report them with the result.',
    'approximate numeric tolerance',
  ],
  [
    'Normalize a file extension before comparison',
    'An uppercase extension fails a lowercase allowlist comparison.',
    'Extract only the final extension and normalize case before checking the explicit allowlist.',
    'file extension uppercase',
  ],
];
const science = [
  [
    'Reproduce a population variance calculation',
    'Population variance differs from sample variance.',
    'For [1, 2, 3], the population mean is 2 and population variance is 2/3. State which denominator is used.',
    'population variance',
  ],
  [
    'Reproduce a sample variance calculation',
    'The sample estimator uses n-1 for this fixture.',
    'For [1, 2, 3], the sample variance is 1. Require at least two observations.',
    'sample variance',
  ],
  [
    'Reproduce a linear least-squares fit',
    'A line fit needs a declared objective and an intercept convention.',
    'For points (0,1), (1,3), (2,5), least squares with an intercept gives slope 2 and intercept 1.',
    'linear least squares',
  ],
  [
    'Reproduce a normalized histogram',
    'Raw bin counts are confused with probability mass.',
    'For bin counts [2, 3, 5], divide by total 10 to obtain masses [0.2, 0.3, 0.5].',
    'normalized histogram',
  ],
  [
    'Reproduce a vector dot product',
    'Coordinate order changes the dot product.',
    'For [1,2,3] and [4,5,6], aligned coordinate multiplication and summation gives 32.',
    'vector dot product',
  ],
  [
    'Reproduce a matrix transpose',
    'Rows and columns are interchanged incorrectly.',
    'Transpose [[1,2,3],[4,5,6]] to [[1,4],[2,5],[3,6]]. Record dimensions.',
    'matrix transpose',
  ],
  [
    'Reproduce min-max normalization',
    'A constant input range creates a zero divisor.',
    'For [2,4,6], min-max normalization gives [0,0.5,1]. Declare separate behavior for constant input.',
    'min max normalization',
  ],
  [
    'Reproduce a centered finite difference',
    'A numerical derivative depends on the chosen step.',
    'For f(x)=x*x at x=3 with h=0.01, (f(x+h)-f(x-h))/(2*h) approximates 6 within 1e-9.',
    'centered finite difference',
  ],
  [
    'Reproduce a trapezoidal integration',
    'A numerical integral depends on spacing and endpoint weights.',
    'For f(x)=x over [0,1] with equally spaced samples at 0,0.5,1, the trapezoidal result is 0.5.',
    'trapezoidal integration',
  ],
  [
    'Reproduce a Jaccard similarity',
    'Set similarity should not count repeated elements twice.',
    'For sets {1,2} and {2,3}, intersection size 1 divided by union size 3 gives 1/3.',
    'Jaccard similarity',
  ],
];
export const publicFixtures = [...software, ...science].map((entry, index) => {
  const [title, problem, resolution, query] = entry as [string, string, string, string];
  const content: Content = {
    title,
    problem,
    resolution,
    profile: index < 30 ? 'software_fix' : 'computational_method',
    environment:
      index < 30
        ? { runtime: 'node', version: '>=24.0.0 <25.0.0' }
        : { dataset: 'nexus-synthetic-v1' },
    limitations: [
      'Authored demo data; no real AiRC project fix or external scientific replication is claimed.',
      index < 30
        ? 'Apply only in the stated runtime and validate against the requesting project.'
        : 'This is a synthetic computation example, not a general scientific conclusion.',
    ],
    sources: [
      {
        title: 'AiRC Nexus authored prototype fixtures',
        url: 'https://github.com/AiRC-ai/AiRC-Nexus',
        license: 'Apache-2.0',
        attribution: 'AiRC Nexus contributors',
      },
    ],
    rights: { license: 'Apache-2.0', can_share: true, attribution: 'AiRC Nexus contributors' },
    demo: true,
  };
  return { id: recordId(index + 1), revision_id: revisionId(index + 1), content, query };
});
