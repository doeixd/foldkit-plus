/**
 * The cart's and the phone's sheets load their views on intent (#423): a
 * press, hover or focus on what opens one asks for them, and a press that
 * comes first opens the sheet once they are in.
 */
import { Effect, Option } from 'effect'
import { expect as expectScene, given, role, scene } from 'foldkit/scene'
import { fromString } from 'foldkit/url'
import { Resource } from 'foldkit-bundle'
import { Sheet } from 'foldkit-mixins-ui'
import { describe, expect, test } from 'vitest'
import { Message, init, update } from '../src/client/app.js'
import { LoadSheets, Sheets, viewsOf } from '../src/client/sheets.js'
import { view } from '../src/client/view.js'

const empty = init(Option.getOrThrow(fromString('https://domains.test/'))).model
const commandNames = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

describe('the sheets load on intent', () => {
  test.each([
    ['the cart', Message.ClickedCart(), 'Cart'],
    ['the TLD sheet', Message.ClickedTldFilter(), 'Tld'],
    ['the filters sheet', Message.ClickedFilters(), 'Filters'],
  ] as const)(
    'a press on %s before the views are in loads them and opens nothing',
    (_, press, which) => {
      const pressed = update(empty, press)
      expect(pressed.model).toBe(empty)
      expect(commandNames(pressed)).toEqual([LoadSheets({ opens: Option.some(which) }).name])
      expect(Sheet.isOpen(pressed.model.cartSheet)).toBe(false)

      const loaded = update(pressed.model, Message.LoadedSheets({ opens: Option.some(which) }))
      expect(loaded.model.sheetsLoaded).toBe(true)
      const opened = {
        Cart: loaded.model.cartSheet,
        Tld: loaded.model.tldSheet,
        Filters: loaded.model.filtersSheet,
      }[which]
      expect(Sheet.isOpen(opened)).toBe(true)
    },
  )

  test('hover or focus asks once for the views, and a loaded page asks for nothing', () => {
    const wanted = update(empty, Message.WantedSheets())
    expect(wanted.model).toBe(empty)
    expect(commandNames(wanted)).toEqual(['LoadSheets'])
    const loaded = update(wanted.model, Message.LoadedSheets({ opens: Option.none() })).model
    expect(loaded.sheetsLoaded).toBe(true)
    expect(Sheet.isOpen(loaded.cartSheet)).toBe(false)
    const again = update(loaded, Message.WantedSheets())
    expect(again.model).toBe(loaded)
    expect(commandNames(again)).toEqual([])
  })

  test('a failed load changes nothing, and the next press asks again', () => {
    const failed = update(empty, Message.FailedToLoadSheets())
    expect(failed.model).toBe(empty)
    expect(commandNames(update(failed.model, Message.ClickedCart()))).toEqual(['LoadSheets'])
  })

  test('the command brings the views in from the chunk and says so', async () => {
    expect(Option.isNone(viewsOf())).toBe(true)
    const message = await Effect.runPromise(
      LoadSheets({ opens: Option.some('Cart') }).effect.pipe(
        Effect.provide(
          Resource.lazy(Sheets, () =>
            import('../src/client/sheetViews.js').then(chunk => chunk.layer),
          ),
        ),
      ),
    )
    expect(message).toEqual(Message.LoadedSheets({ opens: Option.some('Cart') }))
    expect(Option.isSome(viewsOf())).toBe(true)
  })

  // The loaded sheet draws Mounts a Scene cannot resolve; `e2e/sheets.e2e.ts` opens it.
  test('before the views are in, the page draws the Cart button and no sheet', () => {
    scene(
      { update, view },
      given(empty),
      expectScene(role('button', { name: 'Cart, 0 domains' })).toExist(),
      expectScene(role('button', { name: 'Close cart panel' })).not.toExist(),
    )
  })
})
