/**
 * Audit of #558 item 3 against `PointerDrag` in a real page: what a drag
 * reports, and what it does not (edge scrolling, a key path, announcements, a
 * press on empty space). A test named "today" pins current behaviour that a
 * finding in `docs/design/558-audit-FINDINGS.md` calls a gap; the fix
 * changes the assertion, not the scenario.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it } from 'vitest'
import { type DragFact, PointerDrag } from '../src/dom/pointer-drag.js'

afterEach(() => {
  document.body.replaceChildren()
})

const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(
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

/** What is under the point, as a pointer event's target is. */
const under = (x: number, y: number) => document.elementFromPoint(x, y) ?? document.body

const drive = (
  container: HTMLElement,
  options: {
    readonly attribute: string
    readonly targets?: { readonly attribute: string; readonly within: string }
  },
) => {
  const facts: Array<DragFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(PointerDrag(options).f(container, liveViewStateChanges), fact =>
      Effect.sync(() => void facts.push(fact)),
    ),
  )
  return { facts, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

const rowStyle = 'height:30px;box-sizing:border-box;margin:0;padding:0;list-style:none'

/** A scrolling box of twenty marked rows, 100px tall, at the page's top left. */
const scrollingList = () => {
  const box = document.createElement('div')
  box.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto'
  const list = document.createElement('ul')
  list.style.cssText = 'margin:0;padding:0'
  for (let at = 0; at < 20; at++) {
    const row = document.createElement('li')
    row.dataset['row'] = `r${at}`
    row.style.cssText = rowStyle
    row.textContent = `row ${at}`
    list.append(row)
  }
  box.append(list)
  document.body.append(box)
  return { box, list }
}

it('does not scroll the list while a drag is held at its edge (today: no edge scrolling)', async () => {
  const { box, list } = scrollingList()
  const run = drive(list, { attribute: 'data-row' })
  try {
    await later(20)
    pointer(under(10, 15), 'pointerdown', 10, 15)
    pointer(under(10, 40), 'pointermove', 10, 40)
    // Held in the last strip of the box, where a list that scrolls for a drag would.
    pointer(under(10, 98), 'pointermove', 10, 98)
    await later(500)
    expect(run.facts.map(fact => fact._tag)).toContain('DragStarted')
    expect(box.scrollTop).toBe(0)
    pointer(under(10, 98), 'pointerup', 10, 98)
  } finally {
    await run.stop()
  }
})

it('reports nothing for keys on a marked row (today: no keyboard path)', async () => {
  const { list } = scrollingList()
  const row = list.querySelector<HTMLElement>('[data-row="r1"]')!
  row.tabIndex = 0
  const run = drive(list, { attribute: 'data-row' })
  try {
    await later(20)
    row.focus()
    for (const key of [' ', 'Enter', 'ArrowDown', 'ArrowUp', 'Escape']) {
      row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    await later(50)
    expect(run.facts).toEqual([])
  } finally {
    await run.stop()
  }
})

it('adds nothing to the page for a reader of it during a drag (today: no announcement)', async () => {
  const { list } = scrollingList()
  const run = drive(list, { attribute: 'data-row' })
  const added: Array<Node> = []
  const observer = new MutationObserver(records => {
    for (const record of records) added.push(...record.addedNodes)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  try {
    await later(20)
    pointer(under(10, 15), 'pointerdown', 10, 15)
    pointer(under(10, 50), 'pointermove', 10, 50)
    pointer(under(10, 50), 'pointerup', 10, 50)
    await later(50)
    expect(run.facts.map(fact => fact._tag)).toEqual(['DragStarted', 'DraggedOver', 'DragDropped'])
    observer.takeRecords()
    expect(added).toEqual([])
    expect(document.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
  } finally {
    observer.disconnect()
    await run.stop()
  }
})

it('reports a drop over a descendant of what is dragged, which only the parent can refuse', async () => {
  const tree = document.createElement('div')
  tree.style.cssText = 'position:absolute;left:0;top:0;width:200px'
  tree.innerHTML = `
    <div data-node="p"><div style="${rowStyle}">parent</div>
      <div style="padding-left:20px"><div data-node="c" style="${rowStyle}">child</div></div>
    </div>
    <div data-node="q" style="${rowStyle}">other</div>`
  document.body.append(tree)
  const run = drive(tree, { attribute: 'data-node' })
  try {
    await later(20)
    pointer(under(10, 15), 'pointerdown', 10, 15)
    pointer(under(30, 45), 'pointermove', 30, 45)
    pointer(under(30, 45), 'pointerup', 30, 45)
    await later(20)
    const dropped = run.facts.find(fact => fact._tag === 'DragDropped')
    expect(dropped).toMatchObject({ id: 'p', over: { id: 'c' } })
  } finally {
    await run.stop()
  }
})

it('moves a row to another list through `targets`, reporting its empty space as the region', async () => {
  const page = document.createElement('div')
  page.style.cssText = 'position:absolute;left:0;top:0;width:400px'
  page.innerHTML = `
    <ul id="from" style="margin:0;padding:0;width:150px;height:100px"><li data-row="a" style="${rowStyle}">a</li></ul>
    <ul id="to" style="margin:0;padding:0;position:absolute;left:200px;top:0;width:150px;height:100px"><li data-slot="x" style="${rowStyle}">x</li></ul>`
  document.body.append(page)
  const from = page.querySelector<HTMLElement>('#from')!
  const run = drive(from, {
    attribute: 'data-row',
    targets: { attribute: 'data-slot', within: '#to' },
  })
  try {
    await later(20)
    pointer(under(10, 15), 'pointerdown', 10, 15)
    pointer(under(250, 15), 'pointermove', 250, 15)
    pointer(under(250, 80), 'pointermove', 250, 80)
    pointer(under(250, 80), 'pointerup', 250, 80)
    await later(20)
    const overs = run.facts.filter(fact => fact._tag === 'DraggedOver')
    expect(overs[0]).toMatchObject({ over: { id: 'x' }, region: true })
    expect(run.facts.at(-1)).toMatchObject({
      _tag: 'DragDropped',
      id: 'a',
      over: null,
      region: true,
    })
  } finally {
    await run.stop()
  }
})

it('starts no drag from a press on empty space (today: nothing a lasso could ride)', async () => {
  const { list } = scrollingList()
  const canvas = document.createElement('div')
  canvas.style.cssText = 'position:absolute;left:300px;top:0;width:200px;height:200px'
  canvas.innerHTML = `<div data-node="n" style="position:absolute;left:150px;top:150px;width:30px;height:30px"></div>`
  document.body.append(canvas)
  void list
  const run = drive(canvas, { attribute: 'data-node' })
  try {
    await later(20)
    pointer(under(320, 20), 'pointerdown', 320, 20)
    pointer(under(400, 100), 'pointermove', 400, 100)
    pointer(under(400, 100), 'pointerup', 400, 100)
    await later(20)
    expect(run.facts).toEqual([])
  } finally {
    await run.stop()
  }
})

it('drops where the pointer is let go after the list scrolled under it, with no move between', async () => {
  const { box, list } = scrollingList()
  const run = drive(list, { attribute: 'data-row' })
  try {
    await later(20)
    pointer(under(10, 15), 'pointerdown', 10, 15)
    pointer(under(10, 50), 'pointermove', 10, 50)
    box.scrollTop = 60
    pointer(under(10, 50), 'pointerup', 10, 50)
    await later(20)
    // y = 50 over a list scrolled 60px is row 3 (110 / 30), not row 1.
    expect(run.facts.at(-1)).toMatchObject({ _tag: 'DragDropped', id: 'r0', over: { id: 'r3' } })
  } finally {
    await run.stop()
  }
})
