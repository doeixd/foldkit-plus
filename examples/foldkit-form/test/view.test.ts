import { FieldValidation } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { type Message, type Model, Page, initialModel, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { withFields } from './fixtures.js'

/** Every field state at once: a check mark, a spinner, an error. */
const busyModel = withFields({
  name: FieldValidation.Valid({ value: 'Alice' }),
  email: FieldValidation.Validating({ value: 'alice@example.com' }),
  messageText: FieldValidation.Invalid({ value: 'x', errors: ['Too short'] }),
})

const withSubmission = (submission: Model['submission']): Model =>
  modifyFields(busyModel, { submission: () => submission })

const trees = [
  Inert.draw(Page, initialModel),
  Inert.draw(
    Page,
    withSubmission({ _tag: 'SubmitSuccess', confirmationText: 'Welcome to the waitlist!' }),
  ),
  Inert.draw(Page, withSubmission({ _tag: 'SubmitError', error: 'Sorry.' })),
]

describe('the waitlist page', () => {
  test('is titled as upstream is', () => {
    expect(view(initialModel, SlotView.inertBuilder<Message>()).title).toBe('Foldkit Form Example')
  })

  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('colors a field by its state: blue while checked, green once valid', () => {
    const [, busy] = trees
    const [name, email] = Inert.byTag(busy!, 'input')
    expect(Inert.css([email!])).toContain('border-color:var(--fk-accent-default)')
    expect(Inert.css([name!])).toContain('border-color:var(--fk-success-default)')
    const [idle] = Inert.byTag(trees[0]!, 'input')
    expect(Inert.css([idle!])).not.toMatch(/border-color:var\(--fk-(accent|success)-default\)/)
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    for (const tree of trees) {
      expect(Inert.css(Inert.all(tree!))).toContain('var(--fk-')
      expect(Inert.missingTokens(tree!, stylesheet)).toEqual([])
    }
  })
})
