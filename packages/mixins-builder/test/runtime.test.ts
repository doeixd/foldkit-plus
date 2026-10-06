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
import { Message as BuilderMessage, Model as BuilderModel } from 'foldkit-builder'
import { Composition, NodeId } from 'foldkit-composition'
import { BuilderView } from 'foldkit-mixins-builder'
import { Frames } from 'foldkit-mixins/testing'
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
  Array.from(document.querySelectorAll('button')).find(
    button => (button.getAttribute('aria-label') ?? button.textContent) === name,
  )
const rows = () => Array.from(document.querySelectorAll('[role="treeitem"]'))
/** The row of the one node of a Block. */
const rowNamed = (block: string) => rows().find(row => row.getAttribute('data-block') === block)
const selectedRow = () => rows().find(row => row.getAttribute('aria-selected') === 'true')
/** A key pressed on `target`, focused first, as a key reaches only what has focus. */
const key = (target: Element | undefined, name: string, init: KeyboardEventInit = {}) => {
  if (target instanceof HTMLElement) target.focus()
  return target?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }))
}
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
          return h.main([], [Editor.view(model, h, BuilderView.inputs())])
        },
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  // jsdom lays nothing out; recording what is scrolled into view is what can be asserted.
  const scrolled: Element[] = []
  const scroll = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  try {
    await vi.waitFor(() => expect(buttonNamed('Add Section')).toBeDefined())
    buttonNamed('Add Section')?.click()
    await vi.waitFor(() => expect(rowNamed('Section')).toBeDefined())
    buttonNamed('Add Heading')?.click()
    await vi.waitFor(() => expect(rowNamed('Heading')).toBeDefined())
    buttonNamed('Add Promo banner')?.click()
    await vi.waitFor(() => expect(canvasText()).toEqual(['New heading', 'Hello']))
    expect(selectedRow()?.getAttribute('data-block')).toBe('Banner')
    // What was inserted is selected, and brought into view in the layers and on the page.
    await vi.waitFor(() => {
      expect(scrolled).toContain(rowNamed('Banner'))
      expect(scrolled).toContain(document.querySelector('[aria-label="Page"] .banner'))
    })

    // Up in the tree moves focus to the Heading, and the selection follows.
    key(rowNamed('Banner'), 'ArrowUp')
    await vi.waitFor(() => expect(selectedRow()?.getAttribute('data-block')).toBe('Heading'))
    expect(document.activeElement?.getAttribute('data-block')).toBe('Heading')

    // Alt+Down moves the Heading after the Banner, and the live region says so.
    key(rowNamed('Heading'), 'ArrowDown', { altKey: true })
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading']))
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'Moved Heading, 2 of 2 in Section body',
      ),
    )

    // The Section's toggle closes it, hiding what it holds, and opens it again.
    const toggle = () => rowNamed('Section')?.querySelector('[aria-hidden="true"]')
    toggle()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(rowNamed('Heading')).toBeUndefined())
    expect(rowNamed('Section')?.getAttribute('aria-expanded')).toBe('false')
    toggle()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(rowNamed('Heading')).toBeDefined())

    // The page's crumb lets go of the selection; Escape on the page does too.
    const crumb = (name: string) =>
      Array.from(document.querySelectorAll('[aria-label="Where the selection is"] button')).find(
        button => button.textContent === name,
      )
    // A press on a button focuses it, as a real one does.
    const press = (button: Element | undefined) => {
      if (button instanceof HTMLElement) button.focus()
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    press(crumb('Section'))
    await vi.waitFor(() => expect(selectedRow()?.getAttribute('data-block')).toBe('Section'))
    press(crumb('Page'))
    await vi.waitFor(() => expect(selectedRow()).toBeUndefined())
    rowNamed('Heading')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(selectedRow()).toBeDefined())
    key(document.querySelector('[aria-label="Page"]') ?? undefined, 'Escape')
    await vi.waitFor(() => expect(selectedRow()).toBeUndefined())

    // A pattern's tile adds its Section and the Heading it opens with, last on the page.
    buttonNamed('Add Intro')?.click()
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading', 'Welcome']))
    expect(selectedRow()?.getAttribute('data-block')).toBe('Section')
    key(document.querySelector('[aria-label="Page"]') ?? undefined, 'z', { ctrlKey: true })
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading']))

    // Pointing at a row marks its node on the page; leaving it lets go.
    const hovered = () =>
      document
        .querySelector('[data-composition-mark="hovered"]')
        ?.getAttribute('data-composition-node')
    rowNamed('Section')?.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.waitFor(() =>
      expect(hovered()).toBe(rowNamed('Section')?.getAttribute('data-builder-row')),
    )
    rowNamed('Section')?.dispatchEvent(new MouseEvent('mouseleave'))
    await vi.waitFor(() => expect(hovered()).toBeUndefined())

    // A click on a row selects it.
    rowNamed('Section')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(selectedRow()?.getAttribute('data-block')).toBe('Section'))

    // A click on the page selects the node it lands on.
    document.querySelector<HTMLElement>('[aria-label="Page"] .banner')?.click()
    await vi.waitFor(() => expect(selectedRow()?.getAttribute('data-block')).toBe('Banner'))

    // Dragging the Banner's row onto the Heading's lands it after the Heading
    // (jsdom has no boxes, so the pointer is inside a Heading, which takes
    // nothing), and the click the drop ends with selects nothing.
    const pick = (selector: string, value: string) => {
      const select = document.querySelector<HTMLSelectElement>(selector)
      if (select === null) throw new Error(`no ${selector}`)
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
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
    expect(selectedRow()?.getAttribute('data-block')).toBe('Banner')
    expect(document.querySelector('[data-builder-drop]')).toBeNull()

    // A drag on the page itself: the Heading onto the Banner lands it after,
    // and selects the Heading it dragged.
    const onPage = (selector: string) =>
      document.querySelector(`[aria-label="Page"] ${selector}`) ?? undefined
    pointer(onPage('h2'), 'pointerdown', 0)
    pointer(onPage('.banner'), 'pointermove', 20)
    pointer(onPage('.banner'), 'pointerup', 20)
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello', 'New heading']))
    expect(selectedRow()?.getAttribute('data-block')).toBe('Heading')

    // Choosing the Banner's tone in the inspector redraws it; choosing the blank
    // goes back to the default.
    const tone = () => document.querySelector('[aria-label="Properties"] [aria-label="Tone"]')
    const choose = (text: string) =>
      Array.from(tone()?.querySelectorAll('button') ?? [])
        .find(button => button.textContent === text)
        ?.click()
    rowNamed('Banner')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(tone()).not.toBeNull())
    choose('Loud')
    await vi.waitFor(() => expect(onPage('.banner')?.getAttribute('data-tone')).toBe('loud'))
    choose('Default')
    await vi.waitFor(() => expect(onPage('.banner')?.getAttribute('data-tone')).toBe('plain'))
    // A responsive axis: a name at a breakpoint, then a base, is a name per
    // point; with only the base left it is one name again.
    const stored = () => {
      const now = drawn === undefined ? undefined : PageBuilder.document(drawn.editor)
      return Object.values(now?.nodes ?? {}).find(node => node.block === 'Banner')?.appearance
    }
    const space = (point: string, value: string) =>
      pick(`[aria-label="Properties"] select[id$="-appearance-space${point}"]`, value)
    space('-md', 'm')
    await vi.waitFor(() => expect(stored()).toEqual({ space: { md: 'm' } }))
    space('', 's')
    await vi.waitFor(() => expect(stored()).toEqual({ space: { base: 's', md: 'm' } }))
    space('-md', '')
    await vi.waitFor(() => expect(stored()).toEqual({ space: 's' }))
    // Clearing the last choice leaves no appearance behind at all.
    space('', '')
    await vi.waitFor(() => expect(stored()).toBeUndefined())

    // A number-literal prop is chosen as text and stored as the number.
    const columns = () => {
      const now = drawn === undefined ? undefined : PageBuilder.document(drawn.editor)
      return Object.values(now?.nodes ?? {}).find(node => node.block === 'Banner')?.props['columns']
    }
    pick('[aria-label="Properties"] select[id$="-columns"]', '2')
    await vi.waitFor(() => expect(columns()).toBe(2))

    // The Banner's press runs an action: its input starts from empty values, is
    // edited field by field, and choosing nothing removes it.
    const actions = () => {
      const now = drawn === undefined ? undefined : PageBuilder.document(drawn.editor)
      return Object.values(now?.nodes ?? {}).find(node => node.block === 'Banner')?.actions
    }
    pick('[aria-label="Properties"] select[id$="-on-press"]', 'subscribe')
    await vi.waitFor(() =>
      expect(actions()).toEqual({
        press: { action: 'subscribe', input: { list: 'news', note: '' } },
      }),
    )
    pick('[aria-label="Properties"] select[id="Banner-press-subscribe-list"]', 'offers')
    await vi.waitFor(() =>
      expect(actions()).toEqual({
        press: { action: 'subscribe', input: { list: 'offers', note: '' } },
      }),
    )
    pick('[aria-label="Properties"] select[id$="-on-press"]', '')
    await vi.waitFor(() => expect(actions()).toBeUndefined())

    // Shown only to members, the Banner is marked hidden while previewing as a
    // guest, and not as a member; always again, it has no condition at all.
    const bannerHidden = () =>
      onPage('.banner')?.closest('[data-composition-node]')?.hasAttribute('data-composition-hidden')
    pick('[aria-label="Properties"] select[id$="-when-audience"]', 'member')
    await vi.waitFor(() => expect(bannerHidden()).toBe(true))
    pick('[aria-label="Preview as"] select[id$="-preview-audience"]', 'member')
    await vi.waitFor(() => expect(bannerHidden()).toBe(false))
    // A flag's choice is a boolean, not its text.
    pick('[aria-label="Preview as"] select[id$="-preview-beta"]', 'true')
    await vi.waitFor(() =>
      expect(drawn?.editor.preview).toEqual({ audience: 'member', beta: true }),
    )
    // Clearing one key's condition keeps another's; clearing the last leaves none.
    const bannerWhen = () => {
      const now = drawn === undefined ? undefined : PageBuilder.document(drawn.editor)
      return Object.values(now?.nodes ?? {}).find(each => each.block === 'Banner')?.when
    }
    pick('[aria-label="Properties"] select[id$="-when-beta"]', 'true')
    await vi.waitFor(() =>
      expect(bannerWhen()).toEqual([{ eq: ['audience', 'member'] }, { eq: ['beta', true] }]),
    )
    pick('[aria-label="Properties"] select[id$="-when-audience"]', '')
    await vi.waitFor(() => expect(bannerWhen()).toEqual([{ eq: ['beta', true] }]))
    pick('[aria-label="Properties"] select[id$="-when-beta"]', '')
    await vi.waitFor(() => expect(bannerWhen()).toBeUndefined())

    rowNamed('Heading')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(selectedRow()?.getAttribute('data-block')).toBe('Heading'))

    // Delete on the layers removes the selected node.
    key(rowNamed('Heading'), 'Delete')
    await vi.waitFor(() => expect(canvasText()).toEqual(['Hello']))
    expect(rowNamed('Heading')).toBeUndefined()
  } finally {
    handle.dispose()
    Element.prototype.scrollIntoView = scroll
  }
})

