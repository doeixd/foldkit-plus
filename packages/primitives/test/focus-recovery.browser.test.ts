/// <reference types="@vitest/browser-playwright" />
/**
 * `FocusRecovery` in a real browser, on hand-built DOM so each removal is one
 * known change. Every removing action is driven twice, by a pointer press and
 * by Enter on the focused button, since each of them focuses what it acts on
 * in its own way. Focus claims are read from `document.activeElement`, which
 * jsdom does not move.
 */
import { Effect, Fiber, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { liveViewStateChanges } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { Behavior, Capability, Event as SlotEvent, Slot, SlotView, Slots } from 'foldkit-mixins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FocusRecovery } from '../src/dom/focus-recovery.js'
import type { Step } from '../src/dom/focus-recovery.js'
import { FocusRecovery as FocusRecoveryBehavior } from '../src/interaction/index.js'

type Activation = 'pointer' | 'keyboard'
const activations: ReadonlyArray<Activation> = ['pointer', 'keyboard']

type Act = 'remove' | 'inert' | 'hidden' | 'disable' | 'moveUp' | 'removeAndDialog'

const fibers: Array<Fiber.Fiber<unknown>> = []
afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => Effect.runPromise(Fiber.interrupt(fiber))))
  window.scrollTo(0, 0)
  document.body.replaceChildren()
  document.body.style.cssText = ''
})

const settled = () => new Promise<void>(resolve => setTimeout(resolve, 20))

