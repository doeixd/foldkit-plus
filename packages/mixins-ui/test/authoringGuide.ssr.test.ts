// @vitest-environment jsdom
/**
 * The guide's chip filter rendered on a server and parsed back as a browser
 * would: the listbox, its chips and their state are in the markup before any
 * script runs, and the focus marks `FocusRecovery` reads are there too.
 */
import { expect, test } from 'vitest'
import { Conformance } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { CHIPS, FilterChips, Picks, initialOf, update } from './authoringGuide.js'
import { parsed } from './ssr.js'

const model = update(
  initialOf('f', CHIPS).model,
  Picks.wrapper.make(Selection.Message.Activated({ id: 'f-urgent' })),
).model

test('a served filter parses back to a named multiselectable listbox with each chip and its state', async () => {
  const page = await parsed(model, FilterChips)
  expect(
    Conformance.failures(
      Conformance.server('listbox', page.body, [
        { role: 'listbox', name: 'Filters', attributes: { 'aria-multiselectable': 'true' } },
        { role: 'option', name: 'Open', attributes: { 'aria-selected': 'false', tabindex: '0' } },
        { role: 'option', name: 'Urgent', attributes: { 'aria-selected': 'true', tabindex: '-1' } },
      ]),
    ),
  ).toEqual([])
  const chips = Array.from(page.querySelectorAll('[role="option"]'))
  expect(chips.map(chip => chip.textContent)).toEqual(['Open', 'Mine', 'Urgent', 'Stale'])
  expect(chips.every(chip => chip.getAttribute('data-fk-focus-part') === 'chip')).toBe(true)
  expect(page.querySelector('button')?.textContent).toBe('Remove picked')
})
