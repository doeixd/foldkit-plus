/// <reference types="@vitest/browser-playwright" />
/**
 * A questionnaire on a real runtime, folded by `Questionnaire.update`: the
 * radios take the arrow keys, as the APG's radio group; a submit with an
 * answer missing moves the focus to it and says why; one at a time, Next
 * moves the focus to the next question's answer and Back to the last
 * one's; Enter in a one-line answer sends the form; once sent, the focus is
 * on the summary of the answers. And the look: the buttons at the end, or
 * the start, and what is missing in the error ink.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  ButtonSlots,
  CheckboxGroupSlots,
  InputSlots,
  RadioGroupSlots,
  Recipes,
  TextareaSlots,
} from '../src/index.js'
import {
  Model,
  QuestionnaireSlots,
  init,
  multiple,
  single,
  text,
  update,
  view,
  Message,
  type OutMessage,
  type Question,
} from '../src/questionnaire.js'
import { Questionnaire } from '../src/recipes/questionnaire.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const parts = {
  radioGroup: Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({})),
  checkboxGroup: Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({})),
  input: Style.forSlots(InputSlots)(Recipes.Input({})),
  textarea: Style.forSlots(TextareaSlots)(Recipes.Textarea({})),
  button: Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' })),
  submitButton: Style.forSlots(ButtonSlots)(Recipes.Button({})),
}

const asked: ReadonlyArray<Question> = [
  single({
    id: 'tone',
    prompt: 'Which tone?',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'warm', label: 'Warm' },
      { value: 'dry', label: 'Dry' },
    ],
  }),
  multiple({
    id: 'parts',
    prompt: 'Which parts?',
    options: [
      { value: 'intro', label: 'Intro' },
      { value: 'outro', label: 'Outro' },
    ],
  }),
  text({ id: 'notes', prompt: 'Anything else?', optional: true }),
]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (
  model: Model,
  selection: Parameters<typeof Questionnaire>[0] = {},
): { readonly dispose: () => void; readonly sent: Array<OutMessage> } => {
  const style = Style.forSlots(QuestionnaireSlots)(Questionnaire(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + [style, ...Object.values(parts)].map(each => each.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'questionnaire'
  document.body.appendChild(container)
  const sent: Array<OutMessage> = []
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model }),
      update: (current: Model, message: Message) => {
        const result = update(current, message)
        if (result.outMessage !== undefined) sent.push(result.outMessage)
        return { model: result.model, commands: result.commands ?? [] }
      },
      view: (current: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ inlineSize: '28rem', padding: '16px' })],
          [view({ model: current, onMessage: message => message, style, ...parts }, h)],
        ),
    }),
  )
  return { dispose: handle.dispose, sent }
}

const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    each => each.textContent === name,
  )!
const radio = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]')).find(
    each => each.closest('label')?.textContent === name,
  )!
const checkbox = (name: string) =>
  document.getElementById(
    Array.from(document.querySelectorAll('label')).find(label => label.textContent === name)!
      .htmlFor,
  )!
const ready = () => vi.waitFor(() => expect(button('Submit') ?? button('Next')).toBeDefined())

test('the radios take the arrow keys, and a submit missing an answer moves the focus to it', async () => {
  const { dispose, sent } = mount(init({ id: 'all', questions: asked }))
  try {
    await ready()
    // The row is the RadioGroup's own, its words beside the radio.
    const row = radio('Plain').closest('label')!
    expect(getComputedStyle(row).display).toBe('flex')
    expect(row.lastElementChild!.getBoundingClientRect().left).toBeGreaterThan(
      radio('Plain').getBoundingClientRect().right,
    )
    await userEvent.click(radio('Plain'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(radio('Warm').getAttribute('aria-checked')).toBe('true'))
    expect(document.activeElement).toBe(radio('Warm'))
    await userEvent.click(button('Submit'))
    await vi.waitFor(() => expect(document.activeElement).toBe(checkbox('Intro')))
    expect(document.body.textContent).toContain('Answer this question')
    expect(sent).toEqual([])
    await userEvent.keyboard(' ')
    await userEvent.click(button('Submit'))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('DL'))
    expect(document.activeElement?.textContent).toContain('Warm')
  } finally {
    dispose()
  }
})

test('one at a time, Next and Back move the focus to the question shown', async () => {
  const { dispose, sent } = mount(init({ id: 'paged', questions: asked, layout: 'paged' }))
  try {
    await ready()
    await userEvent.click(radio('Dry'))
    await userEvent.click(button('Next'))
    await vi.waitFor(() => expect(document.activeElement).toBe(checkbox('Intro')))
    expect(document.body.textContent).toContain('Question 2 of 3')
    await userEvent.click(button('Back'))
    await vi.waitFor(() => expect(document.activeElement).toBe(radio('Dry')))
    await userEvent.click(button('Next'))
    await vi.waitFor(() => expect(document.activeElement).toBe(checkbox('Intro')))
    await userEvent.keyboard(' ')
    await userEvent.click(button('Next'))
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(document.querySelector('#paged-q2-text')),
    )
    // Enter in a one-line answer sends the form.
    await userEvent.keyboard('Thanks{Enter}')
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.answers.map(answer => answer.text)).toEqual(['', '', 'Thanks'])
  } finally {
    dispose()
  }
})

test('the buttons sit at the end, or the start; what is missing is in the error ink', async () => {
  const end = mount(update(init({ id: 'end', questions: asked }), Message.Submitted()).model)
  const actionsOf = () => button('Submit').parentElement!
  try {
    await ready()
    const row = actionsOf().getBoundingClientRect()
    expect(Math.abs(button('Submit').getBoundingClientRect().right - row.right)).toBeLessThan(1)
    const error = Array.from(document.querySelectorAll('p')).find(
      each => each.textContent === 'Answer this question',
    )!
    const ink = document.createElement('span')
    ink.style.color = 'var(--fk-error-ink)'
    document.body.append(ink)
    expect(getComputedStyle(error).color).toBe(getComputedStyle(ink).color)
  } finally {
    end.dispose()
  }
  document.body.replaceChildren()
  const start = mount(init({ id: 'start', questions: asked }), { actions: 'start' })
  try {
    await ready()
    const row = actionsOf().getBoundingClientRect()
    expect(Math.abs(button('Submit').getBoundingClientRect().left - row.left)).toBeLessThan(1)
  } finally {
    start.dispose()
  }
})

test('the other field’s words read as one more option, not as a question', async () => {
  const withOther = [
    single({
      id: 'tone',
      prompt: 'Which tone?',
      options: [{ value: 'plain', label: 'Plain' }],
      other: 'Something else',
    }),
  ]
  const { dispose } = mount(init({ id: 'other', questions: withOther }))
  try {
    await ready()
    // The innermost element holding the words, which sets their look.
    const drawn = (words: string) =>
      Array.from(document.querySelectorAll('p, span')).find(
        each => each.textContent === words && each.children.length === 0,
      )!
    const look = (words: string) => {
      const { fontSize, fontWeight, color } = getComputedStyle(drawn(words))
      return { fontSize, fontWeight, color }
    }
    expect(look('Something else')).toEqual(look('Plain'))
    // The prompt's weight is its own, so matching the option is not matching it.
    expect(look('Which tone?').fontWeight).not.toBe(look('Plain').fontWeight)
  } finally {
    dispose()
  }
})
