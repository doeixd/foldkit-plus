import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Kbd, Recipes, Sidebar, SidebarSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { SheetStyle } from '../../snippets/sidebar.js'

const Floating = Recipes.Sidebar.style({ variant: 'floating' })
const Key = Recipes.Kbd.style()
const Model = Schema.Struct({ sidebar: Sidebar.Model, acted: Schema.Option(Schema.String) })
const Message = defineMessageUnion({
  Got: { message: Sidebar.Message },
  Acted: { what: Schema.String },
})

const projects = <Outer>(h: HtmlBuilder<Outer>, acted: (what: string) => Outer) => {
  const more = (name: string) => ({
    label: `More for ${name}`,
    icon: outline(
      h,
      'M3 8a.5.5 0 101 0 .5.5 0 00-1 0zM7.5 8a.5.5 0 101 0 .5.5 0 00-1 0zM12 8a.5.5 0 101 0 .5.5 0 00-1 0z',
    ),
    message: acted(`More for ${name}`),
  })
  const project = (id: string, label: string, badge?: string) => ({
    id,
    label,
    href: '#',
    ...(badge === undefined ? {} : { badge }),
    icon: outline(h, 'M6.5 3L5 13M11 3l-1.5 10M3 6.5h10M3 9.5h10'),
    action: more(label),
  })
  const groups: ReadonlyArray<Sidebar.SidebarGroup<Outer>> = [
    {
      id: 'main',
      rows: [
        {
          id: 'home',
          label: 'Home',
          href: '#',
          current: true,
          icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14V9h4v5'),
          // Html at the row's end: here the key that goes there.
          trailing: Kbd.view({ key: 'H', style: Key }, h),
        },
        {
          id: 'inbox',
          label: 'Inbox',
          href: '#',
          badge: '4',
          icon: outline(h, 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z'),
        },
      ],
    },
    {
      id: 'projects',
      title: 'Projects',
      action: {
        label: 'New project',
        icon: outline(h, 'M8 3v10M3 8h10'),
        message: acted('New project'),
      },
      rows: [
        project('design', 'Design engineering', '8'),
        project('sales', 'Sales and marketing'),
        project('travel', 'Travel', '2'),
      ],
    },
  ]
  return groups
}

// Lifted off the page's edge as a card. A group's action adds to it; a row's
// takes the place of its count under the pointer (both show on a touch screen).
export default example({
  title: 'Floating, with actions',
  slots: SidebarSlots,
  recipe: Recipes.Sidebar,
  state: {
    Model,
    Message,
    init: () => ({
      model: {
        sidebar: Sidebar.init({ id: 'floating-sidebar', rows: [], open: ['projects'] }),
        acted: Option.none(),
      },
    }),
    update: (model, message) =>
      Message.match(message, {
        Got: ({ message }) => {
          const next = Sidebar.update(model.sidebar, message)
          return {
            model:
              next.model === model.sidebar
                ? model
                : modifyFields(model, { sidebar: () => next.model }),
            commands: Command.mapMessages(next.commands ?? [], message => Message.Got({ message })),
          }
        },
        Acted: ({ what }) => ({ model: modifyFields(model, { acted: () => Option.some(what) }) }),
      }),
  },
  view: ({ model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', blockSize: '26rem', inlineSize: 'min(42rem, 100%)' })],
      [
        Sidebar.view(
          {
            model: model.sidebar,
            onMessage: message => onMessage(Message.Got({ message })),
            label: 'Projects',
            groups: projects(h, what => onMessage(Message.Acted({ what }))),
            style: Floating,
            mixins: Sidebar.fluid,
            sheet: [SheetStyle.mixin],
          },
          h,
        ),
        h.p(
          [h.Style({ margin: '0', padding: '1rem' })],
          [Option.getOrElse(model.acted, () => 'Hover a project for its actions.')],
        ),
      ],
    ),
})
