/// <reference types="@vitest/browser-playwright" />
/**
 * `Presence` with interaction and recovery in a real browser and a running
 * application: one `Presence` per row (`Bundle.each`), drawn by
 * `Presence.behavior` and watched by `FocusRecovery`. Focus, hit testing and
 * Tab are the browser's, so each claim is read from it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle, Link } from 'foldkit-bundle'
import { Capability, Slot, SlotView, Slots, Behavior } from 'foldkit-mixins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FocusRecovery, Presence } from '../src/interaction/index.js'
import { PresenceMessage } from '../src/motion/index.js'

const DURATION = 400

const Model = Schema.Struct({
  left: Schema.Record(Schema.String, Presence.bundle.Model),
  right: Schema.Record(Schema.String, Presence.bundle.Model),
  pressed: Schema.Number,
})
type Model = typeof Model.Type
const GotLeft = Link.keyedWrapper('GotLeft', PresenceMessage)
const GotRight = Link.keyedWrapper('GotRight', PresenceMessage)
const Message = defineMessageUnion({
  Pressed: {},
  ...GotLeft.cases,
  ...GotRight.cases,
})
type Message = typeof Message.Type

const gone =
  (field: 'left' | 'right') => (message: PresenceMessage, key: string) => (model: Model) =>
    message._tag === 'Hidden' && model[field][key]?.phase === 'hidden'
      ? {
          model: {
            ...model,
            [field]: Object.fromEntries(Object.entries(model[field]).filter(([id]) => id !== key)),
          },
        }
      : { model }

const Left = Presence.bundle.each(Link.collection<Model>()('left', GotLeft), {
  args: { durationMs: DURATION },
  onMessage: gone('left'),
})
const Right = Presence.bundle.each(Link.collection<Model>()('right', GotRight), {
  args: { durationMs: DURATION },
  onMessage: gone('right'),
})
const placements = Bundle.assemble<Model, Message>()([Left, Right])
const shown = { phase: 'shown', generation: 0 } as const

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const Lists = SlotView.over(ListSlots)<Model, Message>()
const phaseOf =
  (field: 'left' | 'right') => (model: Model, item: { readonly id?: string } | undefined) =>
    model[field][item?.id ?? '']?.phase ?? 'hidden'
const Leaves = {
  left: Presence.behavior(Lists)({ content: 'row', phase: phaseOf('left') }),
  right: Presence.behavior(Lists)({ content: 'row', phase: phaseOf('right') }),
}
const Recovers = FocusRecovery.behavior(Lists)({
  owner: 'list',
  parts: { row: ['next', 'previous', 'owner'] },
})
const draw = (field: 'left' | 'right') =>
  Lists.define((model, slots, h) =>
    h.ul(
      slots.list.attrs([h.Id(`${field}-list`), h.Tabindex(-1)]),
      Object.keys(model[field]).map((id, index) =>
        h.li(slots.row.attrs([h.Key(id), h.Id(`${field}-${id}`), h.Tabindex(-1)], { index, id }), [
          h.button(
            [h.Id(`${field}-hide-${id}`), h.OnClick(wrap(field, id, PresenceMessage.Hide()))],
            ['hide'],
          ),
          h.button(
            [h.Id(`${field}-show-${id}`), h.OnClick(wrap(field, id, PresenceMessage.Show()))],
            ['show'],
          ),
          h.button([h.Id(`${field}-press-${id}`), h.OnClick(Message.Pressed())], ['press']),
        ]),
      ),
    ),
  ).pipe(Behavior.attach(Leaves[field]), Behavior.attach(Recovers))
const wrap = (field: 'left' | 'right', id: string, message: PresenceMessage): Message =>
  field === 'left' ? GotLeft.make(id, message) : GotRight.make(id, message)
const drawLeft = draw('left')
const drawRight = draw('right')

let handle: { dispose: () => void } | undefined
afterEach(() => {
  handle?.dispose()
  handle = undefined
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const boot = async (left: ReadonlyArray<string>, right: ReadonlyArray<string> = []) => {
  const container = document.createElement('div')
  container.id = 'host'
  document.body.append(container)
  const record = (ids: ReadonlyArray<string>) => Object.fromEntries(ids.map(id => [id, shown]))
  handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => ({ model: { left: record(left), right: record(right), pressed: 0 } }),
        update: placements.update((model, message) =>
          Message.match(message, {
            Pressed: () => ({ model: { ...model, pressed: model.pressed + 1 } }),
            GotLeft: () => ({ model }),
            GotRight: () => ({ model }),
          }),
        ),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              h.button(
                [h.Id('show-left-b'), h.OnClick(GotLeft.make('b', PresenceMessage.Show()))],
                ['show b'],
              ),
              drawLeft(model, h),
              drawRight(model, h),
            ],
          ),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  await expect.poll(() => document.getElementById('left-list')).not.toBeNull()
}

const el = (id: string) => document.getElementById(id)!
const press = async (id: string) => {
  el(id).focus()
  await userEvent.keyboard('{Enter}')
}
const settled = () => new Promise<void>(resolve => setTimeout(resolve, 50))
const outlast = () => new Promise<void>(resolve => setTimeout(resolve, DURATION + 300))

describe('a row that is hiding', () => {
  it('draws data-presence and inert, and stays drawn for its exit', async () => {
    await boot(['a', 'b'])
    await press('left-hide-a')
    await expect.poll(() => el('left-a').hasAttribute('inert')).toBe(true)
    expect(el('left-a').getAttribute('data-presence')).toBe('hiding')
    expect(el('left-b').hasAttribute('inert')).toBe(false)
    expect(el('left-b').getAttribute('data-presence')).toBe('shown')
    await expect.poll(() => document.getElementById('left-a')).toBeNull()
  })

  it('takes no click, no Tab and no programmatic focus', async () => {
    await boot(['a', 'b'])
    el('left-list').focus()
    await press('left-hide-a')
    await expect.poll(() => el('left-a').hasAttribute('inert')).toBe(true)
    const box = el('left-press-a').getBoundingClientRect()
    // Hit testing skips an inert subtree, so a real press at its centre reaches nothing of it.
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    expect(el('left-a').contains(hit)).toBe(false)
    el('left-press-a').focus()
    expect(document.activeElement).not.toBe(el('left-press-a'))
    el('left-a').focus()
    expect(document.activeElement).not.toBe(el('left-a'))
    el('left-list').focus()
    for (let step = 0; step < 6; step++) {
      await userEvent.tab()
      expect(el('left-a').contains(document.activeElement)).toBe(false)
    }
  })
})

describe('focus', () => {
  it('leaves the row in the frame it turns inert, and the removal moves nothing', async () => {
    await boot(['a', 'b', 'c'])
    el('left-hide-b').focus()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    await userEvent.keyboard('{Enter}')
    // Well before the exit ends: focus has already left, in the hide's own frame.
    await expect.poll(() => document.activeElement).toBe(el('left-c'))
    expect(el('left-b').hasAttribute('inert')).toBe(true)
    expect(document.getElementById('left-b')).not.toBeNull()
    await expect.poll(() => document.getElementById('left-b')).toBeNull()
    await settled()
    expect(document.activeElement).toBe(el('left-c'))
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('is already elsewhere when the browser would have dropped it, in the mutation of inert itself', async () => {
    await boot(['a', 'b', 'c'])
    el('left-hide-b').focus()
    // Registered after the Mount's own observer, so it is told of the change later.
    const seen: Array<Element | null> = []
    const watcher = new MutationObserver(() => {
      if (el('left-b').hasAttribute('inert')) seen.push(document.activeElement)
    })
    watcher.observe(el('left-b'), { attributes: true, attributeFilter: ['inert'] })
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => seen.length).toBeGreaterThan(0)
    watcher.disconnect()
    expect(seen[0]).toBe(el('left-c'))
  })

  it('does the same when the exit is pressed with the pointer', async () => {
    await boot(['a', 'b', 'c'])
    await userEvent.click(el('left-hide-b'))
    await expect.poll(() => document.activeElement).toBe(el('left-c'))
    expect(document.getElementById('left-b')).not.toBeNull()
  })

  it('keeps a dialog the action opened: focus was not lost', async () => {
    await boot(['a', 'b'])
    const dialog = document.createElement('dialog')
    const ok = document.createElement('button')
    ok.textContent = 'ok'
    dialog.append(ok)
    document.body.append(dialog)
    el('left-hide-a').addEventListener('click', () => dialog.showModal())
    await press('left-hide-a')
    await expect.poll(() => document.activeElement).toBe(ok)
    await outlast()
    expect(document.activeElement).toBe(ok)
    dialog.close()
  })

  it('a Hide then a Show within the exit keeps the row, removes inert and refocuses nothing', async () => {
    await boot(['a', 'b', 'c'])
    await press('left-hide-b')
    await expect.poll(() => document.activeElement).toBe(el('left-c'))
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    el('show-left-b').click()
    await expect.poll(() => el('left-b').getAttribute('data-presence')).toBe('shown')
    expect(el('left-b').hasAttribute('inert')).toBe(false)
    await outlast()
    expect(document.getElementById('left-b')).not.toBeNull()
    expect(document.activeElement).toBe(el('left-c'))
    expect(focus).not.toHaveBeenCalled()
  })
})

describe('two lists on one page', () => {
  it('a row leaving one list moves focus inside it and touches nothing of the other', async () => {
    await boot(['a', 'b'], ['x', 'y'])
    const right = [...document.querySelectorAll<HTMLElement>('#right-list li')]
    const spies = right.map(row => vi.spyOn(row, 'focus'))
    await press('left-hide-a')
    await expect.poll(() => document.activeElement).toBe(el('left-b'))
    await outlast()
    expect(el('right-x').hasAttribute('inert')).toBe(false)
    expect(el('right-y').getAttribute('data-presence')).toBe('shown')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
