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
 * within those 30 bytes of failing, so each reads more, or is allowed them
 * (`Math.max` below): `remote-domain` exports one small Schema, whose 30 bytes
 * are a quarter of it.
 */
const cases: ReadonlyArray<readonly [name: string, page: string]> = [
  ['mixins', `import { Behaviors } from 'pkg'\nexport const used = Behaviors.Disclosure`],
  ['metadata', `import { Metadata } from 'pkg'\nexport const used = Metadata.combine`],
  ['metakit', `import { Transition } from 'pkg'\nexport const used = Transition.run`],
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
  ['remote-domain', `import { Receipt } from 'pkg'\nexport const used = Receipt`],
  ['remote-drizzle', `import { compileCall } from 'pkg'\nexport const used = compileCall`],
  ['richtext', `import { decodeDocument } from 'pkg'\nexport const used = decodeDocument`],
  ['richtext-markdown', `import { parse } from 'pkg'\nexport const used = parse`],
  ['sync', `import { indexedDb } from 'pkg'\nexport const used = indexedDb`],
]

const keepsNoMore = async (name: string, page: string) => {
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
  expect(published).toBeLessThanOrEqual(Math.max(source * 1.05, source + 30))
}

test.each(cases)(
  'a page keeps no more of the published %s than of its source',
  keepsNoMore,
  120_000,
)

/**
 * `foldkit-mixins-ui`'s two namespaces of one file per member (#589): a page
 * reading one recipe or one Bundle keeps that member's files, built as from
 * source. It holds only while `tsdown.config.ts` writes one output per source
 * file with relative imports external; linked, `export * as` is an object of
 * getters and either page keeps every member.
 */
test.each([
  ['Recipes.Avatar', `import { Recipes } from 'pkg'\nexport const used = Recipes.Avatar`],
  ['Bundles.TagsInput', `import { Bundles } from 'pkg'\nexport const used = Bundles.TagsInput`],
] as const)(
  'a page reading %s keeps no more of the published mixins-ui than of its source',
  (_, page) => keepsNoMore('mixins-ui', page),
  240_000,
)

test('a page reading one Bundle keeps no other Bundle and no recipe, built or source', async () => {
  const root = scratchIn('mixins-ui', 'published-')
  made.push(root)
  const page = `import { Bundles } from 'pkg'\nexport const used = Bundles.TagsInput`
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('mixins-ui', root))
  const source = await kept(join(packages, 'mixins-ui', 'src', 'index.ts'))
  expect(built.some(id => /\/dist\/bundles\/tagsInput\.js$/.test(id))).toBe(true)
  expect(source.some(id => /\/src\/bundles\/tagsInput\.ts$/.test(id))).toBe(true)
  expect(
    [...built, ...source].filter(id =>
      /\/(bundles\/combobox|recipes\/[a-zA-Z]+)\.(js|ts)$/.test(id),
    ),
  ).toEqual([])
}, 240_000)

/**
 * The Calendar's adapter re-exports its state and its options-level view,
 * each a file of its own (#589). A page that draws a calendar itself, through
 * `toView`, keeps neither, so not the module-level Schema over upstream's
 * Model that the state holds, nor the `configure` merge; the DatePicker's
 * adapter is held to the same. `pnpm mutate` cannot
 * edit what tsdown reads from the disk, so it was broken by hand: a
 * `console.log(Model)` at the top level of `src/calendar.ts` turned it red.
 */
