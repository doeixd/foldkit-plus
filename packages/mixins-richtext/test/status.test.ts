// @vitest-environment jsdom
/** The status line: the counts follow the document, and each problem passed is listed. */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { editorStatus } from '../src/index.js'

const Message = defineMessageUnion({ Replaced: { text: Schema.String } })
type Message = typeof Message.Type

const paragraph = (text: string) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text, marks: [] }] },
      { type: 'Node', kind: 'CodeBlock', id: 'c', props: {}, children: [] },
    ],
  })

interface Model {
  readonly document: RichText.Document
}

const update = (_: Model, message: Message): { readonly model: Model } => ({
  model: { document: paragraph(message.text) },
})

const counts = Scene.selector('[data-status="counts"]')

const view =
  (diagnostics: (document: RichText.Document) => ReadonlyArray<RichText.Diagnostic> | undefined) =>
  (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        editorStatus<Message>()(
          { document: model.document, diagnostics: diagnostics(model.document) },
          h,
        ),
        h.button([h.Id('replace'), h.OnClick(Message.Replaced({ text: 'a' }))], ['replace']),
      ],
    )

describe('the status line', () => {
  it('counts the document it is given, and counts again when that changes', () => {
    Scene.scene(
      { update, view: view(() => undefined) },
      Scene.given<Model>({ document: paragraph('Water early') }),
      Scene.expect(counts).toHaveText('2 words · 11 characters'),
      Scene.expect(Scene.selector('li')).toBeAbsent(),
      Scene.click('#replace'),
      Scene.expect(counts).toHaveText('1 word · 1 character'),
    )
  })

  it('lists each problem with its code and node', () => {
    const ParagraphsOnly = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [] })
    Scene.scene(
      { update, view: view(document => RichText.validate(document, ParagraphsOnly)) },
      Scene.given<Model>({ document: paragraph('Water') }),
      Scene.expect(Scene.selector('li[data-code="UnsupportedNode"][data-node="c"]')).toHaveText(
        'The Kit does not declare node "CodeBlock"',
      ),
    )
  })
})
