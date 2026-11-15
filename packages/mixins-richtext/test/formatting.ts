/**
 * What the formatting toolbar tests and its browser test share: one document, an application
 * Message universe, and the view an application would write around the toolbar.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as RichText from 'foldkit-richtext'
import {
  formattingToolbar,
  type FormattingMenu,
  type FormattingToolbarInput,
} from '../src/index.js'

export const Message = defineMessageUnion({
  Sent: { editor: Schema.String },
  Toggled: { menu: Schema.Literals(['style', 'insert', 'link']), open: Schema.Boolean },
  Focused: { id: Schema.String },
  Picked: { what: Schema.String },
  Returned: {},
})
export type Message = typeof Message.Type

const id = RichText.NodeId.make

/** A paragraph: `ab` plain, then `cd` bold. */
export const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 'a', text: 'ab', marks: [] },
        { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
      ],
    },
  ],
})

export const caret = (node: string, offset = 1): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

export const range = (node: string, from: number, to: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset: from, affinity: 'after' },
  focus: { node: id(node), offset: to, affinity: 'after' },
})

export interface Model {
  readonly selection: RichText.Selection | null
  readonly sent: ReadonlyArray<string>
  readonly menu: FormattingMenu | undefined
  readonly current: string | null
}

export const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    Sent: ({ editor }) => ({ model: { ...model, sent: [...model.sent, editor] } }),
    Toggled: ({ menu, open }) => ({ model: { ...model, menu: open ? menu : undefined } }),
    Focused: ({ id: focused }) => ({ model: { ...model, current: focused } }),
    Picked: ({ what }) => ({ model: { ...model, sent: [...model.sent, `picked:${what}`] } }),
    Returned: () => ({ model: { ...model, sent: [...model.sent, 'returned'] } }),
  })

export const wrap = (editor: unknown): Message => Message.Sent({ editor: JSON.stringify(editor) })

export const Toolbar = formattingToolbar<Message>()

/** The input every drawing shares: what is not an option of the test at hand. */
export const base = {
  id: 'bar',
  document,
  selection: caret('a'),
  wrap,
  toggled: (menu: FormattingMenu, open: boolean) => Message.Toggled({ menu, open }),
  roving: { current: null },
  onFocus: (id: string) => Message.Focused({ id }),
}

export const view =
  (options: Partial<FormattingToolbarInput<Message>> = {}) =>
  (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        Toolbar(
          {
            ...base,
            selection: model.selection,
            menu: model.menu,
            roving: { current: model.current },
            ...options,
          },
          h,
        ),
        h.p([h.Id('sent')], [model.sent.join('|')]),
      ],
    )

export const given = (overrides: Partial<Model> = {}): Model => ({
  selection: caret('a'),
  sent: [],
  menu: undefined,
  current: null,
  ...overrides,
})
