// @vitest-environment jsdom
/**
 * The command palette: what a query matches, how the arrows move the highlight, and what Enter,
 * a click, and Escape send.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, it } from 'vitest'
import { commandPalette, slashEntries } from '../src/index.js'

const Message = defineMessageUnion({
  Changed: { query: Schema.String, index: Schema.Number },
  Chose: { entry: Schema.String },
  Closed: {},
})
type Message = typeof Message.Type

interface Model {
  readonly query: string
  readonly index: number
  readonly sent: string
}

const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'Changed':
      return { model: { ...model, query: message.query, index: message.index } }
    case 'Chose':
      return { model: { ...model, sent: message.entry } }
    case 'Closed':
      return { model: { ...model, sent: 'closed' } }
  }
}

const entries = slashEntries(event => Message.Chose({ entry: JSON.stringify(event) }))

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      commandPalette<Message>()(
        {
          id: 'palette',
          entries,
          query: model.query,
          index: model.index,
          changed: (query, index) => Message.Changed({ query, index }),
          closed: Message.Closed(),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )

const field = '[role="combobox"]'
const option = (entry: string) => Scene.selector(`[data-entry="${entry}"]`)
const sent = Scene.selector('#sent')
const retype = (level: number) =>
  JSON.stringify({ _tag: 'RetypedBlock', block: { type: 'Heading', level } })

describe('the command palette', () => {
  it('narrows to a query, moves with the arrows, and sends the highlighted entry on Enter', () => {
    Scene.scene(
      { update, view },
      // Typing starts the highlight over, wherever it was.
      Scene.given<Model>({ query: '', index: 2, sent: '' }),
      Scene.type(field, 'head'),
      Scene.expect(option('paragraph')).toBeAbsent(),
      Scene.expect(option('heading-1')).toHaveAttr('aria-selected', 'true'),
      Scene.expect(Scene.selector(field)).toHaveAttr(
        'aria-activedescendant',
        'palette-option-heading-1',
      ),
      Scene.keydown(field, 'ArrowDown'),
      Scene.expect(option('heading-2')).toHaveAttr('aria-selected', 'true'),
      Scene.expect(option('heading-1')).toHaveAttr('aria-selected', 'false'),
      // Up from the first wraps to the last.
      Scene.keydown(field, 'ArrowUp'),
      Scene.keydown(field, 'ArrowUp'),
      Scene.expect(option('heading-3')).toHaveAttr('aria-selected', 'true'),
      Scene.keydown(field, 'Enter'),
      Scene.expect(sent).toHaveText(retype(3)),
    )
  })

  it('leaves Home and End, and a modified arrow, to the field', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ query: 'head', index: 1, sent: '' }),
      Scene.keydown(field, 'End'),
      Scene.expectIgnored(),
      Scene.keydown(field, 'Home'),
      Scene.expectIgnored(),
      Scene.keydown(field, 'ArrowDown', { metaKey: true }),
      Scene.expectIgnored(),
      Scene.expect(option('heading-2')).toHaveAttr('aria-selected', 'true'),
    )
  })

  it.each([7, -1])('highlights the first match for an index of %i', index => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ query: 'head', index, sent: '' }),
      Scene.expect(option('heading-1')).toHaveAttr('aria-selected', 'true'),
      Scene.keydown(field, 'Enter'),
      Scene.expect(sent).toHaveText(retype(1)),
    )
  })

  it('sends nothing on Enter when nothing matches, and closes on Escape', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ query: 'zzz', index: 0, sent: '' }),
      Scene.expect(Scene.selector('[role="option"]')).toBeAbsent(),
      Scene.keydown(field, 'Enter'),
      Scene.expectIgnored(),
      Scene.keydown(field, 'Escape'),
      Scene.expect(sent).toHaveText('closed'),
    )
  })

  it('sends an entry clicked', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ query: '', index: 0, sent: '' }),
      Scene.click('[data-entry="heading-2"]'),
      Scene.expect(sent).toHaveText(retype(2)),
    )
  })
})
