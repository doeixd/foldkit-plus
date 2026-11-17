/**
 * The editor sets the selection itself after an edit, which a browser does not scroll to: in a
 * real browser, with real keys, the caret's line stays in view by the least scroll, in the window
 * (under a sticky bar that `scroll-padding` names) and in a scrolling box; what is not the
 * person's own input (another person's edit, a control holding the focus) never moves the page.
 */
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as RichText from 'foldkit-richtext'
import { attach, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'
import { caretRect } from '../src/reveal.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const paragraph = (block: string, text: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text, marks: [] }],
})
const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, index) => paragraph(`p${index}`, `Line ${index}`))

const BAR = 60

/** An application over the editor: it answers an edit at once, or holds the answer for `flush`. */
const setup = (
  children: ReadonlyArray<unknown>,
  options: { readonly held?: boolean; readonly box?: number } = {},
) => {
  const dom = mount(document, RichText.decodeDocument({ version: 1, children }))
  let state: RichText.EditorState = { document: dom.content, selection: null }
  let minted = 0
  const pending: Array<() => void> = []
  const attachment = attach(dom, {
    nodes: RichText.nodeRegistry(RichText.standardNodes),
    onSelection: selection => {
      state = { ...state, selection }
    },
    onIntent: command => {
      const result = RichText.run(state, command, { mint: () => `minted-${++minted}` })
      if (!result.ok) throw new Error(result.error)
      state = result.state
      const answer = () => {
        attachment.sync(result.state, result.changeSet)
        attachment.answered()
      }
      if (options.held === true) pending.push(answer)
      else answer()
    },
  })
  const style = document.createElement('style')
  style.textContent = `html { scroll-padding-top: ${BAR}px }
    body { margin: 0 }
    [data-bar] { position: sticky; top: 0; height: ${BAR}px; background: #ccc }
    [data-box] { height: ${options.box ?? 0}px; overflow: auto; width: 300px }`
  document.head.append(style)
  if (options.box === undefined) document.body.append(dom.root)
  else {
    const box = document.createElement('div')
    box.dataset.box = ''
    box.append(dom.root)
    document.body.append(box)
  }
  return {
    dom,
    attachment,
    box: dom.root.parentElement!,
    flush: () => pending.splice(0).forEach(answer => answer()),
  }
}

/** The page's room before the editor starts: a bar, then a spacer that leaves 100px of window. */
const below = (): void => {
  const bar = document.createElement('div')
  bar.dataset.bar = ''
  const spacer = document.createElement('div')
  spacer.style.height = `${innerHeight - 100 - BAR}px`
  document.body.prepend(bar, spacer)
}

/** The editor's text, in the window at the point of the caret's last line. */
const lastLine = (dom: { root: HTMLElement }) => dom.root.lastElementChild!.getBoundingClientRect()
const settle = () =>
  new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))

const focusAt = (setupped: ReturnType<typeof setup>, selection: RichText.Selection) => {
  setupped.dom.root.focus({ preventScroll: true })
  restoreSelection(setupped.attachment.current(), selection)
}

afterEach(() => {
  document.body.replaceChildren()
  document.head.replaceChildren()
  scrollTo(0, 0)
})

it('scrolls the window when typed lines pass the bottom, and keeps the line below the sticky bar', async () => {
  below()
  const app = setup(paragraphs(1))
  app.attachment.focus(caret('p0-t', 6))
  for (let line = 0; line < 20; line++) await userEvent.keyboard('{Enter}x')
  const box = lastLine(app.dom)
  expect(scrollY).toBeGreaterThan(0)
  expect(box.bottom).toBeLessThanOrEqual(innerHeight + 1)
  expect(box.top).toBeGreaterThanOrEqual(BAR - 1)
})

it('follows an Enter into an empty line, which has no caret rectangle of its own', async () => {
  below()
  const app = setup(paragraphs(1))
  app.attachment.focus(caret('p0-t', 6))
  for (let line = 0; line < 20; line++) await userEvent.keyboard('{Enter}')
  expect(lastLine(app.dom).bottom).toBeLessThanOrEqual(innerHeight + 1)
  expect(scrollY).toBeGreaterThan(0)
})

it('scrolls a box of its own, and not the window', async () => {
  const app = setup(paragraphs(1), { box: 100 })
  app.attachment.focus(caret('p0-t', 6))
  for (let line = 0; line < 15; line++) await userEvent.keyboard('{Enter}x')
  const edge = app.box.getBoundingClientRect()
  const box = lastLine(app.dom)
  expect(app.box.scrollTop).toBeGreaterThan(0)
  expect(box.bottom).toBeLessThanOrEqual(edge.bottom + 1)
  expect(scrollY).toBe(0)
})

it('keeps the caret in view at the bottom of a block taller than the box', async () => {
  const text = 'word '.repeat(600)
  const app = setup([paragraph('long', text)], { box: 100 })
  focusAt(app, caret('long-t', text.length))
  await userEvent.keyboard('x')
  const edge = app.box.getBoundingClientRect()
  const live = getSelection()!.getRangeAt(0).getBoundingClientRect()
  expect(live.height).toBeGreaterThan(0)
  expect(live.bottom).toBeLessThanOrEqual(edge.bottom + 1)
  expect(live.top).toBeGreaterThanOrEqual(edge.top - 1)
})

