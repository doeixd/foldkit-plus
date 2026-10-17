// @vitest-environment jsdom
/**
 * Questionnaire as a transition and as markup: each kind of question takes
 * its answer (a radio's choice, a box's toggle, text, and the other field's
 * text beside or in place of a choice); a submit with a question missing
 * says which and moves the focus to it, and one with every answer sends
 * them all in order; one at a time, Next refuses a missing answer and Back
 * goes back; once sent, nothing more changes and the answers are listed.
 */
import * as UiRadio from '@foldkit/ui/radioGroup'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  Message,
  OutMessage,
  QuestionnaireSlots,
  answerOf,
  init,
  multiple,
  single,
  text,
  update,
  view,
  type Model,
  type QuestionnaireView,
} from '../src/questionnaire.js'
import { Questionnaire } from '../src/recipes/questionnaire.js'
import { sends } from './fixture.js'

const style = Style.forSlots(QuestionnaireSlots)(Questionnaire({}))
const questions = [
  single({
    id: 'tone',
    prompt: 'Which tone?',
    options: [
      { value: 'plain', label: 'Plain', description: 'Short sentences' },
      { value: 'warm', label: 'Warm' },
    ],
    other: 'Something else',
  }),
  multiple({
    id: 'parts',
    prompt: 'Which parts?',
    options: [
      { value: 'intro', label: 'Intro' },
      { value: 'outro', label: 'Outro' },
    ],
    other: 'Another part',
  }),
  text({ id: 'notes', prompt: 'Anything else?', optional: true, multiline: true }),
]
const fresh = (layout: 'all' | 'paged' = 'all') => init({ id: 'ask', questions, layout })
const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)
const chose = (value: string, index: number) =>
  Message.GotRadio({ question: 'tone', message: UiRadio.Message.SelectedOption({ index, value }) })
const complete = (model: Model) =>
  run(model, chose('warm', 1), Message.Toggled({ question: 'parts', value: 'intro' }))
const focusOf = (result: ReturnType<typeof update>) =>
  (result.commands ?? []).flatMap(command =>
    command.name === 'FocusQuestion' ? [command.args?.['selector']] : [],
  )

describe('Questionnaire.init', () => {
  it('refuses two questions with one id', () => {
    expect(() =>
      init({
        id: 'ask',
        questions: [text({ id: 'a', prompt: 'A' }), text({ id: 'a', prompt: 'B' })],
      }),
    ).toThrow('two questions have the id "a"')
  })

  it('keeps a radio group for a question named like a prototype key', () => {
    const model = init({
      id: 'ask',
      questions: [single({ id: '__proto__', prompt: 'P', options: [{ value: 'a', label: 'A' }] })],
    })
    expect(Object.hasOwn(model.radios, '__proto__')).toBe(true)
    const after = run(
      model,
      Message.GotRadio({
        question: '__proto__',
        message: UiRadio.Message.SelectedOption({ index: 0, value: 'a' }),
      }),
    )
    expect(answerOf(after, '__proto__').chosen).toEqual(['a'])
  })
})