// Two inspectors of one Builder name share a slot. That is an error to see, not an
// inspector drawn without the runtime, whose changes would reach nothing.
it('says so when one Builder is drawn twice, rather than drawing a dead inspector', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const crashes: Array<string> = []
  const spy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args) => crashes.push(args.map(String).join(' ')))
  const container = document.createElement('div')
  container.id = 'twice'
  document.body.appendChild(container)
  const section = NodeId.make('s')
  const heading = NodeId.make('h')
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [section],
      nodes: {
        [section]: { block: 'Section', props: { tone: 'plain' }, regions: { body: [heading] } },
        [heading]: { block: 'Heading', props: { text: 'Hi' }, regions: {} },
      },
    }),
  )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: BuilderModel,
      container,
      init: () => ({
        model: PageBuilder.bundle.update(page, BuilderMessage.Selected({ id: heading }), undefined)
          .model,
      }),
      update: (model: BuilderModel, message: BuilderMessage) =>
        PageBuilder.bundle.update(model, message, undefined),
      view: (model: BuilderModel, h: HtmlBuilder<BuilderMessage>) =>
        h.div([], [PageView(model, h), PageView(model, h)]),
    }),
  )
  try {
    await vi.waitFor(() =>
      expect(crashes.join('\n')).toContain('duplicate h.submodel slotId "PageBuilder-settings"'),
    )
  } finally {
    handle.dispose()
    spy.mockRestore()
  }
})

