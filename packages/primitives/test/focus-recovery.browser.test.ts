/// <reference types="@vitest/browser-playwright" />
/**
 * `FocusRecovery` in a real browser, on hand-built DOM so each removal is one
 * known change. Every removing action is driven twice, by a pointer press and
 * by Enter on the focused button, since each of them focuses what it acts on
 * in its own way. Focus claims are read from `document.activeElement`, which
 * jsdom does not move.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FocusRecovery } from '../src/dom/focus-recovery.js'
import type { Step } from '../src/dom/focus-recovery.js'

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
const actions = (root: HTMLElement, dialog?: HTMLDialogElement) =>
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
      dialog?.showModal()
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
  actions(owner)
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

  it('leaves focus on a dialog the removing action opened', async () => {
    const dialog = document.createElement('dialog')
    const ok = document.createElement('button')
    ok.textContent = 'ok'
    dialog.append(ok)
    document.body.append(dialog)
    const { rows, owner } = rig(['a', 'b'], { row: rowSteps }, 'removeAndDialog')
    actions(owner, dialog)
    await settled()
    // Both rig and this call listen; the dialog opens once, and a second open throws.
    await press(button(rows[0]!), how).catch(() => undefined)
    await expect.poll(() => document.activeElement).toBe(ok)
    await settled()
    expect(document.activeElement).toBe(ok)
    dialog.close()
  })

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
