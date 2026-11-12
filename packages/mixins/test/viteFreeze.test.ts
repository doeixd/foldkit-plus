// @vitest-environment node
/**
 * Style modules listed in `styles({ modules })`: a production browser build
 * ships each as the classes it compiles to, refuses what cannot be written as
 * data, and drops the run-time injection; development keeps both (#420).
 */
import { fileURLToPath } from 'node:url'
import { build, createServer, defaultClientConditions, defaultServerConditions } from 'vite'
import type { Rollup } from 'vite'
import { Slots } from 'foldkit-mixins'
import { styles } from 'foldkit-mixins/vite'
import { describe, expect, it } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'
import { assertRules, freeze } from '../src/viteFreeze.js'
import type * as Entry from './fixtures/viteStyles/frozenEntry.js'
import * as Runtime from './fixtures/viteStyles/frozen.js'

const root = fileURLToPath(new URL('./fixtures/viteStyles/', import.meta.url))
const mixins = fileURLToPath(new URL('../src/index.ts', import.meta.url))

type Output = ReadonlyArray<Rollup.OutputChunk | Rollup.OutputAsset>

/** A production browser build of `entry`, its exports kept, with `modules` listed. */
const built = async (modules: ReadonlyArray<string>, entry = 'frozenEntry.ts'): Promise<Output> => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: { 'foldkit-mixins': mixins },
      // The other workspace packages from source: CI builds no `dist`.
      conditions: ['foldkit-plus:source', ...defaultClientConditions],
    },
    ssr: { resolve: { conditions: ['foldkit-plus:source', ...defaultServerConditions] } },
    // `pnpm mutate`'s edits reach the modules this build bundles, `SlotView` among them.
    plugins: [mutation(), styles({ sheet: '/sheet.ts', modules })],
    build: {
      write: false,
      rollupOptions: { input: `${root}${entry}`, preserveEntrySignatures: 'strict' },
    },
  })
  return [result].flat().flatMap(output => ('output' in output ? output.output : []))
}

const entryOf = (output: Output): string => {
  const chunk = output.find(file => file.type === 'chunk' && file.isEntry)
  if (chunk?.type !== 'chunk') throw new Error('the build wrote no entry chunk')
  return chunk.code
}

/** The entry chunk, run: it holds everything it imports, so Node loads it as it is. */
const loaded = (code: string): Promise<typeof Entry> =>
  import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

const cssOf = (output: Output): string => {
  const asset = output.find(file => file.type === 'asset' && file.fileName.endsWith('.css'))
  return asset?.type === 'asset' ? String(asset.source) : ''
}

/** What a Style's Slots draw: classes and inline declarations, as the resolver reads them. */
const drawn = (contributions: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(contributions).map(([slot, contribution]) => {
      const { classes, style } = contribution as {
        readonly classes: ReadonlyArray<string>
        readonly style: Readonly<Record<string, string>>
      }
      return [slot, { classes: [...classes], style: { ...style } }]
    }),
  )

