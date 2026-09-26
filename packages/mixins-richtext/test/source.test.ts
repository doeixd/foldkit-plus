// @vitest-environment jsdom
/**
 * The Markdown source editor in an application that keeps `SourceSession | null`: the text
 * is the draft, a warning appears once an edit would lose something, and the way back
 * commits what `closeSource` returns.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { closeSource, openSource, print, type SourceSession } from 'foldkit-richtext-markdown'
import { describe, it } from 'vitest'
import { sourceEditor } from '../src/index.js'

const Message = defineMessageUnion({
  Drafted: { draft: Schema.String },
  LeftSource: {},
})
type Message = typeof Message.Type

/** A paragraph whose mark Markdown has no syntax for. */
const original = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 'p-t', text: 'marked', marks: ['Highlight'] }],
    },
  ],
})

interface Model {
  readonly document: RichText.Document
  readonly source: SourceSession | null
}

let minted = 0
const update = (model: Model, message: Message): { readonly model: Model } => {
  if (model.source === null) return { model }
  if (message._tag === 'Drafted')
    return { model: { ...model, source: { ...model.source, draft: message.draft } } }
  const closed = closeSource(model.source, model.document, { mint: () => `m${++minted}` })
  return { model: { document: closed.document, source: null } }
}

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      model.source === null
        ? h.p(
            [h.Id('rich')],
            [model.document === original ? 'untouched' : print(model.document).markdown],
          )
        : sourceEditor<Message>()(
            {
              session: model.source,
              document: model.document,
              drafted: draft => Message.Drafted({ draft }),
              done: Message.LeftSource(),
            },
            h,
          ),
    ],
  )

const opened = (): Model => ({ document: original, source: openSource(original) })
const text = '[data-source="text"]'

describe('the Markdown source editor', () => {
  it('shows the draft, and switches back untouched when nothing was typed', () => {
    Scene.scene(
      { update, view },
      Scene.given(opened()),
      Scene.expect(Scene.selector(text)).toHaveValue('marked\n'),
      Scene.expect(Scene.selector('[data-code]')).toBeAbsent(),
      Scene.click('[data-source="done"]'),
      Scene.expect(Scene.selector('#rich')).toHaveText('untouched'),
    )
  })

  it('warns what an edit loses, then commits the edited Markdown', () => {
    Scene.scene(
      { update, view },
      Scene.given(opened()),
      Scene.type(text, 'marked, and *more*\n'),
      Scene.expect(Scene.selector('[data-code="UnsupportedMark"]')).toHaveText(
        'Highlight formatting has no Markdown and will be lost',
      ),
      Scene.click('[data-source="done"]'),
      Scene.expect(Scene.selector('#rich')).toHaveText('marked, and *more*\n'),
    )
  })
})
