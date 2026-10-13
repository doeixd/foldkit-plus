/**
 * `pnpm --filter foldkit-plus generate`: writes a file under `src/` for every
 * entry point `entries.ts` finds, deletes those for entry points gone, and
 * sets the manifest's exports and dependencies and the tsconfigs' references.
 * Run it after adding a package or an entry point, then `pnpm install` and
 * `pnpm paths`; `test/generated.test.ts` fails until it has run.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as prettier from 'prettier'

import { fileOf, generatedFields, included, references, setupOf, writtenFiles } from './entries.js'

const here = join(import.meta.dirname, '..')
const root = join(here, '../..')
const packages = included(root)
const entries = packages.flatMap(each => each.entries)

/** Written as the repository formats it, so `pnpm format:check` passes after a run. */
const write = async (path: string, text: string) =>
  writeFileSync(
    path,
    await prettier.format(text, { ...(await prettier.resolveConfig(path)), filepath: path }),
  )

for (const stale of writtenFiles(here).filter(
  file => !entries.some(entry => `${entry.subpath}.ts` === file),
))
  rmSync(join(here, 'src', stale))
for (const entry of entries) {
  const file = join(here, 'src', `${entry.subpath}.ts`)
  mkdirSync(dirname(file), { recursive: true })
  await write(file, fileOf(entry))
}

const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(here, name), 'utf8'))

const manifest = read('package.json')
const setup = setupOf(
  JSON.parse(readFileSync(join(here, 'node_modules/foldkit/package.json'), 'utf8')),
)
const devDependencies = manifest['devDependencies']
if (typeof devDependencies !== 'object' || devDependencies === null)
  throw new Error('packages/plus/package.json has no devDependencies')
await write(
  join(here, 'package.json'),
  JSON.stringify({
    ...manifest,
    setup,
    ...generatedFields(
      packages,
      Object.fromEntries(
        Object.entries(devDependencies).flatMap(([name, version]) =>
          typeof version === 'string' ? [[name, version] as const] : [],
        ),
      ),
    ),
  }),
)
// `pnpm paths` derives the tsconfigs' `paths` from these references afterwards.
// A build tsconfig does not inherit references, so both name them.
for (const name of ['tsconfig.json', 'tsconfig.build.json'])
  await write(join(here, name), JSON.stringify({ ...read(name), references: references(packages) }))

console.log(`foldkit-plus: ${entries.length} entry points from ${packages.length} packages`)
