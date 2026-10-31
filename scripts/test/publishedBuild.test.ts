// @vitest-environment node
/**
 * A page pays for a published package what it pays for the package's source
 * (#215). Each package is built with its own `tsdown.config.ts`, and a page
 * reading one export is bundled twice: against that build, and against the
 * source. Linked into one file, a build kept far more than the source did:
 * `sideEffects: false` drops whole files, and a linked package is one file,
 * while its `export * as` namespaces became objects whose getters keep every
 * member (#241).
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { buildPublished, packages, pageModules, scratchIn } from './pageBuild.js'

const made: Array<string> = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** The bytes a page keeps from files under `dir`, importing `entry` as `pkg`. */
const keptFrom = async (
  root: string,
  page: string,
  entry: string,
  dir: string,
): Promise<number> => {
  const prefix = dir.replaceAll('\\', '/')
  return (await pageModules(root, page, [{ find: 'pkg', replacement: entry }]))
    .filter(({ id }) => id.startsWith(prefix))
    .reduce((sum, { length }) => sum + length, 0)
}

/**
 * Each package a page loads, with a page that reads a small part of it. The
 * published build writes the same code a little differently (about 30 bytes
 * a page), so it may keep 5% more than the source; linked, every one kept
 * more (the mutation spec relinks each). A page under about 600 bytes is
 * within those 30 bytes of failing, so each reads more.
 */
const cases: ReadonlyArray<readonly [name: string, page: string]> = [
  ['mixins', `import { Behaviors } from 'pkg'\nexport const used = Behaviors.Disclosure`],
  ['bundle', `import { Resource } from 'pkg'\nexport const used = Resource.lazy`],
  ['media', `import { Icon } from 'pkg'\nexport const used = Icon.draw`],
  ['entity', `import { Collation } from 'pkg'\nexport const used = Collation.binary`],
  ['primitives', `import { Motion } from 'pkg'\nexport const used = Motion.reduced`],
  ['crud', `import { Sort } from 'pkg'\nexport const used = Sort`],
  ['form', `import { Input } from 'pkg'\nexport const used = Input`],
  ['ssr', `import { metaMarkup } from 'pkg'\nexport const used = metaMarkup`],
  ['remote', `import { refreshIsInFlight } from 'pkg'\nexport const used = refreshIsInFlight`],
  ['surface', `import { MessageSet } from 'pkg'\nexport const used = MessageSet`],
  ['builder', `import { editWords } from 'pkg'\nexport const used = editWords`],
  ['composition', `import { Operation } from 'pkg'\nexport const used = Operation`],
  ['data-grid', `import { GridProjection } from 'pkg'\nexport const used = GridProjection`],
  ['durable', `import { EffectFailedError } from 'pkg'\nexport const used = EffectFailedError`],
  ['mixins-builder', `import { BuilderSlots } from 'pkg'\nexport const used = BuilderSlots`],
  ['mixins-crud', `import { DetailView } from 'pkg'\nexport const used = DetailView`],
  ['mixins-data-grid', `import { GridLegend } from 'pkg'\nexport const used = GridLegend`],
  ['mixins-richtext', `import { blockStyleMenu } from 'pkg'\nexport const used = blockStyleMenu`],
  ['mixins-surface', `import { SurfaceView } from 'pkg'\nexport const used = SurfaceView`],
  ['react', `import { FoldkitComponent } from 'pkg'\nexport const used = FoldkitComponent`],
  ['remote-drizzle', `import { compileCall } from 'pkg'\nexport const used = compileCall`],
  ['richtext', `import { decodeDocument } from 'pkg'\nexport const used = decodeDocument`],
  ['richtext-markdown', `import { parse } from 'pkg'\nexport const used = parse`],
  ['sync', `import { indexedDb } from 'pkg'\nexport const used = indexedDb`],
]

test.each(cases)(
  'a page keeps no more of the published %s than of its source',
  async (name, page) => {
    const packageDir = join(packages, name)
    const root = scratchIn(name, 'published-')
    made.push(root)
    const imported = await buildPublished(name, root)
    const source = await keptFrom(
      root,
      page,
      join(packageDir, 'src', 'index.ts'),
      join(packageDir, 'src'),
    )
    const published = await keptFrom(root, page, imported, join(root, 'dist'))
    expect(source).toBeGreaterThan(0)
    expect(published).toBeLessThanOrEqual(source * 1.05)
  },
  120_000,
)