// Each case runs a build or two, seconds apiece on a loaded machine.
describe('a module in `modules`', { timeout: 60_000 }, () => {
  it('ships as the classes its Styles compile to, without the compiler', async () => {
    const output = await built(['/frozen.ts'])
    const code = entryOf(output)
    expect(code).not.toContain('Style targets unknown slot')
    const frozen = await loaded(code)
    expect(drawn(frozen.Card.mixin.contributions)).toEqual(drawn(Runtime.Card.mixin.contributions))
    expect(drawn(frozen.Page.style.mixin.contributions)).toEqual(
      drawn(Runtime.Page.style.mixin.contributions),
    )
    expect(frozen.Card.name).toBe('Card')
    expect(frozen.Card.mixin.name).toBe(Runtime.Card.mixin.name)
    expect(Slots.describe(frozen.Page.slots)).toEqual(Slots.describe(Runtime.Page.slots))
    // A capability of the application's own is registered with its parents.
    expect(
      frozen.Capability.extendsCapability(frozen.Page.slots.form.capability, 'Focusable'),
    ).toBe(true)
    expect(frozen.NARROW).toBe(Runtime.NARROW)
    expect(frozen.tokens).toEqual(Runtime.tokens)
    // Every class it draws has its rule in the sheet the same build wrote.
    const css = cssOf(output)
    for (const name of Runtime.Card.rules.map(rule => rule.className))
      expect(css).toContain(`.${name}`)
  })

  it('says what a frozen Style no longer holds, rather than reading as empty', async () => {
    const code = entryOf(await built(['/frozen.ts']))
    const frozen = await loaded(code)
    expect(() => frozen.Card.rules).toThrow('Card.rules is not kept')
    expect(() => frozen.Page.style.pieces).toThrow('Page.style.pieces is not kept')
  })

  it.each([
    ['whenInput', '/whenInput.ts', 'export "Toggle" styles slot "root" with Style.whenInput'],
    ['perItem', '/perItem.ts', 'export "Rows" styles slot "row" with Style.perItem'],
    ['a function', '/notData.ts', 'export "gap" is not a Style'],
  ])('fails the build when it holds %s, naming the module and the export', async (_, id, says) => {
    const failure = await built([id], 'entry.ts').then(
      () => 'built',
      (error: unknown) => String(error),
    )
    expect(failure).toContain(`"${id}" is in \`modules\``)
    expect(failure).toContain(says)
  })

  it('fails the build when it does not resolve', async () => {
    await expect(built(['/missing.ts'], 'entry.ts')).rejects.toThrow(
      'the style module "/missing.ts" in `modules` does not resolve',
    )
  })

  it('takes the run-time injection out of the build, which keeps it otherwise', async () => {
    // The entry draws through `SlotView`, which injects what a Slot draws at run time.
    expect(entryOf(await built([]))).toContain('data-foldkit-styles')
    expect(entryOf(await built(['/frozen.ts']))).not.toContain('data-foldkit-styles')
  })

  it('fails the build when a module left off the list compiles Styles in the page', async () => {
    // The listed module turns the run-time injection off, so the unlisted Style's class would be unstyled.
    const failure = await built(['/frozen.ts'], 'mixedEntry.ts').then(
      () => 'built',
      (error: unknown) => String(error),
    )
    expect(failure).toContain('compiles Styles in the browser build')
    expect(failure).toContain('unlisted.ts')
    // The same page with nothing listed keeps its injection and builds.
    await expect(built([], 'mixedEntry.ts')).resolves.toBeDefined()
  })

  it('stays as written in development, where Slots inject what they draw', async () => {
    const vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      // `slotView.ts` imports `foldkit-surface`: its source, since CI builds no `dist`.
      resolve: {
        alias: { 'foldkit-mixins': mixins },
        conditions: ['foldkit-plus:source', ...defaultClientConditions],
      },
      plugins: [styles({ sheet: '/sheet.ts', modules: ['/frozen.ts'] })],
      server: { middlewareMode: true, ws: false },
    })
    try {
      const transformed = await vite.transformRequest('/frozen.ts')
      expect(transformed?.code).toContain('Style.forSlots')
      expect(transformed?.code).not.toContain('Mixin.dynamic')
      const slotView = await vite.transformRequest(
        fileURLToPath(new URL('../src/slotView.ts', import.meta.url)),
      )
      expect(slotView?.code).toContain('typeof __FOLDKIT_MIXINS_FROZEN_STYLES__')
    } finally {
      await vite.close()
    }
  })
})

describe('the rule check', () => {
  const frozen = freeze('/frozen.ts', Runtime)
  const css = Runtime.Card.css + Runtime.Page.style.css

  it('passes when the sheet holds every class the module draws', () => {
    expect(() => assertRules(new Map([['/frozen.ts', frozen]]), css)).not.toThrow()
  })

  it('fails the build, naming the class, when the sheet lacks one', () => {
    const missing = Runtime.Card.rules[0]
    if (missing === undefined) throw new Error('the fixture compiles no rule')
    expect(() =>
      assertRules(new Map([['/frozen.ts', frozen]]), css.replace(missing.css, '')),
    ).toThrow(`"/frozen.ts" draws "${missing.className}", which the stylesheet has no rule for`)
  })
})
