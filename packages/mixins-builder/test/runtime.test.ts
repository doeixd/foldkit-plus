// @vitest-environment jsdom
/**
 * The drawn Builder on the real Foldkit runtime: the palette adds, the tree's
 * keys move focus and the selection with it, Alt with an arrow moves a node
 * and the live region says so, a click on the page selects what it lands on,
 * a row or a node dragged onto another moves there, and Delete removes.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { BuilderView } from 'foldkit-mixins-builder'
import { PageBuilder, PageView } from './fixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageView)))
const Slot = Bundle.declare(Drawn, 'editor')
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Editor = Page.at(Slot)
const placements = Page.assemble(Editor)

const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll('button')).find(button => button.textContent === name)
const rows = () => Array.from(document.querySelectorAll('[role="treeitem"]'))
const rowNamed = (name: string) => rows().find(row => row.textContent === name)
const selectedRow = () => rows().find(row => row.getAttribute('aria-selected') === 'true')
const key = (target: Element | undefined, name: string, init: KeyboardEventInit = {}) =>
  target?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }))
const canvasText = () =>
  Array.from(document.querySelectorAll('[aria-label="Page"] h2, [aria-label="Page"] .banner')).map(
    element => element.textContent,
  )

it('adds, navigates, moves, selects and removes, from the keyboard and the pointer', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'builder'
  document.body.appendChild(container)

  const update = placements.update()
  // The last Model drawn, to read what the page holds.
  let drawn: Model | undefined
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({}),
        update: (model: Model, message: Message) => update(model, message),
        view: (model: Model, h: HtmlBuilder<Message>) => {
          drawn = model
          return h.main([], [Editor.view(model, h)])
        },
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(buttonNamed('Add Section')).toBeDefined())
    buttonNamed('Add Section')?.click()
    await vi.waitFor(() => expect(rowNamed('Section')).toBeDefined())
    buttonNamed('Add Heading')?.click()
    await vi.waitFor(() => expect(rowNamed('Heading')).toBeDefined())
    buttonNamed('Add Banner')?.click()
    await vi.waitFor(() => expect(canvasText()).toEqual(['New heading', 'Hello']))
    expect(selectedRow()?.textContent).toBe('Banner')

    // Up in the tree moves focus to the Heading, and the selection follows.
    key(rowNamed('Banner'), 'ArrowUp')
    await vi.waitFor(() => expect(selectedRow()?.textContent).toBe('Heading'))
    expect(document.activeElement?.textContent).toBe('Heading')

    // Alt+Down moves the Heading after the Banner, and the live region says so.
    key(rowNamed('Heading'), 'ArrowDown', { altKey: true })
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading']))
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'Moved Heading, 2 of 2 in Section body',
      ),
    )

    // A click on a row selects it.
    rowNamed('Section')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(selectedRow()?.textContent).toBe('Section'))

    // A click on the page selects the node it lands on.
    document.querySelector<HTMLElement>('[aria-label="Page"] .banner')?.click()
    await vi.waitFor(() => expect(selectedRow()?.textContent).toBe('Banner'))

    // Dragging the Banner's row onto the Heading's lands it after the Heading
    // (jsdom has no boxes, so the pointer is inside a Heading, which takes
    // nothing), and the click the drop ends with selects nothing.
    const pointer = (row: Element | undefined, type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, { button: 0, clientX: 10, clientY })
      row?.dispatchEvent(event)
    }
    pointer(rowNamed('Banner'), 'pointerdown', 0)
    pointer(rowNamed('Heading'), 'pointermove', 20)
    await vi.waitFor(() =>
      expect(rowNamed('Heading')?.getAttribute('data-builder-drop')).toBe('after'),
    )
    pointer(rowNamed('Heading'), 'pointerup', 20)
    rowNamed('Heading')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(canvasText()).toEqual(['New heading', 'Hello']))
    expect(selectedRow()?.textContent).toBe('Banner')
    expect(document.querySelector('[data-builder-drop]')).toBeNull()

    // A drag on the page itself: the Heading onto the Banner lands it after,
    // and selects the Heading it dragged.
    const onPage = (selector: string) =>
      document.querySelector(`[aria-label="Page"] ${selector}`) ?? undefined
    pointer(onPage('h2'), 'pointerdown', 0)
    pointer(onPage('.banner'), 'pointermove', 20)
    pointer(onPage('.banner'), 'pointerup', 20)
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading']))
    expect(selectedRow()?.textContent).toBe('Heading')

    // Choosing the Banner's tone in the inspector redraws it; choosing the blank
    // goes back to the default.
    const tone = () =>
      document.querySelector<HTMLSelectElement>(
        `[aria-label="Properties"] select[id$="-appearance-tone"]`,
      )
    const choose = (value: string) => {
      const select = tone()
      if (select === null) throw new Error('no tone select')
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    rowNamed('Banner')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(tone()).not.toBeNull())
    choose('loud')
    await vi.waitFor(() => expect(onPage('.banner')?.getAttribute('data-tone')).toBe('loud'))
    choose('')
    await vi.waitFor(() => expect(onPage('.banner')?.getAttribute('data-tone')).toBe('plain'))
    // Clearing the last choice leaves no appearance behind at all.
    const page = drawn === undefined ? undefined : PageBuilder.document(drawn.editor)
    const banner = Object.values(page?.nodes ?? {}).find(node => node.block === 'Banner')
    expect(banner).toBeDefined()
    expect(banner?.appearance).toBeUndefined()
    rowNamed('Heading')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(selectedRow()?.textContent).toBe('Heading'))

    // Delete on the layers removes the selected node.
    key(rowNamed('Heading'), 'Delete')
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello']))
    expect(rowNamed('Heading')).toBeUndefined()
  } finally {
    handle.dispose()
  }
})
