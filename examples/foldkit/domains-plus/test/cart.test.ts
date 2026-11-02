/**
 * Phase 5: the cart. Adding is idempotent, a name the demo marks taken has
 * no button, removing from the open cart and closing it move focus, and the
 * count is said in a polite live region.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import { Effect, Option, Stream } from 'effect'
import {
  Mount,
  all,
  expect as expectScene,
  expectAll,
  given,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { fromString } from 'foldkit/url'
import { Sheet, WindowList } from 'foldkit-mixins-ui'
import type { RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { describe, expect, test } from 'vitest'
import { Data, Message, actives, freshness, init, update, type Model } from '../src/client/app.js'
import { FocusCartButton, FocusCartCloseButton } from '../src/client/command.js'
import { SearchInput } from '../src/client/message.js'
import { view } from '../src/client/view.js'
import { readDomains } from '../src/server/remote.js'

const empty = init(Option.getOrThrow(fromString('https://domains.test/'))).model

const client: RemoteClient['Service'] = {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: readDomains(batch.requests.map(({ id }) => id)).map(({ id, values }) => ({
        entity: 'Domain',
        id,
        values,
      })),
    }),
  query: () => Effect.die('the page lists nothing'),
  mutate: () => Effect.die('the page writes nothing'),
  live: () => Stream.die('the page reads nothing live'),
}

/** `vercel`, searched and every price in view read. */
const priced = async (): Promise<Model> => {
  const trace = await Trace.run(Data, {
    start: empty,
    update,
    active: actives,
    options: { policy: freshness },
    client,
    steps: [
      Message.UpdatedSearch({ value: 'vercel' }),
      Message.GotSearchMessage({
        message: SearchInput.Message.Settled({ value: 'vercel', generation: 1 }),
      }),
      Respond.all,
    ],
  })
  return trace.entries.at(-1)?.model ?? trace.start
}

const placeResultsList = Mount.resolveAll(
  WindowList.resolveTrack(
    message => Message.GotResultsListMessage({ message }),
    WindowList.Message.Placed({ top: 0, height: 900 }),
  ),
)

const vercelApp = {
  _tag: 'Available',
  name: 'vercel.app',
  tld: 'app',
  price: 9.99,
  renewalPrice: 9.99,
  years: 1,
  isPremium: false,
} as const

describe('the cart', () => {
  test('adding a name twice keeps it once, and the live region says the count', async () => {
    const model = await priced()
    const once = update(model, Message.ClickedAddDomain({ name: vercelApp.name })).model
    expect(update(once, Message.ClickedAddDomain({ name: vercelApp.name })).model).toBe(once)
    // Foldkit's Scene cannot click inside this page (it finds an ancestor it
    // cannot read), so the click is the Message the button sends, drawn after.
    scene(
      { update, view },
      given(once),
      placeResultsList,
      expectScene(role('button', { name: 'Cart, 1 domains' })).toExist(),
      expectAll(all.role('button', { name: 'Remove vercel.app from cart' })).toHaveCount(2),
      expectScene(text('1 domain in your cart.')).toExist(),
    )
  })

  test('a name the demo marks taken has a note and no button', async () => {
    const model = await priced()
    scene(
      { update, view },
      given(model),
      placeResultsList,
      expectScene(role('button', { name: 'Add vercel.com to cart' })).not.toExist(),
      expectAll(all.role('button', { name: 'Add vercel.app to cart' })).toHaveCount(2),
    )
  })

  test('only a name read as available is added, at the price read', async () => {
    const model = await priced()
    // Taken in the demo's data, and never read: neither is added, whatever a form posts.
    expect(update(model, Message.ClickedAddDomain({ name: 'vercel.com' })).model).toBe(model)
    expect(update(model, Message.ClickedAddDomain({ name: 'vercel.nope' })).model).toBe(model)
    expect(update(empty, Message.ClickedAddDomain({ name: vercelApp.name })).model).toBe(empty)
    expect(update(model, Message.ClickedAddDomain({ name: vercelApp.name })).model.cart).toEqual([
      vercelApp,
    ])
  })

  test('removing from the open cart moves focus to its close button; closing it, to the Cart button', async () => {
    const added = update(await priced(), Message.ClickedAddDomain({ name: vercelApp.name })).model
    const removed = update(added, Message.ClickedRemoveCartDomain({ name: 'vercel.app' }))
    expect(removed.model.cart).toEqual([])
    expect(removed.commands?.map(command => command.name)).toEqual([FocusCartCloseButton().name])
    // The Dialog says it closed once its close has run: the Cart button takes focus back.
    const opened = update(added, Message.ClickedCart()).model
    expect(Sheet.isOpen(opened.cartSheet)).toBe(true)
    const requested = update(
      opened,
      Message.GotCartSheetMessage({
        message: Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() }),
      }),
    )
    const closed = update(
      requested.model,
      Message.GotCartSheetMessage({
        message: Sheet.Message.GotDialog({ message: UiDialog.Message.CompletedCloseDialog() }),
      }),
    )
    expect(Sheet.isOpen(closed.model.cartSheet)).toBe(false)
    // Only once the browser has closed it: Safari moves focus to the body as it closes.
    const named = (step: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
      (step.commands ?? []).map(command => command.name)
    expect(named(requested)).not.toContain(FocusCartButton().name)
    expect(named(closed)).toContain(FocusCartButton().name)
  })
})
