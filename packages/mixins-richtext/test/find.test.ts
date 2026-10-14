// @vitest-environment jsdom
/**
 * The find and replace bar: its count, stepping through matches with wrap-around, and replacing
 * through the editor's own Message.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, expect, it } from 'vitest'
import { findReplace, stepMatch } from '../src/index.js'

const Message = defineMessageUnion({
  Queried: { query: Schema.String },
  Drafted: { replacement: Schema.String },
  Moved: { index: Schema.Number },
  CaseToggled: {},
  Closed: {},
  Sent: { editor: Schema.String },
})
type Message = typeof Message.Type

const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'Cat and cat and cat', marks: [] }],
    },
  ],
})

interface Model {
  readonly query: string
  readonly replacement: string
  readonly current: number
  readonly caseSensitive: boolean
  readonly closed: boolean
  readonly sent: string
}
const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    Queried: ({ query }) => ({ ...model, query }),
    Drafted: ({ replacement }) => ({ ...model, replacement }),
    Moved: ({ index }) => ({ ...model, current: index }),
    CaseToggled: () => ({ ...model, caseSensitive: !model.caseSensitive }),
    Closed: () => ({ ...model, closed: true }),
    Sent: ({ editor }) => ({ ...model, sent: editor }),
  }),
})
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      findReplace<Message>()(
        {
          document,
          query: model.query,
          replacement: model.replacement,
          current: model.current,
          caseSensitive: model.caseSensitive,
          queried: query => Message.Queried({ query }),
          replacementDrafted: replacement => Message.Drafted({ replacement }),
          moved: index => Message.Moved({ index }),
          caseToggled: Message.CaseToggled(),
          closed: Message.Closed(),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('state')], [`${model.current} ${model.closed} ${model.sent}`]),
    ],
  )
const given = (overrides: Partial<Model> = {}) =>
  Scene.given<Model>({
    query: 'cat',
    replacement: '',
    current: 0,
    caseSensitive: false,
    closed: false,
    sent: '',
    ...overrides,
  })
const count = Scene.selector('[aria-live]')
const state = Scene.selector('#state')

describe('the find bar', () => {
  it('counts the matches, case counting only when asked', () => {
    Scene.scene(
      { update, view },
      given(),
      Scene.expect(count).toHaveText('1 of 3'),
      Scene.click('[data-find="case"]'),
      Scene.expect(count).toHaveText('1 of 2'),
      Scene.type('[data-find="query"]', 'zebra'),
      Scene.expect(count).toHaveText('No matches'),
      Scene.expect(Scene.selector('[data-find="replace-all"]')).toBeDisabled(),
    )
  })

  it('steps through the matches with Enter and Shift+Enter, wrapping, and closes on Escape', () => {
    Scene.scene(
      { update, view },
      given(),
      // Three matches, so a step back and a step forward land apart.
      Scene.keydown('[data-find="query"]', 'Enter'),
      Scene.expect(state).toHaveText('1 false '),
      Scene.keydown('[data-find="query"]', 'Enter'),
      Scene.keydown('[data-find="query"]', 'Enter'),
      Scene.expect(state).toHaveText('0 false '),
      Scene.keydown('[data-find="query"]', 'Enter', { shiftKey: true }),
      Scene.expect(state).toHaveText('2 false '),
      Scene.keydown('[data-find="query"]', 'Escape'),
      Scene.expect(state).toHaveText('2 true '),
    )
  })

  it('replaces the current match, or every one, through the editor', () => {
    Scene.scene(
      { update, view },
      given({ current: 1, replacement: 'dog' }),
      Scene.click('[data-find="replace"]'),
      Scene.expect(state).toHaveText(
        `1 false ${JSON.stringify({ _tag: 'ReplacedText', query: 'cat', replacement: 'dog', caseSensitive: false, at: 1 })}`,
      ),
      Scene.click('[data-find="replace-all"]'),
      Scene.expect(state).toHaveText(
        `1 false ${JSON.stringify({ _tag: 'ReplacedText', query: 'cat', replacement: 'dog', caseSensitive: false })}`,
      ),
    )
  })
})

it.each([
  [0, 3, 1, 1],
  [2, 3, 1, 0],
  [0, 3, -1, 2],
  [0, 0, 1, 0],
] as const)('steps from %i of %i by %i to %i', (current, total, step, expected) => {
  expect(stepMatch(current, total, step)).toBe(expected)
})