// A control of the application's own, backed by a Bundle, works in the inspector
// with no Builder code: its view is drawn there, and what it sends is an edit.
it('shows an empty Region on the page, and a node or a tile dragged onto it goes into it', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'regions'
  document.body.appendChild(container)
  const [first, second, heading] = [NodeId.make('s1'), NodeId.make('s2'), NodeId.make('h')]
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [first, second],
      nodes: {
        [first]: { block: 'Section', props: { tone: 'plain' }, regions: { body: [heading] } },
        [heading]: { block: 'Heading', props: { text: 'Moved' }, regions: {} },
        [second]: { block: 'Section', props: { tone: 'plain' }, regions: { body: [] } },
      },
    }),
  )
  let drawn = page
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: BuilderModel,
      container,
      init: () => ({ model: page }),
      update: (model: BuilderModel, message: BuilderMessage) =>
        PageBuilder.bundle.update(model, message, undefined),
      view: (model: BuilderModel, h: HtmlBuilder<BuilderMessage>) => {
        drawn = model
        return PageView(model, h)
      },
    }),
  )
  const emptyOf = (section: NodeId) =>
    document.querySelector(
      `[aria-label="Page"] [data-composition-node="${section}"][data-composition-region="body"]`,
    ) ?? undefined
  // Pressed at the top, moved and let go lower: past the threshold that makes it a drag.
  const pointer = (target: Element | undefined, type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { button: 0, clientX: 10, clientY: type === 'pointerdown' ? 0 : 20 })
    target?.dispatchEvent(event)
  }
  const bodyOf = (section: NodeId) => PageBuilder.document(drawn).nodes[section]?.regions['body']
  try {
    await vi.waitFor(() => expect(emptyOf(second)?.textContent).toBe('Body'))
    expect(emptyOf(first)).toBeUndefined()
    // The page's drag listens once its first drawing has settled.
    await frames.settle()

    pointer(document.querySelector('[aria-label="Page"] h2') ?? undefined, 'pointerdown')
    pointer(emptyOf(second), 'pointermove')
    await vi.waitFor(() =>
      expect(emptyOf(second)?.getAttribute('data-composition-drop')).toBe('inside'),
    )
    pointer(emptyOf(second), 'pointerup')
    await vi.waitFor(() => expect(bodyOf(second)).toEqual([heading]))
    expect(emptyOf(second)).toBeUndefined()

    // The first is empty now: a tile from the palette goes into it.
    await vi.waitFor(() => expect(emptyOf(first)).toBeDefined())
    pointer(document.querySelector('[data-block="Heading"]') ?? undefined, 'pointerdown')
    pointer(emptyOf(first), 'pointermove')
    await vi.waitFor(() =>
      expect(emptyOf(first)?.getAttribute('data-composition-drop')).toBe('inside'),
    )
    pointer(emptyOf(first), 'pointerup')
    await vi.waitFor(() => expect(bodyOf(first)).toHaveLength(1))
    expect(bodyOf(second)).toEqual([heading])
  } finally {
    handle.dispose()
  }
})