test('a page drawing a calendar or a date picker through its adapter keeps no state or view of either, built or source', async () => {
  const root = scratchIn('mixins-ui', 'published-')
  made.push(root)
  const published = await buildPublished('mixins-ui', root)
  // One build serves both pages: a second would be another copy of the package on disk.
  for (const [name, leaf] of [
    ['Calendar', 'calendar/selection'],
    ['DatePicker', 'datePickerView'],
  ] as const) {
    const page = [`import { ${name} } from 'pkg'`, `export const used = ${name}.toView`].join('\n')
    const kept = async (entry: string) =>
      (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
    const built = await kept(published)
    const source = await kept(join(packages, 'mixins-ui', 'src', 'index.ts'))
    expect(built.some(id => id.endsWith(`/dist/${leaf}.js`))).toBe(true)
    expect(source.some(id => id.endsWith(`/src/${leaf}.ts`))).toBe(true)
    expect(
      [...built, ...source].filter(id =>
        /\/((calendar|datePicker)\/(state|view)|bundles\/[a-zA-Z]+|configure)\.(js|ts)$/.test(id),
      ),
    ).toEqual([])
  }
}, 240_000)

/**
 * The Combobox's `fluid` and `overlayBars` mixins, and its options-level
 * view, are files of their own re-exported by the adapter (#589). Each was a
 * module-level value in `combobox.ts`, which kept `FluidHover`, `Measure` and
 * `ScrollBars` in every page drawing a combobox. Broken by hand as the
 * Calendar's was: a `console.log(fluid)` in `src/combobox.ts` turned it red.
 */
test('a page drawing a combobox through its adapter keeps no fluid, overlayBars or view module, built or source', async () => {
  const root = scratchIn('mixins-ui', 'published-')
  made.push(root)
  const page = `import { Combobox } from 'pkg'\nexport const used = Combobox.toView`
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('mixins-ui', root))
  const source = await kept(join(packages, 'mixins-ui', 'src', 'index.ts'))
  expect(built.some(id => /\/dist\/combobox\/slots\.js$/.test(id))).toBe(true)
  expect(source.some(id => /\/src\/combobox\/slots\.ts$/.test(id))).toBe(true)
  expect(
    [...built, ...source].filter(id =>
      /\/(combobox\/(fluid|overlayBars|view|filters)|configure)\.(js|ts)$/.test(id),
    ),
  ).toEqual([])
}, 240_000)

/**
 * The Listbox's `fluid` and `overlayBars` mixins and its options-level view
 * are files of their own re-exported by the adapter (#589), as the Combobox's
 * are: each was a module-level value in `listbox.ts`, which kept
 * `FluidHover`, `Measure` and `ScrollBars` in every page drawing a listbox.
 * Broken by hand: a `console.log(fluid)` in `src/listbox.ts` turned it red.
 */
test('a page drawing a listbox through its adapter keeps no fluid, overlayBars or view module, built or source', async () => {
  const root = scratchIn('mixins-ui', 'published-')
  made.push(root)
  const page = `import { Listbox } from 'pkg'\nexport const used = Listbox.toView`
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('mixins-ui', root))
  const source = await kept(join(packages, 'mixins-ui', 'src', 'index.ts'))
  expect(built.some(id => /\/dist\/listbox\/slots\.js$/.test(id))).toBe(true)
  expect(source.some(id => /\/src\/listbox\/slots\.ts$/.test(id))).toBe(true)
  expect(
    [...built, ...source].filter(id =>
      /\/(listbox\/(fluid|overlayBars|view)|configure)\.(js|ts)$/.test(id),
    ),
  ).toEqual([])
}, 240_000)

/**
 * The size check above catches Evidence linked into the entry; this one, a
 * module of the source that keeps Evidence (an import run for its effect),
 * which both builds would keep alike. `pnpm mutate` cannot edit what tsdown
 * and this build read from the disk, so it was broken by hand: an
 * `Evidence.issuedBy` call at the top of `src/index.ts` turned it red.
 */
test('a page reading only Metadata keeps no Evidence module, built or source', async () => {
  const root = scratchIn('metadata', 'published-')
  made.push(root)
  const page = cases.find(([name]) => name === 'metadata')![1]
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('metadata', root))
  const source = await kept(join(packages, 'metadata', 'src', 'index.ts'))
  expect(built.some(id => id.endsWith('/dist/index.js'))).toBe(true)
  expect(source.some(id => id.endsWith('/metadata/src/index.ts'))).toBe(true)
  expect([...built, ...source].filter(id => /\/evidence\.(js|ts)$/.test(id))).toEqual([])
}, 120_000)

test('a page reading only Expr.eval and Num.lte from metakit keeps no sql, prove, conformance, z3, or zone modules', async () => {
  const root = scratchIn('metakit', 'published-')
  made.push(root)
  const page = `import { Expr, Num, Path } from 'pkg'\nexport const used = (row: { balance: number }) => Expr.eval(Num.lte(Path.field('balance'), 100), row)`
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('metakit', root))
  const source = await kept(join(packages, 'metakit', 'src', 'index.ts'))
  expect(built.some(id => /\/dist\/ops\/ord\.js$/.test(id))).toBe(true)
  expect(source.some(id => /\/src\/ops\/ord\.ts$/.test(id))).toBe(true)
  const forbidden =
    /\/(sql|drizzle|prove|conformance|domain|aggregates|machine|inspect|graph|abstract\/(zone|interval|check)|ops\/(num|null|eq))\.(js|ts)$|z3-solver|drizzle-orm/
  expect([...built, ...source].filter(id => forbidden.test(id))).toEqual([])
}, 120_000)
