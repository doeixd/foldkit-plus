// @vitest-environment jsdom
/**
 * The footnote preview: drawn at a reference only, showing its note, going to the definition, and
 * renaming through the editor's own Message.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { footnotePreview } from '../src/index.js'

const Message = defineMessageUnion({
  Opened: { definition: Schema.String },
  Sent: { editor: Schema.String },
})
type Message = typeof Message.Type

const ref = (label: string) => [{ name: 'FootnoteRef', props: { label } }]
// Footnote 1 has a note; 2 is referred to and never defined.
const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 'a', text: 'Words', marks: [] },
        { type: 'Text', id: 'r1', text: '1', marks: ref('1') },
        { type: 'Text', id: 'r2', text: '2', marks: ref('2') },
      ],
    },
    {
      type: 'Node',
      kind: 'FootnoteDefinition',
      id: 'd1',
      props: { label: '1' },
      children: [],
      blocks: [
        {
          type: 'Paragraph',
          id: 'dp',
          children: [{ type: 'Text', id: 'dt', text: 'The note.', marks: [] }],
        },
      ],
    },
  ],
})

interface Model {
  readonly caret: string
  readonly said: string
}
const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    Opened: ({ definition }) => ({ ...model, said: `opened ${definition}` }),
    Sent: ({ editor }) => ({ ...model, said: editor }),
  }),
})
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      footnotePreview<Message>()(
        {
          document,
          selection: {
            type: 'Range',
            anchor: { node: RichText.NodeId.make(model.caret), offset: 1, affinity: 'before' },
            focus: { node: RichText.NodeId.make(model.caret), offset: 1, affinity: 'before' },
          },
          opened: definition => Message.Opened({ definition }),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('said')], [model.said]),
    ],
  )
const given = (caret: string) => Scene.given<Model>({ caret, said: '' })
const card = Scene.selector('[role="group"]')
const goTo = Scene.role('button', { name: 'Go to note' })
const said = Scene.selector('#said')

describe('the footnote preview', () => {
  it('shows the note at its reference and goes to its definition', () => {
    Scene.scene(
      { update, view },
      given('r1'),
      Scene.expect(card).toHaveText('The note.Go to note'),
      Scene.click(goTo),
      Scene.expect(said).toHaveText('opened d1'),
    )
  })

  it('renames the footnote through the editor', () => {
    Scene.scene(
      { update, view },
      given('r1'),
      Scene.change('[aria-label="Footnote label"]', 'one'),
      Scene.expect(said).toHaveText(
        JSON.stringify({ _tag: 'RenamedFootnote', from: '1', to: 'one' }),
      ),
    )
  })

  it('says a note is missing, with nowhere to go', () => {
    Scene.scene(
      { update, view },
      given('r2'),
      Scene.expect(card).toHaveText('No note yetGo to note'),
      Scene.expect(goTo).toBeDisabled(),
    )
  })

  it('draws nothing away from a reference', () => {
    Scene.scene({ update, view }, given('a'), Scene.expect(card).not.toExist())
  })
})
