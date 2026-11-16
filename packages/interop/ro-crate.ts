import type { Content } from '../contracts/index.js';

/** A field-mapping preview; full RO-Crate/profile conformance is a separate gate. */
export function previewRoCrate(content: Content, revisionId: string) {
  return {
    '@context': 'https://w3id.org/ro/crate/1.3/context',
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        about: { '@id': './' },
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.3' },
      },
      {
        '@id': './',
        '@type': 'Dataset',
        name: content.title,
        description: content.problem,
        license: content.rights.license,
        hasPart: [{ '@id': `${revisionId}.json` }],
      },
      {
        '@id': `${revisionId}.json`,
        '@type': 'File',
        encodingFormat: 'application/json',
        name: content.title,
        description: content.resolution,
        isBasedOn: content.sources.map((s) => ({ '@id': s.url })),
      },
    ],
  };
}
