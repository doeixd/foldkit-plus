/**
 * A docs sidebar's state: the open section's id (one at a time, as an
 * accordion), and whether the rail is collapsed to its toggle. Collapsing
 * hides the navigation, not the toggle, so the rail never strands the way
 * back.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const ISLAND = 'sidebar'

/** Element id of the navigation the collapse toggle names. */
export const NAV_ID = `${ISLAND}/docs-nav`

/** Element id of a section's panel. The trigger's `aria-controls` names it. */
export const contentId = (id: string): string => `${ISLAND}/${id}-content`

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'

/** The section after a click: the open one shuts, any other opens. */
export const toggled = (open: Option.Option<string>, id: string): Option.Option<string> =>
  Option.isSome(open) && open.value === id ? Option.none() : Option.some(id)

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
  open: Schema.Option(Schema.String),
  collapsed: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ToggledSection: { id: Schema.String },
  ToggledCollapse: {},
})
export type Message = typeof Message.Type

export const initial: Model = { open: Option.some('guides'), collapsed: false }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'ToggledSection':
      return { model: { ...model, open: toggled(model.open, message.id) } }
    case 'ToggledCollapse':
      return { model: { ...model, collapsed: !model.collapsed } }
  }
}
