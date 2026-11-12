// @vitest-environment node
/**
 * `style.ts` as the browser build ships it (#420): `vite.config.ts` lists it
 * in `styles({ modules })`, so the page draws the classes it was frozen to.
 * Every Style and the Slots it declares must draw what the run-time module
 * draws, or a page would hydrate onto other classes than the server wrote.
 */
import { createServer, defaultServerConditions } from 'vite'
import { Slots } from 'foldkit-mixins'
import { expect, test } from 'vitest'
// From source, by path, as `vite.config.ts` reads the plugin.
import { freeze } from '../../../../packages/mixins/src/viteFreeze.js'
import * as Runtime from '../src/client/style.js'

const FROZEN = 'virtual:frozen-style'

/** The module the plugin writes, loaded through Vite as the page's bundle loads it. */
const frozen = async (): Promise<Readonly<Record<string, unknown>>> => {
  const source = freeze('/src/client/style.ts', Runtime).source
  const vite = await createServer({
    root: import.meta.dirname,
    configFile: false,
    logLevel: 'silent',
    // `foldkit-mixins` from source: CI builds no `dist`.
    ssr: { resolve: { conditions: ['foldkit-plus:source', ...defaultServerConditions] } },
    plugins: [
      {
        name: 'frozen-style',
        resolveId: id => (id === FROZEN ? FROZEN : undefined),
        load: id => (id === FROZEN ? source : undefined),
      },
    ],
    server: { middlewareMode: true, ws: false },
  })
  try {
    return await vite.ssrLoadModule(FROZEN)
  } finally {
    await vite.close()
  }
}

interface Drawn {
  readonly mixin: { readonly contributions: Readonly<Record<string, unknown>> }
}

const drawn = (style: Drawn) =>
  Object.fromEntries(
    Object.entries(style.mixin.contributions).map(([slot, contribution]) => {
      const { classes, style: inline } = contribution as {
        readonly classes: ReadonlyArray<string>
        readonly style: Readonly<Record<string, string>>
      }
      return [slot, { classes: [...classes], style: { ...inline } }]
    }),
  )

test('every export of the frozen style.ts draws what the run-time one does', async () => {
  const shipped = await frozen()
  expect(Object.keys(shipped).sort()).toEqual(Object.keys(Runtime).sort())
  for (const [name, value] of Object.entries(Runtime)) {
    const other = shipped[name]
    if (typeof value === 'string') expect(other, name).toBe(value)
    else if ('mixin' in value) expect(drawn(other as Drawn), name).toEqual(drawn(value))
    else {
      const declared = other as typeof Runtime.Page
      expect(drawn(declared.style), name).toEqual(drawn(value.style))
      expect(Slots.describe(declared.slots), name).toEqual(Slots.describe(value.slots))
    }
  }
  // The page's own Slots: a fixture that drew nothing would compare equal.
  expect(Object.keys(drawn(Runtime.Page.style)).length).toBeGreaterThan(100)
})
