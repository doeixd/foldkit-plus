/// <reference types="@vitest/browser-playwright" />
/**
 * Reorder in a real browser and a running application: a list of rows, each
 * with a grip whose keys pick it up and move it, the pointer's drag over the
 * same rows, the moves applied by the parent with `Reorder.apply`, every
 * fact read out through `LiveAnnounce`, and `FocusRecovery`'s `same` step on
 * the grip. A second list routes keys on its container, `Keys.first` with
 * `ListNavigation`. Focus and keys are the browser's, so each claim is read
 * from it.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FocusRecovery, ListNavigation, LiveAnnounce, Reorder } from '../src/interaction/index.js'

const { Keys } = Behaviors

const Rows = Bundle.declare(Reorder.bundle, 'rows')
const Live = Bundle.declare(LiveAnnounce.bundle, 'live')
const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const

const Model = Schema.Struct({
  ...Rows.fields,
  ...Live.fields,
  ...Nav.fields,
  ids: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Rows.cases, ...Live.cases, ...Nav.cases })
type Message = typeof Message.Type

const label = (id: string) => id.toUpperCase()
const Parent = Bundle.parent({ Model, Message })
const LivePlaced = Parent.at(Live, { args: { debounceMs: 0, clearAfterMs: 60_000 } })
const assembly = Parent.assemble(
  LivePlaced,
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Rows, {
    onOut: (fact: Reorder.OutMessage) => (model: Model) => {
      const applied = Reorder.OutMessage.match(fact, {
        Moved: moved => modifyFields(model, { ids: ids => Reorder.apply(ids, moved) }),
        PickedUp: () => model,
        PassedOver: () => model,
        PutBack: () => model,
      })
      return LivePlaced.helpers.announce(Reorder.announcement(fact, { label }))(applied)
    },
  }),
)
const update = assembly.update(model => ({ model }))

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  row: Slot.make({ capability: Capability.Focusable, events: [Event.Blur, Event.Focus] }),
  grip: Slot.make({ capability: Capability.Focusable, events: [Event.Blur, Event.KeyDown] }),
})
const List = SlotView.over(ListSlots)<Model, Message>()

const rowsOf = (
  model: Model,
  slots: Parameters<Parameters<typeof List.define>[0]>[1],
  h: HtmlBuilder<Message>,
  withGrip: boolean,
) =>
  model.ids.map((id, index) =>
    h.li(
      slots.row.attrs([h.Key(id), h.Id(id), h.Style({ height: '30px' })], { index, id }),
      withGrip
        ? [
            h.button(slots.grip.attrs([h.Id(`grip-${id}`), h.Type('button')], { index, id }), [
              label(id),
            ]),
          ]
        : [label(id)],
    ),
  )

const gripped = List.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([h.Id('list'), h.Style({ margin: '0', padding: '0' })]),
    rowsOf(model, slots, h, true),
  ),
).pipe(
  Behavior.attach(
    Reorder.behavior(Rows)(List)({
      container: 'list',
      item: 'row',
      handle: 'grip',
      items: m => m.ids,
    }),
  ),
  Behavior.attach(FocusRecovery.behavior(List)({ owner: 'list', parts: { grip: ['same'] } })),
)

const routed = List.define((model, slots, h) =>
  h.ul(
    slots.list.attrs([h.Id('list'), h.Style({ margin: '0', padding: '0' })]),
    rowsOf(model, slots, h, false),
  ),
).pipe(
  Behavior.attach(
    Keys.behavior(List)({
      slot: 'list',
      routes: [
        Keys.first(
          Reorder.keys(Rows)<Model, Message>({
            items: m => m.ids,
            current: m => Option.fromNullishOr(m.nav.current),
          }),
          ListNavigation.keys(
            Nav,
            navArgs,
          )<Model, Message>({
            items: m => Behaviors.Collection.of(m.ids, { id: id => id }),
            text: (m, index) => m.ids[index] ?? '',
            typeahead: false,
          }),
        ),
      ],
    }),
  ),
  Behavior.attach(
    Reorder.behavior(Rows)(List)({
      container: 'list',
      item: 'row',
      handle: Reorder.routed,
      items: m => m.ids,
    }),
  ),
  Behavior.attach(
    Behavior.forSlots(ListSlots)<Model, Message>(
      {
        row: Behavior.slot({
          attributes: ({ input, h, item }) =>
            item?.id === undefined
              ? []
              : [
                  h.Tabindex(input.nav.current === item.id ? 0 : -1),
                  h.OnFocus(Nav.wrapper.make(ListNavigation.Message.Focused({ id: item.id }))),
                ],
        }),
      },
      { name: 'Roving' },
    ),
  ),
  Behavior.attach(FocusRecovery.behavior(List)({ owner: 'list', parts: { row: ['same'] } })),
)

let handle: { dispose: () => void } | undefined

const start = async (view: typeof gripped) => {
  const container = document.createElement('div')
  container.id = 'reorder-host'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => assembly.initial({ ids: ['a', 'b', 'c', 'd'] }),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [view(model, h), LiveAnnounce.view(model.live, h)]),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
  await expect.poll(() => document.getElementById('d')).not.toBeNull()
}

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const order = () => Array.from(document.querySelectorAll('#list > li')).map(row => row.id)
const said = () => document.querySelector('[data-foldkit-plus-live="polite"]')?.textContent?.trim()
const active = () => document.activeElement?.id

describe('Reorder by keys on a grip', () => {
  it('picks up, walks, drops, and keeps focus on the moved grip', async () => {
    await start(gripped)
    document.getElementById('grip-b')!.focus()
    await userEvent.keyboard(' ')
    await expect.poll(() => document.getElementById('b')?.dataset['reorder']).toBe('held')
    await expect.poll(said).toMatch(/^Picked up B\. Use the arrow keys/)
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(() => document.getElementById('d')?.dataset['reorderOver']).toBe('before')
    expect(document.getElementById('c')?.dataset['reorderOver']).toBeUndefined()
    await expect.poll(said).toBe('B: before D.')
    expect(active()).toBe('grip-b')
    await userEvent.keyboard(' ')
    await expect.poll(order).toEqual(['a', 'c', 'b', 'd'])
    await expect.poll(said).toBe('Dropped B before D.')
    expect(document.getElementById('b')?.dataset['reorder']).toBeUndefined()
    await expect.poll(active).toBe('grip-b')
    // Picked up again from where it now is: Up twice lands before A.
    await userEvent.keyboard('{Enter}{ArrowUp}{ArrowUp}{Enter}')
    await expect.poll(order).toEqual(['b', 'a', 'c', 'd'])
    await expect.poll(active).toBe('grip-b')
  })

  it('moves one place per key when keys come faster than a frame', async () => {
    await start(gripped)
    document.getElementById('grip-a')!.focus()
    const grip = document.getElementById('grip-a')!
    const press = (key: string) =>
      grip.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    press(' ')
    press('ArrowDown')
    press('ArrowDown')
    press(' ')
    await expect.poll(order).toEqual(['b', 'c', 'a', 'd'])
  })

  it('puts back on Escape and when focus leaves, moving nothing', async () => {
    await start(gripped)
    document.getElementById('grip-b')!.focus()
    await userEvent.keyboard(' {ArrowDown}{Escape}')
    await expect.poll(said).toBe('B put back where it was.')
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
    expect(document.querySelector('[data-reorder]')).toBeNull()
    await userEvent.keyboard(' {ArrowDown}')
    await expect.poll(() => document.querySelector('[data-reorder-over]')).not.toBeNull()
    await userEvent.tab()
    await expect.poll(() => document.querySelector('[data-reorder]')).toBeNull()
    expect(document.querySelector('[data-reorder-over]')).toBeNull()
    await expect.poll(said).toBe('B put back where it was.')
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('Reorder routed beside ListNavigation', () => {
  it('lets the arrows navigate until a row is held, then walks it and keeps focus on it', async () => {
    await start(routed)
    document.getElementById('a')!.focus()
    // The roving stop follows the focus a frame later; an arrow before it starts from no row.
    await expect.poll(() => document.getElementById('a')?.tabIndex).toBe(0)
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(active).toBe('b')
    await userEvent.keyboard(' ')
    await expect.poll(() => document.getElementById('b')?.dataset['reorder']).toBe('held')
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(() => document.getElementById('d')?.dataset['reorderOver']).toBe('before')
    expect(active()).toBe('b')
    await userEvent.keyboard('{End} ')
    await expect.poll(order).toEqual(['a', 'c', 'd', 'b'])
    await expect.poll(said).toBe('Dropped B after D.')
    await expect.poll(active).toBe('b')
  })
})

describe('Reorder by pointer', () => {
  const pointer = (type: string, x: number, y: number) =>
    (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      }),
    )
  const centre = (id: string, at = 0.5) => {
    const box = document.getElementById(id)!.getBoundingClientRect()
    return [box.left + box.width / 2, box.top + box.height * at] as const
  }

  it('drives the same draft: held, over a place, and moved by the parent with the same words', async () => {
    await start(gripped)
    const [x, y] = centre('a')
    pointer('pointerdown', x, y)
    const [, below] = centre('c', 0.9)
    pointer('pointermove', x, y + 10)
    pointer('pointermove', x, below)
    await expect.poll(() => document.getElementById('a')?.dataset['reorder']).toBe('held')
    await expect.poll(() => document.getElementById('c')?.dataset['reorderOver']).toBe('after')
    await expect.poll(said).toBe('A: after C.')
    pointer('pointerup', x, below)
    await expect.poll(order).toEqual(['b', 'c', 'a', 'd'])
    await expect.poll(said).toBe('Dropped A after C.')
  })

  it('puts back a drag cancelled with Escape', async () => {
    await start(gripped)
    const [x, y] = centre('a')
    pointer('pointerdown', x, y)
    pointer('pointermove', x, y + 40)
    await expect.poll(() => document.getElementById('a')?.dataset['reorder']).toBe('held')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect.poll(said).toBe('A put back where it was.')
    expect(order()).toEqual(['a', 'b', 'c', 'd'])
  })
})
