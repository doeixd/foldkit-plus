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
import { dirname, join } from 'node:path'
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

/**
 * Form, Guard and Sync read metakit through a subpath of their own
 * (`foldkit-form/metakit`, `foldkit-guard/check`, `foldkit-sync/metakit`), so
 * a page using the main entry keeps none of it, built or source. Broken by
 * hand: a module-level `console.log(fieldSpecs)` in form's `src/index.ts`
 * turned it red (a bare re-export of `Declared` there does not: the page drops
 * it unread), as did putting `check` back on `Guards` or an `Expr.eval` back
 * in sync's `make.ts`.
 */
test.each([
  ['form', `import { Form } from 'pkg'\nexport const used = Form.make`, 'index.js'],
  ['guard', `import { Guards } from 'pkg'\nexport const used = Guards.attach`, 'index.mjs'],
  ['sync', `import { Sync } from 'pkg'\nexport const used = Sync.forApplication`, 'index.js'],
] as const)(
  'a page reading the main entry of foldkit-%s keeps no metakit module, built or source',
  async (name, page, index) => {
    const root = scratchIn(name, 'published-')
    made.push(root)
    const kept = async (entry: string) =>
      (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
    const built = await kept(await buildPublished(name, root))
    const source = await kept(join(packages, name, 'src', 'index.ts'))
    expect(built.some(id => id.endsWith(`/dist/${index}`))).toBe(true)
    expect(source.some(id => id.endsWith(`/${name}/src/index.ts`))).toBe(true)
    expect(
      [...built, ...source].filter(id => /\/metakit\/(src|dist)\/|\/metakit\.(js|ts)$/.test(id)),
    ).toEqual([])
  },
  120_000,
)

/**
 * The date and amount renderers and the declared attrs live in
 * `foldkit-mixins-form/declared`: a page that draws a form with the main entry
 * keeps none of that module, built or source.
 */
test('a page drawing a form keeps none of foldkit-mixins-form/declared, built or source', async () => {
  const root = scratchIn('mixins-form', 'published-')
  made.push(root)
  const page = `import { FormView } from 'pkg'\nexport const used = FormView.define`
  const kept = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const built = await kept(await buildPublished('mixins-form', root))
  const source = await kept(join(packages, 'mixins-form', 'src', 'index.ts'))
  expect(built.some(id => /\/dist\/index\.m?js$/.test(id))).toBe(true)
  expect(source.some(id => id.endsWith('/mixins-form/src/index.ts'))).toBe(true)
  expect([...built, ...source].filter(id => /\/declared\.(m?js|ts)$/.test(id))).toEqual([])
}, 240_000)

/**
 * Declared writes are read through `foldkit-surface/writes`, so a page with a
 * Surface and no declared writes keeps no metakit and no lazy slot; and the
 * development check is a file of its own, which a page that reaches it only
 * in a branch the build folds away drops, built or source. The last page
 * reaches the check outright and keeps it, so the one before can fail.
 */
test('a page keeps no metakit for a Surface without declared writes, and no write check outside development', async () => {
  const root = scratchIn('surface', 'published-')
  made.push(root)
  const index = await buildPublished('surface', root)
  const entries = {
    index: [index, join(packages, 'surface', 'src', 'index.ts')],
    writes: [join(dirname(index), 'writes.js'), join(packages, 'surface', 'src', 'writes.ts')],
  } as const
  // One build at a time: each writes the page it bundles into `root`.
  const kept = async (entry: keyof typeof entries, page: string) => {
    const [built, source] = entries[entry]
    const ids = async (file: string) =>
      (await pageModules(root, page, [{ find: 'pkg', replacement: file }])).map(({ id }) => id)
    return [await ids(built), await ids(source)]
  }
  const holds = (ids: ReadonlyArray<string>, file: RegExp) => ids.some(id => file.test(id))
  const metakit = /\/metakit\/(src|dist)\//
  const writes = /\/writes\.(js|ts)$/
  const check = /\/writesCheck\.(js|ts)$/

  for (const ids of await kept(
    'index',
    `import { Surface } from 'pkg'\nexport const used = Surface.rootView`,
  )) {
    expect(holds(ids, /\/(dist\/index\.js|src\/index\.ts)$/)).toBe(true)
    expect(ids.filter(id => metakit.test(id) || writes.test(id) || check.test(id))).toEqual([])
  }
  for (const ids of await kept(
    'writes',
    // What a production build makes of `import.meta.env.DEV ? … : …`; this build runs as a test's.
    `import { Writes, WritesCheck } from 'pkg'\nexport const used = false ? WritesCheck.verify : Writes.of`,
  )) {
    expect(holds(ids, writes)).toBe(true)
    expect(ids.filter(id => check.test(id))).toEqual([])
  }
  for (const ids of await kept(
    'writes',
    `import { WritesCheck } from 'pkg'\nexport const used = WritesCheck.verify`,
  )) {
    expect(holds(ids, check)).toBe(true)
  }
}, 240_000)

/**
 * Remote's kept aggregates read metakit's types only, from an entry of their
 * own: a page reading Remote keeps neither that entry nor metakit, and one
 * reading `foldkit-remote/aggregate` keeps no metakit. Broken by hand: a
 * value import of `metakit/aggregates` read at the top of `src/aggregate.ts`
 * turned the second row red, and an import of `aggregated` read at the top of
 * `src/remote.ts` the first.
 */
test.each([
  ['index', `import { Remote } from 'pkg'\nexport const used = Remote.make`, 'remote'],
  ['aggregate', `import { aggregated } from 'pkg'\nexport const used = aggregated`, 'aggregate'],
] as const)(
  'a page reading foldkit-remote/%s keeps no metakit module, built or source',
  async (file, page, kept) => {
    const root = scratchIn('remote', 'published-')
    made.push(root)
    const modules = async (entry: string) =>
      (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
    const index = await buildPublished('remote', root)
    const built = await modules(join(dirname(index), `${file}.js`))
    const source = await modules(join(packages, 'remote', 'src', `${file}.ts`))
    expect(built.some(id => id.endsWith(`/dist/${kept}.js`))).toBe(true)
    expect(source.some(id => id.endsWith(`/remote/src/${kept}.ts`))).toBe(true)
    const forbidden =
      file === 'index'
        ? /\/metakit\/(src|dist)\/|\/(dist|remote\/src)\/aggregate\.(js|ts)$/
        : /\/metakit\/(src|dist)\//
    expect([...built, ...source].filter(id => forbidden.test(id))).toEqual([])
  },
  120_000,
)

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
    /\/(sql|sqlLowering|drizzle|prove|conformance|domain|aggregates|aggregatesSql|machine|inspect|graph|policy|store|temporal|abstract\/(zone|interval|check)|ops\/(num|null|eq|str|arr))\.(js|ts)$|z3-solver|drizzle-orm/
  expect([...built, ...source].filter(id => forbidden.test(id))).toEqual([])
}, 120_000)

