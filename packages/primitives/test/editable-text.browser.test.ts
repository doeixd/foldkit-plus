/**
 * `EditableText` in a real browser, typed into with real keys: what jsdom has
 * no `innerText`, `contenteditable` or input method for.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { userEvent } from 'vitest/browser'
import { afterEach, expect, it, vi } from 'vitest'
import {
  EditAsked,
  EditableText,
  TextCancelled,
  TextCommitted,
  TextEdited,
  type TextFact,
} from '../src/dom/editable-text.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * A container with a field `title` holding `text`, editable as `editable` says,
 * focused with the caret at its end; and every fact the Mount reports.
 */
const mount = async (
  text: string,
  options: { readonly multiline?: boolean; readonly editable?: string } = {},
) => {
  const container = document.createElement('div')
  const field = document.createElement('span')
  field.setAttribute('data-field', 'title')
  field.contentEditable = options.editable ?? 'plaintext-only'
  if (options.multiline === true) field.setAttribute('aria-multiline', 'true')
  field.textContent = text
  container.appendChild(field)
  const outside = document.createElement('button')
  document.body.append(container, outside)
  const facts: Array<TextFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(
      EditableText({ attribute: 'data-field' }).f(container, liveViewStateChanges),
      fact => Effect.sync(() => facts.push(fact)),
    ),
  )
  // Let the Mount attach before anything happens.
  await new Promise(resolve => setTimeout(resolve, 20))
  field.focus()
  const caret = document.createRange()
  caret.selectNodeContents(field)
  caret.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(caret)
  return {
    field,
    outside,
    facts,
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  }
}

it('reports each change as text, and Enter commits it', async () => {
  const { facts, stop } = await mount('Hi')
  try {
    await userEvent.keyboard('!!')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(facts).toEqual([
        TextEdited.make({ field: 'title', text: 'Hi!' }),
        TextEdited.make({ field: 'title', text: 'Hi!!' }),
        TextCommitted.make({ field: 'title', text: 'Hi!!' }),
      ]),
    )
  } finally {
    await stop()
  }
})

it('cancels on Escape, puts the text it began with back, and commits nothing on leaving', async () => {
  const { field, outside, facts, stop } = await mount('Hi')
  try {
    await userEvent.keyboard('ya')
    await userEvent.keyboard('{Escape}')
    expect(field.innerText).toBe('Hi')
    outside.focus()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(facts.slice(-1)).toEqual([TextCancelled.make({ field: 'title', initial: 'Hi' })])
    expect(facts.some(fact => fact._tag === 'TextCommitted')).toBe(false)
  } finally {
    await stop()
  }
})

it('commits once on leaving the field, and again only after it is begun again', async () => {
  const { field, outside, facts, stop } = await mount('Hi')
  const commits = () => facts.filter(fact => fact._tag === 'TextCommitted')
  try {
    await userEvent.keyboard('{Enter}')
    outside.focus()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(commits()).toHaveLength(1)
    field.focus()
    outside.focus()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(commits()).toHaveLength(2)
  } finally {
    await stop()
  }
})

it('breaks a line with Shift+Enter only in a multiline field', async () => {
  const multi = await mount('One', { multiline: true })
  try {
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}Two')
    await vi.waitFor(() =>
      expect(multi.facts.slice(-1)).toEqual([
        TextEdited.make({ field: 'title', text: 'One\nTwo' }),
      ]),
    )
    expect(multi.facts.some(fact => fact._tag === 'TextCommitted')).toBe(false)
  } finally {
    await multi.stop()
  }
  document.body.innerHTML = ''
  const single = await mount('One')
  try {
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await vi.waitFor(() =>
      expect(single.facts).toEqual([TextCommitted.make({ field: 'title', text: 'One' })]),
    )
  } finally {
    await single.stop()
  }
})

it('reports nothing while an input method composes, then the composed text once', async () => {
  const { field, facts, stop } = await mount('Hi')
  try {
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    field.textContent = 'Hiか'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    field.textContent = 'Hi火'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    // Enter picks the candidate: the input method's key, not the field's.
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    )
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    // Chrome sends no input after the composition: its end reports the text.
    await vi.waitFor(() =>
      expect(facts).toEqual([TextEdited.make({ field: 'title', text: 'Hi火' })]),
    )
    // As Firefox does, an input of the same text after the composition, reported no more.
    field.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(facts).toEqual([TextEdited.make({ field: 'title', text: 'Hi火' })])
  } finally {
    await stop()
  }
})

it('pastes markup as text where the field is not plaintext-only, and one line as one', async () => {
  const { field, facts, stop } = await mount('A', { editable: 'true' })
  try {
    const data = new DataTransfer()
    data.setData('text/html', '<b>bold</b><br>next')
    data.setData('text/plain', 'bold\nnext')
    field.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    )
    expect(field.innerHTML).not.toContain('<b>')
    await vi.waitFor(() =>
      expect(facts.slice(-1)).toEqual([TextEdited.make({ field: 'title', text: 'Abold next' })]),
    )
  } finally {
    await stop()
  }
})

it('turns the lines a paste brings into one, in a one-line field', async () => {
  const { field, facts, stop } = await mount('A')
  // Copied as a person would: selected text, and the keys.
  const source = document.createElement('textarea')
  source.value = ['one', 'two'].join(String.fromCharCode(10))
  document.body.appendChild(source)
  try {
    source.select()
    await userEvent.keyboard('{Control>}c{/Control}')
    field.focus()
    const caret = document.createRange()
    caret.selectNodeContents(field)
    caret.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(caret)
    await userEvent.keyboard('{Control>}v{/Control}')
    await vi.waitFor(() =>
      expect(facts.slice(-1)).toEqual([TextEdited.make({ field: 'title', text: 'Aone two' })]),
    )
  } finally {
    await stop()
  }
})

it('asks for a field to be edited on a double-click, and not once it is editable', async () => {
  const { field, facts, stop } = await mount('Hi', { editable: 'false' })
  try {
    await userEvent.dblClick(field)
    await vi.waitFor(() => expect(facts).toEqual([EditAsked.make({ field: 'title' })]))
    field.contentEditable = 'plaintext-only'
    await userEvent.dblClick(field)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(facts).toEqual([EditAsked.make({ field: 'title' })])
  } finally {
    await stop()
  }
})

it('focuses a field when it becomes editable, the caret at its end', async () => {
  const { field, outside, facts, stop } = await mount('Hi', { editable: 'false' })
  try {
    outside.focus()
    field.contentEditable = 'plaintext-only'
    await vi.waitFor(() => expect(document.activeElement).toBe(field))
    await userEvent.keyboard('!')
    await vi.waitFor(() =>
      expect(facts.slice(-1)).toEqual([TextEdited.make({ field: 'title', text: 'Hi!' })]),
    )
    // Once: a later change on the page does not take focus back from where it went.
    outside.focus()
    field.parentElement?.appendChild(document.createElement('i'))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(document.activeElement).toBe(outside)
  } finally {
    await stop()
  }
})
