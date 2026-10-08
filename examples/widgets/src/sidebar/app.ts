/**
 * A docs sidebar's state: the open section's id (one at a time, as an
 * accordion), and whether the rail is collapsed to its toggle. Collapsing
 * hides the navigation, not the toggle, so the rail never strands the way
 * back.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export interface Section {
  readonly id: string
  readonly title: string
  readonly links: ReadonlyArray<{ readonly label: string; readonly href: string }>
}

export const SECTIONS: ReadonlyArray<Section> = [
  {
    id: 'guides',
    title: 'Guides',
    links: [
      { label: 'Install', href: '#install' },
      { label: 'Quickstart', href: '#quickstart' },
    ],
  },
  {
    id: 'api',
    title: 'API',
    links: [
      { label: 'Components', href: '#components' },
      { label: 'Hooks', href: '#hooks' },
    ],
  },
  {
    id: 'examples',
    title: 'Examples',
    links: [
      { label: 'Todo', href: '#todo' },
      { label: 'Registry', href: '#registry' },
    ],
  },
]

export const Model = Schema.Struct({
  open: Schema.NullOr(Schema.String),
  collapsed: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ToggledSection: { id: Schema.String },
  ToggledCollapse: {},
})
export type Message = typeof Message.Type

export const initial: Model = { open: 'guides', collapsed: false }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'ToggledSection':
      return { model: { ...model, open: model.open === message.id ? null : message.id } }
    case 'ToggledCollapse':
      return { model: { ...model, collapsed: !model.collapsed } }
  }
}
