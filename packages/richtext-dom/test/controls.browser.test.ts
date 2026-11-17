/**
 * The editor and the controls beside it, in a real browser with real presses and keys: a press on
 * a control in a marked container leaves the focus and the selection in the text; while a control
 * does hold the focus, the Model's selection is neither overwritten by what the browser does to
 * its own nor lost from view, and it is the browser's again when the focus returns.
 */
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as RichText from 'foldkit-richtext'
import { attach, CONTROLS_ATTRIBUTE, readSelection, SELECTION_DECORATION } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const range = (from: number, to: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id('t'), offset: from, affinity: 'after' },
  focus: { node: id('t'), offset: to, affinity: 'after' },
})

const content = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'Milk', marks: [] }] },
  ],
})

const emptyLine = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: '', marks: [] }] },
  ],
})

/** A bar of marked controls before the editor, and a control that is nobody's after it. */
const setup = (document_: RichText.Document = content) => {
  const bar = document.createElement('div')
  bar.setAttribute(CONTROLS_ATTRIBUTE, '')
  const bold = document.createElement('button')
  bold.textContent = 'Bold'
  const field = document.createElement('input')
  bar.append(bold, field)
  const plain = document.createElement('button')
  plain.textContent = 'Plain'
  const dom = mount(document, document_)
  document.body.append(bar, dom.root, plain)
  let state: RichText.EditorState = { document: dom.content, selection: null }
  const reported: Array<RichText.Selection | null> = []
  let minted = 0
  const mint = () => `minted-${++minted}`
  const attachment = attach(dom, {
    onSelection: selection => {
      state = { ...state, selection }
      reported.push(selection)
    },
    onIntent: command => {
      const result = RichText.run(state, command, { mint })
      if (!result.ok) throw new Error(result.error)
      state = result.state
      attachment.sync(result.state, result.changeSet)
      attachment.answered()
    },
  })
  let clicks = 0
  bold.addEventListener('click', () => {
    clicks += 1
  })
  /** A command sent from a control, run over the Model's selection and drawn. */
  const send = (command: RichText.Command) => {
    const result = RichText.run(state, command, { mint })
    if (!result.ok) throw new Error(result.error)
    state = result.state
    attachment.sync(result.state, result.changeSet)
  }
  return {
    bold,
    field,
    plain,
    attachment,
    reported,
    toggle: (mark: string) => send({ type: 'ToggleMark', mark }),
    send,
    clicks: () => clicks,
    state: () => state,
    root: () => attachment.current().root,
  }
}

const settle = () =>
  new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
const standIn = () =>
  Array.from(document.querySelectorAll(`[data-decoration="${SELECTION_DECORATION}"]`))
    .map(element => element.textContent)
    .join('')
const selected = () => getSelection()?.toString()
/** A range's ends in the one run: affinity is the browser's to choose, so it is left out. */
const offsets = (selection: RichText.Selection | null) =>
  selection?.type === 'Range' ? [selection.anchor.offset, selection.focus.offset] : selection

afterEach(() => {
  document.body.replaceChildren()
})

it('a press on a marked control leaves the focus and the selection in the text, and still clicks', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await userEvent.click(page.bold)
  expect(page.clicks()).toBe(1)
  expect(document.activeElement).toBe(page.root())
  expect(selected()).toBe('Milk')
})

it('a press on a control nothing marks takes the focus', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await userEvent.click(page.plain)
  expect(document.activeElement).toBe(page.plain)
})

it('a press on a field among marked controls takes the focus, so it can be typed in', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await userEvent.click(page.field)
  expect(document.activeElement).toBe(page.field)
})

it('a press on a marked control takes the focus from another control, which the editor does not hold it for', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  page.plain.focus()
  await userEvent.click(page.bold)
  expect(document.activeElement).toBe(page.bold)
})

it('what the browser does to its selection while a control has the focus is not the Model’s', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  expect(offsets(page.state().selection)).toEqual([0, 4])
  page.plain.focus()
  const before = page.reported.length
  // The patch that drew the stand-in left the browser's range collapsed where its text was.
  expect(page.root().contains(getSelection()!.anchorNode)).toBe(true)
  expect(selected()).toBe('')
  // Chromium says nothing of a range a patch moved; an engine that does sends this.
  document.dispatchEvent(new Event('selectionchange'))
  expect(document.activeElement).toBe(page.plain)
  expect(page.reported.length).toBe(before)
  expect(offsets(page.state().selection)).toEqual([0, 4])
})

it('a selection made just before the focus leaves is the Model’s, though the browser says so later', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  const text = page.root().querySelector('[data-run]')!.firstChild!
  // As a press or a key leaves it: set, and the focus gone before `selectionchange` is sent.
  getSelection()!.setBaseAndExtent(text, 1, text, 3)
  page.plain.focus()
  expect(offsets(page.state().selection)).toEqual([1, 3])
  expect(standIn()).toBe('il')
  await settle()
  expect(offsets(page.state().selection)).toEqual([1, 3])
})

