// @vitest-environment jsdom
/**
 * The link editor's view: what it offers for a selection, that its address passes the URL
 * policy before it is sent, and that what it sends is the editor's own Message wrapped for
 * the caller.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { SlotView, Style } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { describe, expect, it } from 'vitest'
import { LinkEditorSlots, linkEditor } from '../src/index.js'

const Message = defineMessageUnion({
  Drafted: { href: Schema.String },
  Sent: { editor: Schema.String },
})
type Message = typeof Message.Type

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})
const range = (from: RichText.Position, to: RichText.Position): RichText.Selection => ({
  type: 'Range',
  anchor: from,
  focus: to,
})
const caret = (node: string, offset: number) => range(at(node, offset), at(node, offset))

/** `see ` then `docs` linked to /a. */
const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 'a', text: 'see ', marks: [] },
        { type: 'Text', id: 'l', text: 'docs', marks: [{ name: 'Link', props: { href: '/a' } }] },
      ],
    },
  ],
})

interface Model {
  readonly selection: RichText.Selection | null
  readonly draft: string
  /** The last editor Message the view sent, as JSON. */
  readonly sent: string
}

const update = (model: Model, message: Message): { readonly model: Model } =>
  message._tag === 'Drafted'
    ? { model: { ...model, draft: message.href } }
    : { model: { ...model, sent: message.editor } }

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      linkEditor<Message>()(
        {
          document,
          selection: model.selection,
          draft: model.draft,
          drafted: href => Message.Drafted({ href }),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )

const applied = (href: string) =>
  JSON.stringify({ _tag: 'AppliedMark', mark: { name: 'Link', props: { href } } })
const input = '[data-link="address"]'
const apply = '[data-link="apply"]'

describe('the link editor', () => {
  it('changes the link around a caret to the address typed, by button or by Enter', () => {
    const given = Scene.given<Model>({ selection: caret('l', 2), draft: '/a', sent: '' })
    Scene.scene(
      { update, view },
      given,
      Scene.expect(Scene.selector(apply)).toHaveText('Update'),
      Scene.type(input, 'https://example.test/x'),
      Scene.click(apply),
      Scene.expect(Scene.selector('#sent')).toHaveText(applied('https://example.test/x')),
    )
    Scene.scene(
      { update, view },
      given,
      // Only Enter applies; any other key is the field's own.
      Scene.keydown(input, 'a'),
      Scene.expectIgnored(),
      Scene.expect(Scene.selector('#sent')).toHaveText(''),
      Scene.keydown(input, 'Enter'),
      Scene.expect(Scene.selector('#sent')).toHaveText(applied('/a')),
    )
  })

  it('removes the link around a caret', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: caret('l', 2), draft: '/a', sent: '' }),
      Scene.click('[data-link="remove"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText(
        JSON.stringify({ _tag: 'ClearedMark', mark: 'Link' }),
      ),
    )
  })

  it('links a range of plain text, and offers no removal there', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: range(at('a', 0), at('a', 3)), draft: '', sent: '' }),
      Scene.expect(Scene.selector('[data-link="remove"]')).toBeAbsent(),
      Scene.type(input, 'mailto:a@b.test'),
      Scene.click(apply),
      Scene.expect(Scene.selector('#sent')).toHaveText(applied('mailto:a@b.test')),
    )
  })

  it.each<[string, RichText.Selection | null, string]>([
    ['an address the URL policy refuses', caret('l', 2), 'javascript:alert(1)'],
    ['an empty address', caret('l', 2), ''],
    ['a caret outside a link', caret('a', 1), '/b'],
    ['a node selection', { type: 'Node', node: id('p') }, '/b'],
    ['no selection', null, '/b'],
  ])('sends nothing for %s', (_, selection, draft) => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection, draft, sent: '' }),
      Scene.expect(Scene.selector(apply)).toBeDisabled(),
      Scene.keydown(input, 'Enter'),
      Scene.expectIgnored(),
      Scene.expect(Scene.selector('#sent')).toHaveText(''),
    )
  })

  it('takes a Style on its slots', () => {
    const styled = linkEditor<Message>().pipe(
      Style.attach(Style.forSlots(LinkEditorSlots)({ input: Style.class('link-address') })),
    )
    const root = styled(
      {
        document,
        selection: caret('l', 1),
        draft: '/a',
        drafted: href => Message.Drafted({ href }),
        wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
      },
      SlotView.inertBuilder(),
    ) as unknown as {
      readonly children: ReadonlyArray<{ readonly data?: { readonly class?: object } }>
    }
    expect(Object.keys(root.children[0]?.data?.class ?? {})).toEqual(['link-address'])
  })
})
