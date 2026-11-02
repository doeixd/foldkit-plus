// @vitest-environment jsdom
/**
 * #356: what is typed into a kept field before the script runs reaches the
 * Model as the field's own Message, once, and the field keeps its text, its
 * caret and its focus: it is the element the server rendered. A field that
 * does not opt in is re-asserted to what the server rendered.
 */
import { Effect, Result } from 'effect'
import { expect, it, vi } from 'vitest'
import { KEEP_ATTRIBUTE, SSR, type DecodedBinding } from 'foldkit-ssr'
import { changed, hold, keptFields, restore, typedMessages, type KeptField } from '../src/keep.js'
import { config, field, load, plan, seen, settle, template, typeInto } from './keepTypedFixture.js'

const change: DecodedBinding = {
  attribute: 'OnChange',
  event: 'change',
  message: { _tag: 'Changed', value: '' },
  hole: ['value'],
}

/** The kept fields a page holding `markup` would read, each bound to `change`. */
const keptFieldsOf = (markup: string): ReadonlyArray<KeptField> => {
  const root = document.createElement('main')
  root.innerHTML = markup
  const read = keptFields(root, [change])
  if (Result.isFailure(read)) throw new Error(read.failure)
  return read.success
}

const only = (fields: ReadonlyArray<KeptField>): KeptField => {
  const [field] = fields
  if (field === undefined) throw new Error('no kept field')
  return field
}

const selectOf = (field: KeptField): HTMLSelectElement => {
  if (!(field.element instanceof HTMLSelectElement)) throw new Error('not a select')
  return field.element
}

it('replays each changed kept field once and keeps its caret', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))))
  const query = field('query', HTMLInputElement)
  const note = field('note', HTMLTextAreaElement)
  const size = field('size', HTMLSelectElement)
  const title = field('title', HTMLInputElement)
  expect(query.getAttribute(KEEP_ATTRIBUTE)).toBe('0')

  // Typed while the script was on its way: the caret was moved back two.
  typeInto(title, 'Draft two')
  size.value = 'l'
  typeInto(query, 'atlas', 3)
  expect(document.getElementById('clear')).not.toBeNull()

  SSR.hydrate(config, plan(), { buildId: 'b' })

  await vi.waitFor(() => expect(field('echo', HTMLElement).textContent).toBe('atlas'))
  await settle()
  expect(field('query', HTMLInputElement)).toBe(query)
  expect(query.value).toBe('atlas')
  expect([query.selectionStart, query.selectionEnd]).toEqual([3, 3])
  expect(document.activeElement).toBe(query)
  expect(field('summary', HTMLElement).textContent).toBe('first/l')
  // In document order, each once; the textarea was not touched, so it sent nothing.
  expect(seen.map(message => message._tag)).toEqual(['ChangedQuery', 'ChangedSize'])
  expect(note.value).toBe('first')
  // Not kept: the served title is back, and nothing told update otherwise.
  expect(title.value).toBe('Draft')
  expect(document.querySelector(`[${KEEP_ATTRIBUTE}]`)).toBeNull()

  // The live page answers from here, at the caret the person left.
  query.setRangeText('-', 3, 3, 'end')
  query.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(field('echo', HTMLElement).textContent).toBe('atl-as'))
  expect(seen).toHaveLength(3)
})

// #451: a select's served selection is the browser's, not the first option
// whose own `disabled` is false, and a multiple select holds a set.
it('sends nothing for an untouched select whose first option is in a disabled optgroup', () => {
  const grouped = only(
    keptFieldsOf(
      `<select ${KEEP_ATTRIBUTE}="0"><optgroup disabled><option value="a">A</option></optgroup><option value="b">B</option></select>`,
    ),
  )
  // The browser starts on B: A is disabled through its group.
  expect(selectOf(grouped).value).toBe('b')
  expect(changed(grouped)).toBe(false)
  expect(typedMessages([grouped])).toEqual([])
})

it('sends nothing for an untouched listbox select with no selection', () => {
  const listbox = only(
    keptFieldsOf(
      `<select size="2" ${KEEP_ATTRIBUTE}="0"><option value="a">A</option><option value="b">B</option></select>`,
    ),
  )
  // A select showing more than one row starts with nothing chosen.
  expect(selectOf(listbox).value).toBe('')
  expect(changed(listbox)).toBe(false)
  expect(typedMessages([listbox])).toEqual([])
})

it('sends nothing for an untouched multiple select with nothing selected', () => {
  const picked = only(
    keptFieldsOf(`<select multiple ${KEEP_ATTRIBUTE}="0"><option value="a">A</option></select>`),
  )
  expect(selectOf(picked).value).toBe('')
  expect(changed(picked)).toBe(false)
  expect(typedMessages([picked])).toEqual([])
})

it('sends for a multiple select when a second option joins the served one', () => {
  const picked = only(
    keptFieldsOf(
      `<select multiple ${KEEP_ATTRIBUTE}="0"><option value="a" selected>A</option><option value="b">B</option></select>`,
    ),
  )
  const select = selectOf(picked)
  const [, second] = Array.from(select.options)
  if (second === undefined) throw new Error('fewer than two options')
  // The served first option is still `.value`, so only the set tells this apart.
  second.selected = true
  expect(select.value).toBe('a')
  expect(changed(picked)).toBe(true)
  expect(typedMessages([picked])).toHaveLength(1)
})

it('keeps every selected option of a changed multiple select', () => {
  const picked = only(
    keptFieldsOf(
      `<select multiple ${KEEP_ATTRIBUTE}="0"><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>`,
    ),
  )
  const select = selectOf(picked)
  const [first, , last] = Array.from(select.options)
  if (first === undefined || last === undefined) throw new Error('fewer than three options')
  first.selected = true
  last.selected = true
  expect(changed(picked)).toBe(true)

  const held = hold([picked])
  expect(held.map(entry => entry.selected)).toEqual([[0, 2]])

  // The first render re-asserts the served selection, which is none.
  for (const option of Array.from(select.options)) option.selected = false
  restore(held)
  expect(Array.from(select.options).map(option => option.selected)).toEqual([true, false, true])
})
