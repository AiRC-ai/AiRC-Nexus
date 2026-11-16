import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = await readFile('package-lock.json', 'utf8');
const lock = JSON.parse(raw);
const packages = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, value]) => ({
    name: value.name ?? path.split('node_modules/').at(-1),
    version: value.version,
    license: value.license ?? 'UNDECLARED',
    development: value.dev === true,
    optional: value.optional === true,
    location: path,
  }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
await mkdir('docs/validation', { recursive: true });
await writeFile(
  'docs/validation/dependencies.json',
  JSON.stringify(
    {
      package_lock_sha256: createHash('sha256').update(raw).digest('hex'),
      scope:
        'Declared licenses in the pinned npm lockfile, including development and optional platform packages; not a legal compatibility determination.',
      project_license: 'Apache-2.0',
      packages,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Recorded ${packages.length} lockfile package declarations without credentials or machine paths.`,
);