it('draws a color picker a prop asks for, and takes what it chooses', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'picker'
  document.body.appendChild(container)
  const section = NodeId.make('s')
  const swatch = NodeId.make('w')
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [section],
      nodes: {
        [section]: { block: 'Section', props: { tone: 'plain' }, regions: { body: [swatch] } },
        [swatch]: { block: 'Swatch', props: { tint: '#000000' }, regions: {} },
      },
    }),
  )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: BuilderModel,
      container,
      init: () => ({
        model: PageBuilder.bundle.update(page, BuilderMessage.Selected({ id: swatch }), undefined)
          .model,
      }),
      update: (model: BuilderModel, message: BuilderMessage) =>
        PageBuilder.bundle.update(model, message, undefined),
      view: (model: BuilderModel, h: HtmlBuilder<BuilderMessage>) => PageView(model, h),
    }),
  )
  const inInspector = (selector: string) =>
    document.querySelector(`[aria-label="Properties"] ${selector}`)
  try {
    await vi.waitFor(() => expect(inInspector('.picker .hex')?.textContent).toBe('#000000'))
    buttonNamed('Red')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Page"] .swatch')?.textContent).toBe('#ff0000'),
    )
    expect(inInspector('.picker .hex')?.textContent).toBe('#ff0000')
  } finally {
    handle.dispose()
  }
})

it('draws in the words its view inputs give it, through a submodel as an application places it', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const crashes: Array<string> = []
  const spy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args) => crashes.push(args.map(String).join(' ')))
  const container = document.createElement('div')
  container.id = 'worded'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({}),
        update: placements.update(),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              Editor.view(
                model,
                h,
                BuilderView.inputs({
                  words: { palette: 'Bloque nuevo', addBlock: 'Añadir {label}' },
                }),
              ),
            ],
          ),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(buttonNamed('Añadir Section')).toBeDefined())
    expect(document.querySelector('[aria-label="Bloque nuevo"]')).not.toBeNull()
    expect(crashes).toEqual([])
  } finally {
    handle.dispose()
    spy.mockRestore()
  }
})