it('the focus moving from one control to another leaves the Model’s selection alone', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  page.bold.focus()
  expect(document.activeElement).toBe(page.bold)
  expect(offsets(page.state().selection)).toEqual([0, 4])
  expect(standIn()).toBe('Milk')
})

it('two commands from a control that has the focus act on the same text', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  expect(document.activeElement).toBe(page.plain)
  page.toggle('Bold')
  await settle()
  page.toggle('Italic')
  await settle()
  expect(offsets(page.state().selection)).toEqual([0, 4])
  expect([...RichText.marksInRange(page.state().document, page.state().selection)].sort()).toEqual([
    'Bold',
    'Italic',
  ])
  expect(document.activeElement).toBe(page.plain)
})

it('draws the selection as a decoration while a control has the focus', async () => {
  const page = setup()
  page.attachment.focus(range(1, 3))
  await settle()
  expect(standIn()).toBe('')
  await userEvent.tab()
  expect(document.activeElement).toBe(page.plain)
  expect(standIn()).toBe('il')
  expect(page.root().textContent).toBe('Milk')
})

it('draws a selection made backwards', async () => {
  const page = setup()
  page.attachment.focus(range(3, 1))
  await settle()
  await userEvent.tab()
  expect(standIn()).toBe('il')
})

it('draws nothing for a caret', async () => {
  const page = setup()
  page.attachment.focus(range(2, 2))
  await settle()
  await userEvent.tab()
  expect(document.activeElement).toBe(page.plain)
  expect(standIn()).toBe('')
})

it('draws nothing for a caret on an empty line, where a decoration of no text would still show', async () => {
  const page = setup(emptyLine)
  page.attachment.focus(range(0, 0))
  await settle()
  await userEvent.tab()
  expect(document.activeElement).toBe(page.plain)
  expect(page.root().querySelector('[data-decoration]')).toBeNull()
})

it('keeps the selection drawn through a command sent from the control', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  page.toggle('Bold')
  expect(standIn()).toBe('Milk')
  expect(page.root().querySelector('strong')?.textContent).toBe('Milk')
  expect(document.activeElement).toBe(page.plain)
})

it('draws the selection a command from the control moved', async () => {
  const page = setup()
  page.attachment.focus(range(1, 3))
  await settle()
  await userEvent.tab()
  page.send({ type: 'SetSelection', selection: range(0, 2) })
  expect(standIn()).toBe('Mi')
  page.send({ type: 'SetSelection', selection: range(2, 2) })
  expect(standIn()).toBe('')
  expect(document.activeElement).toBe(page.plain)
})

it('keeps the selection drawn through a decoration refresh, as another person’s caret makes', async () => {
  const page = setup()
  page.attachment.focus(range(1, 3))
  await settle()
  await userEvent.tab()
  page.attachment.redecorate()
  expect(standIn()).toBe('il')
  expect(document.activeElement).toBe(page.plain)
})

it('gives the selection back to the browser when a key returns the focus to the text', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  page.toggle('Bold')
  await userEvent.tab({ shift: true })
  expect(document.activeElement).toBe(page.root())
  expect(standIn()).toBe('')
  expect(selected()).toBe('Milk')
  expect(offsets(readSelection(page.attachment.current()))).toEqual([0, 4])
  await userEvent.keyboard('o')
  expect(page.root().textContent).toBe('o')
})

it('gives the selection back to the browser when `focus` returns to the text', async () => {
  const page = setup()
  page.attachment.focus(range(1, 3))
  await settle()
  await userEvent.tab()
  expect(standIn()).toBe('il')
  page.attachment.focus(range(0, 4))
  expect(standIn()).toBe('')
  expect(selected()).toBe('Milk')
})

it('a press back in the text puts the caret where it was pressed, with nothing left drawn', async () => {
  const page = setup()
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  expect(standIn()).toBe('Milk')
  await userEvent.click(page.root())
  await settle()
  expect(document.activeElement).toBe(page.root())
  expect(standIn()).toBe('')
  expect(selected()).toBe('')
  const caret = offsets(page.state().selection)
  expect(Array.isArray(caret) && caret[0] === caret[1]).toBe(true)
})

it('leaves the focus on a control inside the text that it moved to', async () => {
  const page = setup()
  // As an atom draws one: a control of its own inside the editor's subtree.
  const inner = document.createElement('button')
  inner.contentEditable = 'false'
  page.root().append(inner)
  page.attachment.focus(range(0, 4))
  await settle()
  await userEvent.tab()
  inner.focus()
  expect(standIn()).toBe('')
  expect(document.activeElement).toBe(inner)
})
