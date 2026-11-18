/**
 * What the Sidebar page's examples share: the workspace's groups, the styles
 * of what a sidebar holds, and the state each example keeps of its own
 * sidebar. A Sidebar has no Bundle yet, so each example folds
 * `Sidebar.update` here.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import {
  AvatarSlots,
  DialogSlots,
  Recipes,
  Sidebar,
  SidebarSlots,
  TooltipSlots,
} from 'foldkit-mixins-ui'
import { outline } from './icon.js'
import { forSlots } from './theme.js'

export const SidebarStyle = forSlots(SidebarSlots)(Recipes.Sidebar({}))
export const SheetStyle = forSlots(DialogSlots)(Recipes.Sheet({}))
export const TipStyle = forSlots(TooltipSlots)(Recipes.Tooltip({}))
export const LogoStyle = forSlots(AvatarSlots)(
  Recipes.Avatar({ size: 'sm', shape: 'rounded', color: 'name' }),
)
export const PersonStyle = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'sm', color: 'name' }))

/** The ids of `workspace`'s rows, which a rail's Tooltips are made for. */
export const WORKSPACE_ROWS = ['inbox', 'projects', 'calendar', 'members', 'billing']

/** An inbox, a branch of projects, a calendar, and a titled group of settings. */
export const workspace = <Message>(
  h: HtmlBuilder<Message>,
): ReadonlyArray<Sidebar.SidebarGroup> => [
  {
    id: 'workspace',
    rows: [
      {
        id: 'inbox',
        label: 'Inbox',
        href: '#',
        current: true,
        badge: '12',
        icon: outline(h, 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z'),
      },
      {
        id: 'projects',
        label: 'Projects',
        icon: outline(h, 'M1 3h5l2 2h7v8H1z'),
        items: [
          { label: 'Website', href: '#' },
          { label: 'Mobile app', href: '#' },
        ],
      },
      {
        id: 'calendar',
        label: 'Calendar',
        href: '#',
        icon: outline(h, 'M2 4h12v10H2zM2 7h12M5 2v3M11 2v3'),
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    rows: [
      {
        id: 'members',
        label: 'Members',
        href: '#',
        badge: '3',
        icon: outline(h, 'M6 7a2 2 0 100-4 2 2 0 000 4zM2 13c0-2 2-4 4-4s4 2 4 4'),
      },
      { id: 'billing', label: 'Billing', href: '#', icon: outline(h, 'M2 4h12v8H2zM2 7h12') },
    ],
  },
]

const Model = Schema.Struct({ sidebar: Sidebar.Model })
const Message = defineMessageUnion({ Got: { message: Sidebar.Message } })

/** A Sidebar's Message, as the state below folds it. */
export const Got = Message.Got

/** An example's state of one sidebar, started at `initial` and folded with `Sidebar.update`. */
export const sidebarState = (initial: Sidebar.Model) => ({
  Model,
  Message,
  init: () => ({ model: { sidebar: initial } }),
  update: (model: typeof Model.Type, { message }: typeof Message.Type) => {
    const next = Sidebar.update(model.sidebar, message)
    return {
      model:
        next.model === model.sidebar ? model : modifyFields(model, { sidebar: () => next.model }),
      commands: Command.mapMessages(next.commands ?? [], message => Message.Got({ message })),
    }
  },
})