const mark = <T extends Element>(element: T, attributes: Record<string, string>) => {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

const run = (owner: HTMLElement, fallback: Record<string, ReadonlyArray<Step>>) => {
  const fiber = Effect.runFork(
    Stream.runDrain(
      FocusRecovery({ fallback: fallback as Record<string, Array<Step>> }).f(
        owner,
        liveViewStateChanges,
      ),
    ),
  )
  fibers.push(fiber)
  return fiber
}

/** A row part with one button that does `act` to it when pressed. */
const row = (id: string, act: Act = 'remove', slot = 'row') => {
  const item = mark(document.createElement('li'), {
    'data-fk-focus-part': slot,
    'data-fk-focus-key': id,
    tabindex: '-1',
    id: `row-${id}`,
  })
  const button = mark(document.createElement('button'), { 'data-act': act })
  button.textContent = `act ${id}`
  item.append(button)
  return item
}

const button = (item: Element) => item.querySelector('button') as HTMLButtonElement

/** One handler for every action: what a press does is the `data-act` of the button. */
const actions = (root: HTMLElement, dialog?: HTMLDialogElement, modal = true) =>
  root.addEventListener('click', event => {
    const target = (event.target as Element).closest('button')
    const item = target?.closest('li')
    if (target === null || target === undefined || item === null || item === undefined) return
    const act = target.getAttribute('data-act')
    if (act === 'remove') item.remove()
    else if (act === 'inert') item.setAttribute('inert', '')
    else if (act === 'hidden') item.setAttribute('hidden', '')
    else if (act === 'disable') target.disabled = true
    else if (act === 'moveUp') item.parentElement?.insertBefore(item, item.previousElementSibling)
    else if (act === 'removeAndDialog') {
      item.remove()
      if (modal) dialog?.showModal()
      else dialog?.show()
    }
  })

interface Rig {
  readonly owner: HTMLElement
  readonly list: HTMLUListElement
  readonly input: HTMLInputElement
  readonly rows: ReadonlyArray<HTMLElement>
  readonly outside: HTMLButtonElement
}

/** An owner with an input part, a list of row parts, and a button outside it. */
const rig = (
  ids: ReadonlyArray<string>,
  fallback: Record<string, ReadonlyArray<Step>>,
  act: Act = 'remove',
  dialog?: { readonly element: HTMLDialogElement; readonly modal: boolean },
): Rig => {
  const owner = mark(document.createElement('div'), { 'data-fk-focus-owner': '' })
  const input = mark(document.createElement('input'), { 'data-fk-focus-part': 'input' })
  const list = document.createElement('ul')
  const rows = ids.map(id => row(id, act))
  list.append(...rows)
  owner.append(input, list)
  const outside = document.createElement('button')
  outside.textContent = 'outside'
  document.body.append(owner, outside)
  actions(owner, dialog?.element, dialog?.modal)
  run(owner, fallback)
  return { owner, list, input, rows, outside }
}

/** Presses `target` as a person would: a click, or focus then Enter. */
const press = async (target: HTMLElement, how: Activation) => {
  if (how === 'pointer') await userEvent.click(target)
  else {
    target.focus()
    await userEvent.keyboard('{Enter}')
  }
}

const rowSteps: ReadonlyArray<Step> = ['next', 'previous', { part: 'input' }]

describe.each(activations)('removing the focused part by %s', how => {
  it('goes to the next row', async () => {
    const { rows } = rig(['a', 'b', 'c'], { row: rowSteps })
    await settled()
    await press(button(rows[1]!), how)
    await expect.poll(() => document.activeElement).toBe(rows[2])
  })

  it('goes to the previous row when it was the last', async () => {
    const { rows } = rig(['a', 'b', 'c'], { row: ['next', 'previous'] })
    await settled()
    await press(button(rows[2]!), how)
    await expect.poll(() => document.activeElement).toBe(rows[1])
  })

  it('falls to the named part when it was the only row (B2a)', async () => {
    const { rows, input } = rig(['a'], { row: rowSteps })
    await settled()
    await press(button(rows[0]!), how)
    await expect.poll(() => document.activeElement).toBe(input)
  })

  it('skips a step whose row was removed in the same change', async () => {
    const { rows } = rig(['a', 'b', 'c'], { row: ['next', 'previous'] })
    await settled()
    button(rows[1]!).focus()
    rows[2]!.remove()
    await press(button(rows[1]!), how)
    await expect.poll(() => document.activeElement).toBe(rows[0])
  })

  it('goes to the owner when no step finds a part', async () => {
    const { rows, owner } = rig(['a'], { row: ['next', 'owner'] })
    owner.tabIndex = -1
    await settled()
    await press(button(rows[0]!), how)
    await expect.poll(() => document.activeElement).toBe(owner)
  })

  it('goes to the roving stop', async () => {
    const { rows } = rig(['a', 'b', 'c'], { row: ['stop'] })
    rows[0]!.tabIndex = 0
    await settled()
    await press(button(rows[2]!), how)
    await expect.poll(() => document.activeElement).toBe(rows[0])
  })

  it('reaches an input from a clear button that goes away with the text (B2b)', async () => {
    const owner = mark(document.createElement('div'), { 'data-fk-focus-owner': '' })
    const input = mark(document.createElement('input'), { 'data-fk-focus-part': 'input' })
    const clear = mark(document.createElement('button'), {
      'data-fk-focus-part': 'clear',
      'data-act': 'remove',
    })
    clear.textContent = 'clear'
    owner.append(input, clear)
    document.body.append(owner)
    owner.addEventListener('click', () => clear.remove())
    run(owner, { clear: [{ part: 'input' }], input: [] })
    await settled()
    await press(clear, how)
    await expect.poll(() => document.activeElement).toBe(input)
  })

  it.each([true, false])(
    'leaves focus on a dialog the removing action opened (modal: %s)',
    async modal => {
      const dialog = document.createElement('dialog')
      const ok = document.createElement('button')
      ok.textContent = 'ok'
      dialog.append(ok)
      document.body.append(dialog)
      // A modal dialog refuses focus elsewhere itself; a plain one does not, so
      // only focus that is moved elsewhere keeps the Mount from taking it back.
      const { rows } = rig(['a', 'b'], { row: rowSteps }, 'removeAndDialog', {
        element: dialog,
        modal,
      })
      await settled()
      await press(button(rows[0]!), how)
      await expect.poll(() => document.activeElement).toBe(ok)
      await settled()
      expect(document.activeElement).toBe(ok)
      dialog.close()
    },
  )

  it.each(['inert', 'hidden', 'disable'] as const)(
    'moves focus off a part made %s before the browser would',
    async act => {
      const { rows } = rig(['a', 'b'], { row: rowSteps }, act)
      await settled()
      await press(button(rows[0]!), how)
      await expect.poll(() => document.activeElement).toBe(rows[1])
    },
  )

  it('keeps focus on a row a keyed reorder moved (P2)', async () => {
    const { rows } = rig(['a', 'b', 'c'], { row: ['same', 'next'] }, 'moveUp')
    await settled()
    await press(button(rows[1]!), how)
    await expect.poll(() => document.activeElement).toBe(rows[1])
    expect(rows[1]!.nextElementSibling).toBe(rows[0])
  })

  it('does nothing when focus has gone elsewhere', async () => {
    const { rows, outside } = rig(['a', 'b'], { row: rowSteps })
    await settled()
    button(rows[0]!).focus()
    outside.focus()
    rows[0]!.remove()
    await settled()
    expect(document.activeElement).toBe(outside)
  })
})

describe('a claim that ended', () => {
  it('is not taken up by a part that is drawn later, once nothing was found', async () => {
    const { rows, list } = rig(['a', 'b'], { row: ['stop'] })
    await settled()
    button(rows[1]!).focus()
    rows[1]!.remove()
    await settled()
    expect(document.activeElement).toBe(document.body)
    // A stop drawn now would be a target for the removal already decided.
    const late = row('late')
    late.tabIndex = 0
    list.append(late)
    await settled()
    expect(document.activeElement).toBe(document.body)
  })

  it('is not kept after the user blurred the element', async () => {
    const { rows } = rig(['a', 'b'], { row: rowSteps })
    await settled()
    button(rows[0]!).focus()
    button(rows[0]!).blur()
    await settled()
    rows[0]!.remove()
    await settled()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('the ids a row may carry (B5)', () => {
  const ids = ['1-option-1', 'a:b', 'x"y', 'a\\b', 'row.1#2', 'a b', 'q]r']
  it.each(ids)('finds the next row of %s without a selector', async id => {
    const { rows } = rig([...ids], { row: ['next', 'previous'] })
    await settled()
    const at = ids.indexOf(id)
    button(rows[at]!).focus()
    rows[at]!.remove()
    const target = rows[at + 1] ?? rows[at - 1]
    await expect.poll(() => document.activeElement).toBe(target)
  })
})

describe('parent', () => {
  it('goes to the row a parent mark names, for a tree drawn flat', async () => {
    const { rows, list } = rig(['p', 'c'], { row: ['parent'] })
    rows[1]!.setAttribute('data-fk-focus-parent', 'p')
    await settled()
    button(rows[1]!).focus()
    rows[1]!.remove()
    await expect.poll(() => document.activeElement).toBe(rows[0])
    expect(list.contains(rows[0]!)).toBe(true)
  })

  it('goes to the closest part around it when there is no mark', async () => {
    const { rows } = rig(['p'], { row: ['parent'] })
    const child = row('c')
    const nested = document.createElement('ul')
    nested.append(child)
    rows[0]!.append(nested)
    await settled()
    button(child).focus()
    await settled()
    child.remove()
    await expect.poll(() => document.activeElement).toBe(rows[0])
  })
})

describe('nested owners', () => {
  /** An outer list whose rows each hold an inner list: a widget inside a widget. */
  const nest = () => {
    const outer = mark(document.createElement('div'), { 'data-fk-focus-owner': '' })
    const outerRows = ['o1', 'o2'].map(id => {
      const item = row(id, 'remove', 'outerRow')
      const inner = mark(document.createElement('div'), { 'data-fk-focus-owner': '' })
      const innerRows = [`${id}-1`, `${id}-2`].map(each => row(each))
      inner.append(...innerRows)
      item.append(inner)
      return { item, inner, innerRows }
    })
    outer.append(...outerRows.map(each => each.item))
    document.body.append(outer)
    return { outer, outerRows }
  }
  const onlyInner = (target: HTMLElement) =>
    target.querySelector(':scope > button') as HTMLButtonElement

  it('lets the inner owner decide, and the outer one stay out of it (B2d)', async () => {
    const { outer, outerRows } = nest()
    const [first, second] = outerRows
    actions(outer)
    const outerSpy = vi.spyOn(second!.item, 'focus')
    run(outer, { outerRow: ['next'] })
    for (const each of outerRows) run(each.inner, { row: ['next', 'previous'] })
    await settled()
    onlyInner(first!.innerRows[0]!).focus()
    first!.innerRows[0]!.remove()
    await expect.poll(() => document.activeElement).toBe(first!.innerRows[1])
    expect(outerSpy).not.toHaveBeenCalled()
  })

  it('passes outward when the inner owner has nothing left, to the outer row holding it', async () => {
    const { outer, outerRows } = nest()
    const [first, second] = outerRows
    actions(outer)
    run(outer, { outerRow: ['next'] })
    for (const each of outerRows) run(each.inner, { row: [] })
    await settled()
    onlyInner(first!.innerRows[0]!).focus()
    first!.innerRows[0]!.remove()
    await expect.poll(() => document.activeElement).toBe(second!.item)
  })

  it('has the outer owner decide when a whole inner owner goes with the row', async () => {
    const { outer, outerRows } = nest()
    const [first, second] = outerRows
    actions(outer)
    run(outer, { outerRow: ['next'] })
    for (const each of outerRows) run(each.inner, { row: ['next'] })
    await settled()
    button(first!.innerRows[0]!).focus()
    first!.item.remove()
    await expect.poll(() => document.activeElement).toBe(second!.item)
  })

  it('moves focus nowhere when the whole widget is torn down', async () => {
    const { rows, owner, outside } = rig(['a', 'b'], { row: rowSteps })
    const spies = [outside, ...rows].map(each => vi.spyOn(each, 'focus'))
    await settled()
    button(rows[0]!).focus()
    owner.remove()
    await settled()
    expect(document.activeElement).toBe(document.body)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('scrolling', () => {
  /** A page of 3000px above the widget and 3000px below it, so removing rows moves nothing. */
  const tall = () => {
    document.body.style.cssText = 'margin: 0'
    const spacer = document.createElement('div')
    spacer.style.height = '3000px'
    document.body.prepend(spacer)
    return () => document.body.append(spacer.cloneNode())
  }

  it('brings a target below the fold to the edge, not the middle', async () => {
    const pad = tall()
    const { rows } = rig(['a', 'b'], { row: ['next'] })
    pad()
    for (const item of rows) item.style.height = '40px'
    rows[1]!.style.marginTop = '1500px'
    await settled()
    window.scrollTo(0, 2900)
    await settled()
    button(rows[0]!).focus()
    rows[0]!.remove()
    await expect.poll(() => document.activeElement).toBe(rows[1])
    const box = rows[1]!.getBoundingClientRect()
    // `focus()` without `preventScroll` centres it; `nearest` puts it at the nearest edge.
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(Math.abs(box.bottom - window.innerHeight) < 1 || Math.abs(box.top) < 1).toBe(true)
  })

  it('does not scroll when the target is in view', async () => {
    const pad = tall()
    const { rows } = rig(['a', 'b'], { row: ['next'] })
    pad()
    await settled()
    window.scrollTo(0, 2990)
    await settled()
    const before = window.scrollY
    button(rows[0]!).focus()
    rows[0]!.remove()
    await expect.poll(() => document.activeElement).toBe(rows[1])
    expect(window.scrollY).toBe(before)
  })
})

describe('after release', () => {
  it('removes every listener it added and disconnects its observer', async () => {
    const owner = mark(document.createElement('div'), { 'data-fk-focus-owner': '' })
    document.body.append(owner)
    const added: Array<[string, unknown]> = []
    const removed: Array<[string, unknown]> = []
    vi.spyOn(owner, 'addEventListener').mockImplementation((type, listener) => {
      added.push([type, listener])
    })
    vi.spyOn(owner, 'removeEventListener').mockImplementation((type, listener) => {
      removed.push([type, listener])
    })
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const fiber = run(owner, { row: [] })
    await settled()
    expect(added.map(([type]) => type).sort()).toEqual([
      'focusin',
      'focusout',
      'foldkit-plus:focus-unrecovered',
    ])
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(removed).toEqual(expect.arrayContaining(added))
    expect(disconnect).toHaveBeenCalledTimes(1)
    disconnect.mockRestore()
  })

  it('reacts to neither a mutation nor a focusout', async () => {
    const { rows, outside, owner } = rig(['a', 'b'], { row: rowSteps })
    await settled()
    button(rows[0]!).focus()
    await settled()
    await Promise.all(fibers.splice(0).map(fiber => Effect.runPromise(Fiber.interrupt(fiber))))
    const spies = rows.map(each => vi.spyOn(each, 'focus'))
    rows[0]!.remove()
    owner.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    outside.dispatchEvent(new Event('focusout', { bubbles: true }))
    await settled()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})

describe.each(activations)('drawn by the Behavior in a running application, pressed by %s', how => {
  const Mark = Mount.defineStream('MarkOwner', {
    messages: [Schema.Never],
    execute: ({ element }) =>
      Stream.callback<never>(() =>
        Effect.acquireRelease(
          Effect.sync(() => element.setAttribute('data-second-mount', 'ran')),
          () => Effect.void,
        ),
      ),
  })
  const Model = Schema.Struct({ rows: Schema.Array(Schema.String), query: Schema.String })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({
    Removed: { id: Schema.String },
    Typed: { value: Schema.String },
    Cleared: {},
  })
  type Message = typeof Message.Type
  const Slots_ = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    input: Slot.make({ capability: Capability.TextInput, events: [SlotEvent.Input] }),
    clear: Slot.make({ capability: Capability.Interactive, events: [SlotEvent.Click] }),
    row: Slot.make({ capability: Capability.Focusable }),
  })
  const Search = SlotView.over(Slots_)<Model, Message>()
  const Recovers = FocusRecoveryBehavior.behavior(Search)({
    owner: 'root',
    parts: {
      input: [],
      clear: [{ part: 'input' }],
      row: ['next', 'previous', { part: 'input' }],
    },
  })
  // A second Mount on the owner: one `OnMount` per element would drop one of the two.
  const Marks = Behavior.forSlots(Slots_)<Model, Message>({
    root: Behavior.slot({ mount: () => Mark() }),
  })
  const view = Search.define((model, slots, h) =>
    h.div(slots.root.attrs([h.Id('widget')]), [
      h.input(
        slots.input.attrs([
          h.Id('query'),
          h.Value(model.query),
          h.OnInput(value => Message.Typed({ value })),
        ]),
      ),
      ...(model.query === ''
        ? []
        : [h.button(slots.clear.attrs([h.Id('clear'), h.OnClick(Message.Cleared())]), ['clear'])]),
      h.ul(
        [],
        model.rows.map(id =>
          h.li(slots.row.attrs([h.Key(id), h.Id(`item-${id}`), h.Tabindex(-1)], { index: 0, id }), [
            h.button([h.Id(`remove-${id}`), h.OnClick(Message.Removed({ id }))], [`remove ${id}`]),
          ]),
        ),
      ),
    ]),
  ).pipe(Behavior.attach(Recovers), Behavior.attach(Marks))
  let handle: { dispose: () => void } | undefined
  const boot = async (rows: ReadonlyArray<string>, query: string) => {
    const container = document.createElement('div')
    container.id = 'host'
    document.body.append(container)
    handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: { rows, query } }),
        update: (model: Model, message: Message) =>
          Message.match<{ readonly model: Model }>(message, {
            Removed: ({ id }) => ({
              model: { ...model, rows: model.rows.filter(row => row !== id) },
            }),
            Typed: ({ value }) => ({ model: { ...model, query: value } }),
            Cleared: () => ({ model: { ...model, query: '' } }),
          }),
        view: (model: Model, h: HtmlBuilder<Message>) => h.main([], [view(model, h)]),
      }),
    )
    await expect.poll(() => document.getElementById('widget')).not.toBeNull()
  }
  afterEach(() => {
    handle?.dispose()
    handle = undefined
  })

  it('draws the marks and both Mounts on the owner', async () => {
    await boot(['a', 'b'], '')
    const widget = document.getElementById('widget')!
    expect(widget.hasAttribute('data-fk-focus-owner')).toBe(true)
    await expect.poll(() => widget.getAttribute('data-second-mount')).toBe('ran')
    expect(document.getElementById('item-a')!.getAttribute('data-fk-focus-key')).toBe('a')
  })

  it('moves focus to the next row when the removed one is pressed', async () => {
    await boot(['a', 'b', 'c'], '')
    await press(document.getElementById('remove-b')!, how)
    await expect.poll(() => document.activeElement).toBe(document.getElementById('item-c'))
  })

  it('moves focus to the input when the last row is removed', async () => {
    await boot(['a'], '')
    await press(document.getElementById('remove-a')!, how)
    await expect.poll(() => document.activeElement).toBe(document.getElementById('query'))
  })

  it('moves focus from the clear button that leaves with the text to the input', async () => {
    await boot([], 'abc')
    await press(document.getElementById('clear')!, how)
    await expect.poll(() => document.getElementById('clear')).toBeNull()
    await expect.poll(() => document.activeElement).toBe(document.getElementById('query'))
  })
})
