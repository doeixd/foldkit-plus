// @vitest-environment jsdom
/**
 * The table and code block toolbars: what each sends, as the editor's own Messages wrapped for
 * the caller, and what each offers where it is drawn.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { codeToolbar, tableToolbar } from '../src/index.js'

const Message = defineMessageUnion({
  Sent: { editor: Schema.String },
  Copied: {},
})
type Message = typeof Message.Type

const id = RichText.NodeId.make
const caret = (node: string): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset: 0, affinity: 'after' },
  focus: { node: id(node), offset: 0, affinity: 'after' },
})
const cell = (text: string) => ({
  type: 'Node',
  kind: 'TableCell',
  id: `c-${text}`,
  props: {},
  children: [],
  blocks: [
    { type: 'Paragraph', id: `p-${text}`, children: [{ type: 'Text', id: text, text, marks: [] }] },
  ],
})
const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Node',
      kind: 'Table',
      id: 'table',
      props: {},
      children: [],
      blocks: [
        {
          type: 'Node',
          kind: 'TableRow',
          id: 'head',
          props: { header: true },
          children: [],
          blocks: [cell('a')],
        },
      ],
    },
    { type: 'Paragraph', id: 'after', children: [{ type: 'Text', id: 'z', text: 'z', marks: [] }] },
    {
      type: 'Node',
      kind: 'CodeBlock',
      id: 'code',
      props: { language: 'ruby' },
      children: [{ type: 'Text', id: 'c', text: 'puts 1', marks: [] }],
    },
  ],
})

interface Model {
  readonly selection: RichText.Selection | null
  readonly sent: string
}
const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    Sent: ({ editor }) => ({ model: { ...model, sent: editor } }),
    Copied: () => ({ model: { ...model, sent: 'copied' } }),
  })
const wrap = (editor: unknown) => Message.Sent({ editor: JSON.stringify(editor) })
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      tableToolbar<Message>()({ document, selection: model.selection, wrap }, h),
      codeToolbar<Message>()(
        {
          document,
          node: id('code'),
          languages: [
            { id: 'typescript', label: 'TypeScript' },
            { id: '', label: 'Plain text' },
          ],
          wrap,
          copied: Message.Copied(),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )
const sent = (value: unknown) =>
  Scene.expect(Scene.selector('#sent')).toHaveText(JSON.stringify(value))

describe('the table toolbar', () => {
  it.each([
    ['row-below', { _tag: 'InsertedRow', where: 'after' }],
    ['column-left', { _tag: 'InsertedColumn', where: 'before' }],
    ['delete-row', { _tag: 'DeletedRow' }],
    ['delete-column', { _tag: 'DeletedColumn' }],
    ['delete-table', { _tag: 'DeletedBlock', node: 'table' }],
    // The first row is the header, so the button turns that off.
    ['header', { _tag: 'ChangedProps', node: 'head', props: { header: false } }],
  ])('sends %s for the caret’s cell', (change, expected) => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: caret('a'), sent: '' }),
      Scene.expect(Scene.selector('[data-table="header"]')).toHaveAttr('aria-pressed', 'true'),
      Scene.click(`[data-table="${change}"]`),
      sent(expected),
    )
  })

  it('offers nothing outside a table', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: caret('z'), sent: '' }),
      Scene.expect(Scene.selector('[data-table="row-below"]')).toBeDisabled(),
      Scene.expect(Scene.selector('[data-table="delete-table"]')).toBeDisabled(),
    )
  })
})

describe('the code toolbar', () => {
  it('shows the block’s language, offering one the list lacks as itself', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: null, sent: '' }),
      Scene.expect(Scene.selector('select')).toHaveValue('ruby'),
      Scene.expect(Scene.selector('option[value="ruby"]')).toHaveText('ruby'),
    )
  })

  it('sets the language through the editor, and copies through the caller', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: null, sent: '' }),
      Scene.change('select', 'typescript'),
      sent({ _tag: 'ChangedProps', node: 'code', props: { language: 'typescript' } }),
      Scene.click('[data-code="copy"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText('copied'),
    )
  })
})
