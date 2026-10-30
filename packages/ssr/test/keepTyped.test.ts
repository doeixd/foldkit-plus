// @vitest-environment jsdom
/**
 * #356: what is typed into a kept field before the script runs reaches the
 * Model as the field's own Message, once, and the field keeps its text, its
 * caret and its focus: it is the element the server rendered. A field that
 * does not opt in is re-asserted to what the server rendered.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { KEEP_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config, field, load, plan, seen, settle, template, typeInto } from './keepTypedFixture.js'

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