/**
 * The subpaths of metakit a page may import carry no SQL lowering, no Drizzle
 * and no solver, built or source. Broken by hand: `import './sqlLowering.js'`
 * with a module-level read of `sqlOps` in `src/aggregates.ts` turned the
 * `aggregates` row red.
 */
test.each([
  [
    'domain',
    'domain',
    `import { Money } from 'pkg'\nexport const used = Money.add`,
    'domain/money',
  ],
  ['machine', 'machine', `import { make } from 'pkg'\nexport const used = make`, 'machine'],
  [
    'inspect',
    'inspect',
    `import { fieldSpecs } from 'pkg'\nexport const used = fieldSpecs`,
    'inspect',
  ],
  ['aggregates', 'aggregates', `import { sum } from 'pkg'\nexport const used = sum`, 'aggregates'],
  [
    'graph/match',
    'graph/match',
    `import { affectedTags } from 'pkg'\nexport const used = affectedTags`,
    'graph/match',
  ],
])(
  'a page reading metakit/%s keeps no SQL lowering, Drizzle or solver module',
  async (_, file, page, kept) => {
    const root = scratchIn('metakit', 'published-')
    made.push(root)
    const modules = async (entry: string) =>
      (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
    const index = await buildPublished('metakit', root)
    const built = await modules(join(dirname(index), `${file}.js`))
    const source = await modules(join(packages, 'metakit', 'src', `${file}.ts`))
    expect(built.some(id => id.endsWith(`/dist/${kept}.js`))).toBe(true)
    expect(source.some(id => id.endsWith(`/src/${kept}.ts`))).toBe(true)
    const server =
      /\/(sql|sqlLowering|aggregatesSql|drizzle|prove|graph|conformance)\.(js|ts)$|z3-solver|drizzle-orm/
    expect([...built, ...source].filter(id => server.test(id))).toEqual([])
  },
  120_000,
)

/**
 * `foldkit-remote-server` checks a writer's store on every server, so
 * `metakit/store` is that one module: no expression, transition or walk code.
 * Broken by hand: a read of `rulesOf` from `./expr.js` inside `mount` turned
 * it red, built and source.
 */
test('a server reading metakit/store keeps no other metakit module, built or source', async () => {
  const root = scratchIn('metakit', 'published-')
  made.push(root)
  const page = `import { mount } from 'pkg'\nexport const used = mount`
  const modules = async (entry: string) =>
    (await pageModules(root, page, [{ find: 'pkg', replacement: entry }])).map(({ id }) => id)
  const index = await buildPublished('metakit', root)
  const built = await modules(join(dirname(index), 'store.js'))
  const source = await modules(join(packages, 'metakit', 'src', 'store.ts'))
  const metakit = (ids: ReadonlyArray<string>) =>
    ids.filter(id => /\/(src|dist)\//.test(id) && !id.includes('node_modules'))
  expect(metakit(built).map(id => id.slice(id.lastIndexOf('/') + 1))).toEqual(['store.js'])
  expect(metakit(source).map(id => id.slice(id.lastIndexOf('/') + 1))).toEqual(['store.ts'])
}, 120_000)