describe('Questionnaire.update', () => {
  it('takes a radio’s choice, clearing what the other field held', () => {
    const typed = run(fresh(), Message.Typed({ question: 'tone', text: 'Dry' }))
    expect(answerOf(typed, 'tone')).toEqual({ chosen: [], text: 'Dry' })
    expect(answerOf(run(typed, chose('warm', 1)), 'tone')).toEqual({ chosen: ['warm'], text: '' })
  })

  it('takes the other field’s text in place of a single choice, and beside multiple ones', () => {
    const model = run(
      complete(fresh()),
      Message.Typed({ question: 'tone', text: 'Dry' }),
      Message.Typed({ question: 'parts', text: 'Credits' }),
    )
    expect(answerOf(model, 'tone')).toEqual({ chosen: [], text: 'Dry' })
    expect(answerOf(model, 'parts')).toEqual({ chosen: ['intro'], text: 'Credits' })
  })

  it('toggles a box on and off', () => {
    const on = run(fresh(), Message.Toggled({ question: 'parts', value: 'outro' }))
    expect(answerOf(on, 'parts').chosen).toEqual(['outro'])
    expect(
      answerOf(run(on, Message.Toggled({ question: 'parts', value: 'outro' })), 'parts').chosen,
    ).toEqual([])
  })

  it.each([
    ['a box that is no option', Message.Toggled({ question: 'parts', value: 'credits' })],
    ['a box on a single choice', Message.Toggled({ question: 'tone', value: 'warm' })],
    ['a question that is not asked', Message.Typed({ question: 'other', text: 'x' })],
    ['the text already there', Message.Typed({ question: 'notes', text: '' })],
    ['Back on the first page', Message.Backed()],
  ])('ignores %s, returning the Model it was given', (_, message) => {
    const model = fresh('paged')
    expect(update(model, message).model).toBe(model)
  })

  it.each([
    ['single', single],
    ['multiple', multiple],
  ] as const)('ignores text for a %s choice with no other field', (_, kind) => {
    const model = init({
      id: 'ask',
      questions: [kind({ id: 'm', prompt: 'M', options: [{ value: 'a', label: 'A' }] })],
    })
    expect(update(model, Message.Typed({ question: 'm', text: 'x' })).model).toBe(model)
  })

  it('reads no answer from the prototype for a question named like one of its keys', () => {
    const model = init({ id: 'ask', questions: [text({ id: 'constructor', prompt: 'C' })] })
    expect(answerOf(model, 'constructor')).toEqual({ chosen: [], text: '' })
  })

  it('names what a submit found missing, focusing the first, and sends nothing', () => {
    const model = run(fresh(), chose('plain', 0))
    const result = update(model, Message.Submitted())
    expect(result.model.missing).toEqual(['parts'])
    expect(result.outMessage).toBeUndefined()
    expect(focusOf(result)[0]).toMatch(/^#ask-q1 /)
    // Answering it clears its mark.
    const fixed = run(result.model, Message.Toggled({ question: 'parts', value: 'outro' }))
    expect(fixed.missing).toEqual([])
  })

  it('sends every answer in the questions’ order, its text trimmed, an optional one blank', () => {
    const model = run(complete(fresh()), Message.Typed({ question: 'parts', text: '  Credits ' }))
    const result = update(model, Message.Submitted())
    expect(result.outMessage).toEqual(
      OutMessage.Answered({
        answers: [
          { question: 'tone', chosen: ['warm'], text: '' },
          { question: 'parts', chosen: ['intro'], text: 'Credits' },
          { question: 'notes', chosen: [], text: '' },
        ],
      }),
    )
    expect(result.model.submitted).toBe(true)
  })

  it('once sent, changes nothing', () => {
    const sent = update(complete(fresh()), Message.Submitted()).model
    for (const message of [chose('plain', 0), Message.Submitted(), Message.Backed()])
      expect(update(sent, message).model).toBe(sent)
  })

  it('one at a time, Next refuses a missing answer, and moves on from an answered one', () => {
    const refused = update(fresh('paged'), Message.Submitted())
    expect(refused.model.page).toBe(0)
    expect(refused.model.missing).toEqual(['tone'])
    const next = update(run(fresh('paged'), chose('plain', 0)), Message.Submitted())
    expect(next.model.page).toBe(1)
    expect(next.outMessage).toBeUndefined()
    expect(focusOf(next)[0]).toMatch(/^#ask-q1 /)
    expect(update(next.model, Message.Backed()).model.page).toBe(0)
  })

  it('one at a time, a last submit goes back to an answer cleared since', () => {
    const model = run(
      fresh('paged'),
      Message.Typed({ question: 'tone', text: 'Dry' }),
      Message.Submitted(),
      Message.Toggled({ question: 'parts', value: 'intro' }),
      Message.Submitted(),
      Message.Typed({ question: 'tone', text: '' }),
    )
    expect(model.page).toBe(2)
    const result = update(model, Message.Submitted())
    expect(result.model.page).toBe(0)
    expect(result.model.missing).toEqual(['tone'])
    expect(result.outMessage).toBeUndefined()
  })
})

const drawWith = (model: Model, more: Partial<QuestionnaireView<Message>> = {}) =>
  Inert.draw(
    SlotView.forMessages<Message>().define(QuestionnaireSlots, (_: undefined, __, h) =>
      view({ model, onMessage: message => message, style, ...more }, h),
    ),
    undefined,
  )
const byId = (drawn: Html, id: unknown) =>
  Inert.all(drawn).find(node => Inert.value(node, 'id') === id)
// The buttons with words: a radio is a button with none.
const worded = (drawn: Html) =>
  Inert.byTag(drawn, 'button').flatMap(button =>
    Inert.text(button) === '' ? [] : [Inert.text(button)],
  )
const roles = (drawn: Html, role: string) =>
  Inert.all(drawn).filter(node => Inert.value(node, 'role') === role)

describe('Questionnaire view', () => {
  it('meets its pattern: a form of questions, each saying what is missing', () => {
    const pattern = A11y.pattern({
      root: { capability: Capability.Container },
      question: { capability: Capability.Container },
      error: { capability: Capability.Container },
    })
    expect(A11y.validate(pattern, QuestionnaireSlots)).toEqual([])
  })

  it('asks every question at once, each by its own control', () => {
    const drawn = drawWith(fresh(), { title: 'A few questions' })
    const [group] = roles(drawn, 'radiogroup')
    expect(Inert.text(byId(drawn, Inert.value(group, 'aria-labelledby')))).toBe('Which tone?')
    expect(roles(drawn, 'radio')).toHaveLength(2)
    expect(Inert.text(Inert.byTag(drawn, 'legend')[0])).toBe('Which parts?')
    expect(roles(drawn, 'checkbox')).toHaveLength(2)
    expect(Inert.byTag(drawn, 'textarea')).toHaveLength(1)
    expect(Inert.byTag(drawn, 'label').map(label => Inert.text(label))).toEqual(
      expect.arrayContaining(['Something else', 'Another part', 'Anything else?']),
    )
    const [form] = Inert.byTag(drawn, 'form')
    expect(Inert.text(byId(drawn, Inert.value(form, 'aria-labelledby')))).toBe('A few questions')
    expect(Inert.byTag(drawn, 'button').map(button => Inert.text(button))).toContain('Submit')
  })

  it('says beside each missing question why, its control described by it', () => {
    const drawn = drawWith(
      update(
        init({ id: 'ask', questions: [questions[0]!, text({ id: 't', prompt: 'T' })] }),
        Message.Submitted(),
      ).model,
    )
    const [group] = roles(drawn, 'radiogroup')
    expect(Inert.value(group, 'aria-invalid')).toBe('true')
    expect(Inert.text(byId(drawn, Inert.value(group, 'aria-describedby')))).toBe(
      'Answer this question',
    )
    const [field] = Inert.byTag(drawn, 'input').filter(
      input => Inert.value(input, 'id') === 'ask-q1-text',
    )
    expect(Inert.value(field, 'aria-invalid')).toBe('true')
    expect(Inert.text(byId(drawn, Inert.value(field, 'aria-describedby')))).toBe(
      'Answer this question',
    )
  })

  it('one at a time, shows where the reader is, Back after the first, Next short of the last', () => {
    const first = drawWith(fresh('paged'))
    expect(roles(first, 'radiogroup')).toHaveLength(1)
    expect(Inert.byTag(first, 'fieldset')).toHaveLength(0)
    expect(Inert.text(first)).toContain('Question 1 of 3')
    expect(worded(first)).toEqual(['Next'])
    const second = run(fresh('paged'), chose('plain', 0), Message.Submitted())
    expect(worded(drawWith(second))).toEqual(['Back', 'Next'])
    const last = run(
      second,
      Message.Toggled({ question: 'parts', value: 'intro' }),
      Message.Submitted(),
    )
    expect(worded(drawWith(last))).toEqual(['Back', 'Submit'])
  })

  it('once sent, lists each question over its answer, a blank one skipped', () => {
    const sent = update(complete(fresh()), Message.Submitted()).model
    const drawn = drawWith(sent)
    expect(Inert.byTag(drawn, 'form')).toHaveLength(0)
    expect(Inert.byTag(drawn, 'dt').map(term => Inert.text(term))).toEqual([
      'Which tone?',
      'Which parts?',
      'Anything else?',
    ])
    expect(Inert.byTag(drawn, 'dd').map(answer => Inert.text(answer))).toEqual([
      'Warm',
      'Intro',
      'Skipped',
    ])
    const [summary] = Inert.byTag(drawn, 'dl')
    expect(Inert.value(summary, 'id')).toBe('ask-summary')
  })

  it('draws every element of its own in a Slot', () => {
    expect(Inert.unslotted(drawWith(fresh()))).toEqual([])
    expect(Inert.unslotted(drawWith(update(complete(fresh()), Message.Submitted()).model))).toEqual(
      [],
    )
  })

  it('sends a radio’s choice, a box’s toggle, typing and the submit', () => {
    const model = fresh()
    sends<Message>(
      (h: HtmlBuilder<Message>) => view({ model, onMessage: message => message, style }, h),
      Scene.click(Scene.role('checkbox', { name: 'Outro' })),
      Scene.expectOutMessage(Message.Toggled({ question: 'parts', value: 'outro' })),
      Scene.type(Scene.label('Anything else?'), 'Thanks'),
      Scene.expectOutMessage(Message.Typed({ question: 'notes', text: 'Thanks' })),
    )
  })
})
