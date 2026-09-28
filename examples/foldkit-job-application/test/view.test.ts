/**
 * The views drawn inert. What sits inside an `h.submodel` has no runtime frame
 * to be drawn in, so each view a submodel shows is drawn on its own: the step
 * layout on the Review step (the others place a step's submodel), the
 * navigation, the preview, the cover letter, and a field in every state. The
 * steps built around `@foldkit/ui` submodels are covered by `runtime.test.ts`.
 */
import type { Tabs } from '@foldkit/ui'
import { FieldValidation } from 'foldkit'
import type { Html } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import { Slots, SlotView, Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Step } from '../src/domain/index.js'
import { Message } from '../src/message.js'
import { type Model, Submission } from '../src/model.js'
import {
  CoverLetterView,
  type Model as CoverLetterModel,
} from '../src/step/coverLetter/coverLetter.js'
import { stylesheet } from '../src/style.js'
import { Field } from '../src/view/index.js'
import { Preview } from '../src/view/preview.js'
import { Navigation, StepLayout } from '../src/view/view.js'
import { completeModel, initialModel } from './fixtures.js'

/** The tabs as `@foldkit/ui` hands them to `toView`, less the attributes a runtime gives. */
const tabsOn = (currentStep: Step.Step): Tabs.RenderInfo<Step.Step> => ({
  tablist: [],
  tabs: Step.all.map((value, index) => ({
    value,
    index,
    isActive: value === currentStep,
    isFocused: false,
    isDisabled: false,
    tab: [],
    panel: [],
  })),
  activeIndex: Step.indexOf(currentStep),
})

const onReview = (model: Model): Model => modifyFields(model, { currentStep: () => 'Review' })

/** The step layout on Review, where no step's submodel is placed. */
const layout = (model: Model, attentionSteps: ReadonlyArray<Step.Step> = []) =>
  Inert.draw(StepLayout, { model: onReview(model), attentionSteps, render: tabsOn('Review') })

const withSubmission = (submission: Submission): Model =>
  modifyFields(completeModel, { submission: () => submission })

const typing = (content: string): CoverLetterModel => ({ content })

/** One field, drawn alone through the helper every step uses. */
const FieldAlone = SlotView.forMessages<Message>().define(
  Slots.define({}),
  (field: FieldValidation.Field<string>, _, h) =>
    Field.input({ id: 'name', label: 'Name', field, onInput: () => Message.ToggledPreview() }, h),
)

const fields = {
  idle: FieldValidation.NotValidated({ value: '' }),
  checking: FieldValidation.Validating({ value: 'jane@example.com' }),
  valid: FieldValidation.Valid({ value: 'Jane' }),
  invalid: FieldValidation.Invalid({ value: 'J', errors: ['Too short'] }),
}

const trees = [
  layout(initialModel),
  layout(modifyFields(initialModel, { isSubmitAttempted: () => true }), ['PersonalInfo']),
  layout(modifyFields(completeModel, { isPreviewVisible: () => true })),
  layout(withSubmission(Submission.Submitting())),
  layout(withSubmission(Submission.SubmitSuccess())),
  layout(withSubmission(Submission.SubmitError({ error: 'Network down' }))),
  ...Step.all.map(step =>
    Inert.draw(Navigation, modifyFields(initialModel, { currentStep: () => step })),
  ),
  Inert.draw(Preview, completeModel),
  ...['', 'x'.repeat(1850), 'x'.repeat(2001)].map(content =>
    Inert.draw(CoverLetterView, typing(content)),
  ),
  ...Object.values(fields).map(field => Inert.draw(FieldAlone, field)),
]

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

const byText = (tree: Html, text: string): ReadonlyArray<InertNode> =>
  Inert.all(tree).filter(node => Inert.text(node) === text)

describe('the application', () => {
  test('draws every element through a Slot, so a Style can reach all of it', () => {
    for (const tree of trees) expect(Inert.unslotted(tree)).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      trees.flatMap(tree =>
        [...cssOf(Inert.all(tree)).matchAll(/var\((--fk-[\w-]+)\)/g)].map(([, name]) => name),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
  })
})

describe('the step tabs', () => {
  test.each([
    ['PersonalInfo', 'Completed', true, '!'],
    ['WorkHistory', 'Completed', false, '✓'],
    ['Review', 'Current', false, '7'],
  ] as const)('mark %s %s, needing attention: %s, with %j', (step, status, attention, glyph) => {
    const tree = layout(initialModel, ['PersonalInfo'])
    const button = Inert.byTag(tree, 'button').find(node =>
      Inert.text(node).endsWith(Step.show(step)),
    )
    expect(Inert.value(button!, 'data-status')).toBe(status)
    expect(Inert.value(button!, 'data-attention') !== undefined).toBe(attention)
    expect(Inert.text(button!)).toBe(`${glyph}${Step.show(step)}`)
  })
})

describe('the fields', () => {
  test.each([
    ['checking', 'var(--fk-info-default)', '◐'],
    ['valid', 'var(--fk-success-default)', '✓'],
    ['invalid', 'var(--fk-error-default)', undefined],
  ] as const)('border a %s field and mark it as upstream does', (state, color, mark) => {
    const tree = Inert.draw(FieldAlone, fields[state])
    const [input] = Inert.byTag(tree, 'input')
    expect(cssOf([input!])).toContain(`border-color:${color}`)
    const idle = Inert.byTag(Inert.draw(FieldAlone, fields.idle), 'input')
    expect(cssOf(idle)).not.toContain(`border-color:${color}`)
    expect(['◐', '✓'].filter(glyph => byText(tree, glyph).length > 0)).toEqual(
      mark === undefined ? [] : [mark],
    )
  })

  test('describes an invalid field by its first error', () => {
    const tree = Inert.draw(FieldAlone, fields.invalid)
    const [input] = Inert.byTag(tree, 'input')
    const describedBy = Inert.value(input!, 'aria-describedby')
    const description = Inert.all(tree).find(node => Inert.value(node, 'id') === describedBy)
    expect(description && Inert.text(description)).toBe('Too short')
  })
})

describe('the cover letter', () => {
  test.each([
    ['2000 characters remaining', '', 'Plenty'],
    ['200 characters remaining', 'x'.repeat(1800), 'Nearly'],
    ['-1 characters remaining', 'x'.repeat(2001), 'Over'],
  ])('counts down to %j', (words, content, state) => {
    const tree = Inert.draw(CoverLetterView, typing(content))
    const [counter] = byText(tree, words)
    expect(counter && Inert.value(counter, 'data-state')).toBe(state)
  })
})

describe('the preview toggle', () => {
  test.each([
    [false, 'Preview'],
    [true, 'Hide Preview'],
  ])('when the preview is shown: %s, reads %j and draws the overlay', (isPreviewVisible, label) => {
    const tree = layout(modifyFields(initialModel, { isPreviewVisible: () => isPreviewVisible }))
    const toggle = Inert.byTag(tree, 'button').find(node => Inert.text(node) === label)
    expect(toggle).toBeDefined()
    // The live preview's name is drawn in the sidebar, and again in the overlay.
    expect(
      Inert.byTag(tree, 'h2').filter(heading => Inert.text(heading) === 'Your Name'),
    ).toHaveLength(isPreviewVisible ? 2 : 1)
  })
})