it('scrolls to the end of a selection the editor made, in code', async () => {
  const lines = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n')
  const app = setup(
    [
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'code',
        props: {},
        children: [{ type: 'Text', id: 'code-t', text: lines, marks: [] }],
      },
    ],
    { box: 100 },
  )
  focusAt(app, caret('code-t', 0))
  expect(app.box.scrollTop).toBe(0)
  await userEvent.keyboard('{Control>}a{/Control}')
  const edge = app.box.getBoundingClientRect()
  const focus = document.createRange()
  const selection = getSelection()!
  focus.setStart(selection.focusNode!, selection.focusOffset)
  const rect = focus.getClientRects()[0]!
  expect(app.box.scrollTop).toBeGreaterThan(0)
  expect(rect.bottom).toBeLessThanOrEqual(edge.bottom + 1)
})

it('scrolls nothing for typing the caret can already be seen at', async () => {
  const app = setup(paragraphs(80))
  scrollTo(0, 100)
  focusAt(app, caret('p20-t', 6))
  const before = scrollY
  expect(before).toBe(100)
  await userEvent.keyboard('{Enter}abc')
  expect(scrollY).toBe(before)
})

it('brings a caret hidden under the sticky bar down below it', async () => {
  below()
  const app = setup(paragraphs(80))
  const line = app.dom.root.children[3]!
  scrollTo(0, scrollY + line.getBoundingClientRect().top - BAR / 2)
  focusAt(app, caret('p3-t', 6))
  expect(line.getBoundingClientRect().top).toBeLessThan(BAR)
  await userEvent.keyboard('x')
  expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(BAR - 1)
})

it.each([
  ['an empty line', '<p>a</p><p><br></p>', (root: Element) => [root.children[1]!, 0] as const],
  ['after a line break', '<p>a<br><br></p>', (root: Element) => [root.children[0]!, 3] as const],
  [
    'an empty element',
    '<div style="height: 20px"></div>',
    (root: Element) => [root.children[0]!, 0] as const,
  ],
  [
    'the end of code after a newline',
    '<pre>' +
      'x'.repeat(5) +
      ('<br>' + 'x'.repeat(5)).repeat(30) +
      String.fromCharCode(10) +
      '</pre>',
    (root: Element) => {
      const text = root.children[0]!.lastChild!
      return [text, text.textContent!.length] as const
    },
  ],
])('draws a caret rectangle of one line for %s', (_name, html, position) => {
  const root = document.createElement('div')
  root.contentEditable = 'true'
  root.innerHTML = html
  document.body.append(root)
  const [node, offset] = position(root)
  const range = document.createRange()
  range.setStart(node, offset)
  const rect = caretRect(range)!
  const block = root.lastElementChild!.getBoundingClientRect()
  expect(rect.bottom - rect.top).toBeGreaterThan(0)
  expect(rect.bottom - rect.top).toBeLessThan(40)
  expect(rect.bottom).toBeLessThanOrEqual(block.bottom + 1)
  expect(rect.top).toBeGreaterThan(block.bottom - 60)
})

it('draws an empty line as its whole element, padding included', () => {
  const root = document.createElement('div')
  root.contentEditable = 'true'
  root.innerHTML = '<p style="padding-bottom: 12px"><br></p>'
  document.body.append(root)
  const range = document.createRange()
  range.setStart(root.children[0]!, 0)
  expect(caretRect(range)!.bottom).toBeGreaterThanOrEqual(
    root.children[0]!.getBoundingClientRect().bottom - 1,
  )
})

it('draws the caret at the start of a long paragraph as a line, not the block', () => {
  const root = document.createElement('div')
  root.contentEditable = 'true'
  root.innerHTML = '<p>' + 'word '.repeat(300) + '</p>'
  document.body.append(root)
  const range = document.createRange()
  range.setStart(root.children[0]!, 0)
  const rect = caretRect(range)!
  expect(rect.bottom - rect.top).toBeLessThan(40)
  expect(rect.top).toBeLessThan(root.getBoundingClientRect().top + 40)
})

it('does not move the page for another person’s edit while the caret is out of view', async () => {
  const app = setup(paragraphs(80))
  app.attachment.focus(caret('p0-t', 6))
  scrollTo(0, 800)
  await settle()
  const before = scrollY
  const remote = RichText.run(
    { document: app.attachment.current().content, selection: caret('p0-t', 6) },
    { type: 'InsertText', text: '!' },
    { mint: () => 'remote' },
  )
  if (!remote.ok) throw new Error(remote.error)
  app.attachment.sync(
    { document: remote.state.document, selection: caret('p0-t', 6) },
    remote.changeSet,
  )
  await settle()
  expect(scrollY).toBe(before)
})

it('moves neither the focus nor the page when a control holds the focus as the edit is drawn', async () => {
  const button = document.createElement('button')
  const app = setup(paragraphs(80), { held: true })
  document.body.append(button)
  app.attachment.focus(caret('p79-t', 7))
  await userEvent.keyboard('{Enter}')
  button.focus()
  scrollTo(0, 0)
  await settle()
  app.flush()
  await settle()
  expect(document.activeElement).toBe(button)
  expect(scrollY).toBe(0)
})

it('scrolls to the caret a programmatic focus puts back', async () => {
  const app = setup(paragraphs(80))
  app.attachment.focus(caret('p70-t', 2))
  await settle()
  const box = app.dom.root.children[70]!.getBoundingClientRect()
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(innerHeight)
})
