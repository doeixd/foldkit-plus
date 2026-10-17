import * as UiTooltip from '@foldkit/ui/tooltip'
import { Option, Schema } from 'effect'
import {
  Attr,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
  type SlotBuilders,
} from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { flipped } from './choices.js'
import type { ResolvedDialog } from './dialog.js'
import type { MixinList } from './resolve.js'
import * as Sheet from './sheet.js'
import * as Tooltip from './tooltip.js'

/**
 * An application's sidebar, shadcn's and Fluid Functionalism's: a column with
 * a `header`, a navigation landmark of groups and a `footer`. A group is a
 * heading over its rows, or a heading button that shows and hides them, as an
 * accordion's sections do (several open at once); a row is a link with an
 * icon and a count, or a branch, a row that shows and hides links nested
 * under it. A link marks the page it leads to with `aria-current`.
 *
 * Its Model is the application's: whether it is collapsed, which groups and
 * branches are open, a Tooltip per row, and the Sheet it opens on a phone.
 * Collapsed, it leaves the page (`collapse: 'offcanvas'`) or shrinks to a rail
 * of icons whose names show in tooltips (`collapse: 'icons'`); a collapsed
 * navigation stays drawn, so its collapse can animate and the toggle's
 * `aria-controls` names it. Below the theme's `md` breakpoint the column
 * gives way to its `opener`, which shows the same navigation in a Sheet.
 *
 * `indicator` and `highlight`, drawn in the navigation, are the current
 * link's marker and the hover that follows the pointer, which `fluid` moves,
 * as Tabs' do. A resizable width is the Resizable component's: draw the
 * sidebar as its `first` panel with `width: 'fill'`.
 */
export const SidebarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  }),
  /** The phone's button that opens the navigation in a Sheet. */
  opener: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  nav: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  /** A group heading button's words. */
  title: Slot.make({ capability: Capability.Container }),
  /** A group's heading that shows and hides nothing. */
  heading: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  /** A group's rows, or a branch's (`data-nested`). */
  links: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  /** A row that shows and hides the links nested under it. */
  branch: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  icon: Slot.make({ capability: Capability.Container }),
  /** A row's words; in an icon rail, kept for its name and hidden. */
  label: Slot.make({ capability: Capability.Container }),
  /** A row's count, at its end. */
  badge: Slot.make({ capability: Capability.Container }),
  /** What holds a rail row's control and its tooltip, laid out as the control alone. */
  tip: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

/** What a row may carry beside its words. */
interface RowParts {
  /** Names the row in the Model: its Tooltip, and a branch's open state. Unique in the sidebar. */
  readonly id: string
  readonly label: string
  /** Drawn before the words, hidden from assistive technology; what an icon rail shows. */
  readonly icon?: Html | undefined
  /** A count or a short word at the row's end, such as `'12'`. */
  readonly badge?: string | undefined
}

/** A link nested under a branch. */
export interface SidebarLeaf {
  readonly label: string
  readonly href: string
  /** Whether it leads to the page shown, `aria-current="page"`. */
  readonly current?: boolean | undefined
}

/** A row that leads to a page. */
export interface SidebarLink extends RowParts {
  readonly href: string
  /** Whether it leads to the page shown, `aria-current="page"`. */
  readonly current?: boolean | undefined
  readonly items?: undefined
}

/** A row that shows and hides `items` under it, open while its id is in the Model's `open`. */
export interface SidebarBranch extends RowParts {
  readonly items: ReadonlyArray<SidebarLeaf>
  readonly href?: undefined
}

export type SidebarRow = SidebarLink | SidebarBranch

export interface SidebarGroup {
  /** Names the group in the Model's `open`, unique in the sidebar. */
  readonly id: string
  /** The group's heading; without one, its rows stand alone. */
  readonly title?: string | undefined
  /** Whether the heading shows and hides the rows; default true where there is a heading. */
  readonly collapsible?: boolean | undefined
  readonly rows: ReadonlyArray<SidebarRow>
}

/** @deprecated The old name of `SidebarGroup`, kept while the package index exports it. */
export type SidebarSection = SidebarGroup

const isBranch = (row: SidebarRow): row is SidebarBranch => row.items !== undefined

const Tip = Schema.Struct({ row: Schema.String, tooltip: UiTooltip.Model })

export const Model = Schema.Struct({
  id: Schema.String,
  collapsed: Schema.Boolean,
  /** The ids of the open groups and branches. */
  open: Schema.Array(Schema.String),
  /** A Tooltip per row, by its id, which an icon rail shows its name in. */
  tips: Schema.Array(Tip),
  /** The Sheet the navigation shows in on a phone. */
  sheet: Sheet.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A group's heading or a branch pressed: it shows, or hides. */
  ToggledSection: { id: Schema.String },
  ToggledCollapsed: {},
  /** A branch pressed in an icon rail: the sidebar expands with it open. */
  ExpandedTo: { id: Schema.String },
  GotTip: { row: Schema.String, message: UiTooltip.Message },
  GotSheet: { message: Sheet.Message },
  OpenedSheet: {},
  /** A link followed in the Sheet, which closes it. */
  FollowedInSheet: {},
})
export type Message = typeof Message.Type

export interface InitConfig {
  /** Prefixes every id the sidebar draws, unique on the page. */
  readonly id: string
  /** The ids of the rows a rail names in tooltips: each gets a Tooltip. */
  readonly rows: ReadonlyArray<string>
  readonly collapsed?: boolean | undefined
  /** The groups and branches open at first; default none. */
  readonly open?: ReadonlyArray<string> | undefined
  /** The side the phone's Sheet comes from; default `left`. */
  readonly side?: 'left' | 'right' | undefined
}

/** A sidebar, expanded unless `collapsed`, with a Tooltip for each of `rows`. */
export const init = (config: InitConfig): Model => ({
  id: config.id,
  collapsed: config.collapsed ?? false,
  open: config.open ?? [],
  tips: config.rows.map(row => ({
    row,
    tooltip: UiTooltip.init({ id: `${config.id}-tip-${row}` }),
  })),
  sheet: Sheet.init({ id: `${config.id}-sheet`, side: config.side ?? 'left' }),
})

/** The open groups after `id` is pressed: several stay open, a press flips one. */
export const toggled = (open: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  flipped(open, id)

const sheetStep = (model: Model, step: Sheet.Return): Return<Model, Message> => ({
  model: step.model === model.sheet ? model : modifyFields(model, { sheet: () => step.model }),
  commands: Command.mapMessages(step.commands ?? [], message => Message.GotSheet({ message })),
})

/** The sidebar after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    ToggledSection: ({ id }) => ({
      model: modifyFields(model, { open: open => toggled(open, id) }),
    }),
    ToggledCollapsed: () => ({
      model: modifyFields(model, { collapsed: collapsed => !collapsed }),
    }),
    ExpandedTo: ({ id }) => ({
      model: modifyFields(model, {
        collapsed: () => false,
        open: open => (open.includes(id) ? open : [...open, id]),
      }),
    }),
    GotTip: ({ row, message }) => {
      const at = model.tips.findIndex(tip => tip.row === row)
      const tip = model.tips[at]
      if (tip === undefined) return { model }
      const next = UiTooltip.update(tip.tooltip, message)
      return {
        model:
          next.model === tip.tooltip
            ? model
            : modifyFields(model, {
                tips: tips =>
                  tips.map((each, index) => (index === at ? { row, tooltip: next.model } : each)),
              }),
        commands: Command.mapMessages(next.commands ?? [], inner =>
          Message.GotTip({ row, message: inner }),
        ),
      }
    },
    GotSheet: ({ message }) => sheetStep(model, Sheet.update(model.sheet, message)),
    OpenedSheet: () => sheetStep(model, Sheet.open(model.sheet)),
    FollowedInSheet: () => sheetStep(model, Sheet.close(model.sheet)),
  })

const current = '[aria-current="page"]'

/**
 * What moves the `indicator` and `highlight`, on the navigation: the current
 * link is measured (`--fk-sidebar-chosen-*`), and one highlight follows the
 * pointer to the nearest row (`--fk-sidebar-hover-*`), born at the current
 * one. Pass them beside the style; until they run, the current link fills
 * itself. The phone's Sheet draws its own marker and highlight for them.
 */
export const fluid = [
  Behavior.forSlots(SidebarSlots)<unknown, never>(
    {
      nav: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'sidebar-chosen': current } }),
      }),
    },
    { name: 'SidebarChosen' },
  ).mixin,
  Behavior.forSlots(SidebarSlots)<unknown, never>(
    {
      nav: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'sidebar-hover',
            item: ':is(a, [aria-expanded]):not([inert] *)',
            axis: 'y',
            gapClick: true,
            from: current,
          }),
      }),
    },
    { name: 'SidebarHover' },
  ).mixin,
] as const

export interface SidebarView<Message> {
  readonly model: Model
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** The navigation landmark's name. */
  readonly label: string
  readonly groups: ReadonlyArray<SidebarGroup>
  /** Above the navigation: a workspace's name, a switcher. */
  readonly header?: Html | undefined
  /** Below it: the person signed in, settings. */
  readonly footer?: Html | undefined
  /**
   * Under `'rtl'` a rail's tooltips show on its left, the side the page runs
   * to. Given, it is drawn as the root's `dir`.
   */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** Collapsed, off the page (default) or a rail of icons with their names in tooltips. */
  readonly collapse?: 'offcanvas' | 'icons' | undefined
  /** A style of `SidebarSlots` (`Recipes.Sidebar`). */
  readonly style?: NamedStyle<typeof SidebarSlots> | undefined
  /** Mixins beside the style; `Sidebar.fluid` glides the current link's marker. */
  readonly mixins?: MixinList<Message> | undefined
  /** The rail's tooltips' style and mixins (`Recipes.Tooltip`), as `Tooltip.toView` takes them. */
  readonly tooltip?: MixinList<Message> | undefined
  /** The phone's Sheet's style and mixins (`Recipes.Sheet`); without them, no Sheet is drawn. */
  readonly sheet?: MixinList<Message> | undefined
}

/**
 * The sidebar. The phone's Sheet draws the same groups again, with ids of
 * its own, so the two never share one.
 */
export const view = <Message>(options: SidebarView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    SidebarSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  const rail = options.collapse === 'icons'
  const railed = rail && model.collapsed
  const navId = `${model.id}-nav`
  const collapsed = h.DataAttribute('collapsed', String(model.collapsed))
  const tips = new Map(model.tips.map(tip => [tip.row, tip.tooltip]))
  const drawn = groupsOf(options, builders, h)
  return h.div(
    builders.root.attrs([
      collapsed,
      h.DataAttribute('collapse', rail ? 'icons' : 'offcanvas'),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      // A phone shows only the opener of a sidebar that has a Sheet to open.
      ...(options.sheet === undefined ? [] : [h.DataAttribute('opens-sheet', '')]),
    ]),
    [
      h.button(
        builders.toggle.attrs([
          h.Type('button'),
          h.AriaExpanded(!model.collapsed),
          h.AriaControls(navId),
          h.AriaLabel(model.collapsed ? `Show ${options.label}` : `Hide ${options.label}`),
          h.OnClick(onMessage(Message.ToggledCollapsed())),
        ]),
        [],
      ),
      ...(options.sheet === undefined
        ? []
        : [
            h.button(
              builders.opener.attrs([
                h.Type('button'),
                h.AriaHasPopup('dialog'),
                h.AriaExpanded(Sheet.isOpen(model.sheet)),
                h.AriaLabel(`Open ${options.label}`),
                h.OnClick(onMessage(Message.OpenedSheet())),
              ]),
              [],
            ),
          ]),
      ...(options.header === undefined
        ? []
        : [h.div(builders.header.attrs([collapsed]), [options.header])]),
      h.nav(
        builders.nav.attrs([
          h.Id(navId),
          h.AriaLabel(options.label),
          collapsed,
          // A rail stays in reach: its icons are the navigation.
          ...(model.collapsed && !rail ? [h.Attribute('inert', '')] : []),
        ]),
        [
          h.div(builders.indicator.attrs([h.AriaHidden(true)]), []),
          h.div(builders.highlight.attrs([h.AriaHidden(true)]), []),
          ...drawn({
            prefix: model.id,
            railed,
            // Only a rail names its rows in tooltips: expanded, the words show.
            tip: (row, link) =>
              Option.match(
                Option.filter(Option.fromNullishOr(tips.get(row.id)), () => railed),
                {
                  onNone: () => link([]),
                  onSome: tooltip =>
                    h.submodel({
                      slotId: tooltip.id,
                      model: tooltip,
                      view: UiTooltip.view,
                      viewInputs: {
                        anchor: Tooltip.anchor({
                          placement: options.direction === 'rtl' ? 'left' : 'right',
                        }),
                        toView: Tooltip.toView(options.tooltip ?? [], { h, id: tooltip.id }, tip =>
                          h.div(builders.tip.attrs(), [
                            link(tip.trigger),
                            ...(tip.isVisible
                              ? [
                                  h.div(tip.layer, [
                                    h.div(tip.panel, [h.span(tip.arrow, []), row.label]),
                                  ]),
                                ]
                              : []),
                          ]),
                        ),
                      },
                      toParentMessage: message =>
                        onMessage(Message.GotTip({ row: row.id, message })),
                    }),
                },
              ),
          }),
        ],
      ),
      ...(options.footer === undefined
        ? []
        : [h.div(builders.footer.attrs([collapsed]), [options.footer])]),
      ...(options.sheet === undefined
        ? []
        : [
            Sheet.view(
              {
                model: model.sheet,
                onMessage: message => onMessage(Message.GotSheet({ message })),
                mixins: options.sheet,
                draw: (dialog: ResolvedDialog<Message>) =>
                  h.dialog(
                    dialog.dialog,
                    dialog.isVisible
                      ? [
                          h.div(dialog.backdrop),
                          h.div(dialog.panel, [
                            h.h2(dialog.title, [options.label]),
                            ...(options.header === undefined
                              ? []
                              : [h.div(builders.header.attrs(), [options.header])]),
                            h.nav(builders.nav.attrs([h.AriaLabel(options.label)]), [
                              h.div(builders.indicator.attrs([h.AriaHidden(true)]), []),
                              h.div(builders.highlight.attrs([h.AriaHidden(true)]), []),
                              ...drawn({
                                prefix: `${model.id}-sheet`,
                                railed: false,
                                followed: onMessage(Message.FollowedInSheet()),
                                tip: (_, link) => link([]),
                              }),
                            ]),
                            ...(options.footer === undefined
                              ? []
                              : [h.div(builders.footer.attrs(), [options.footer])]),
                          ]),
                        ]
                      : [],
                  ),
              },
              h,
            ),
          ]),
    ],
  )
}

interface Drawing<Message> {
  /** Prefixes the ids drawn, so the column and the Sheet each have their own. */
  readonly prefix: string
  /** Whether the rows draw as a rail of icons, their names in tooltips. */
  readonly railed: boolean
  /** Sent by a link followed, beside its navigation. */
  readonly followed?: Message
  /** A row's control, drawn with a Tooltip's trigger bundle in a rail. */
  readonly tip: (row: SidebarRow, link: (trigger: SlotAttributes<Message>) => Html) => Html
}

/** The groups drawn as sections, for the column and the Sheet alike. */
const groupsOf =
  <Message>(
    options: SidebarView<Message>,
    builders: SlotBuilders<typeof SidebarSlots, Message>,
    h: HtmlBuilder<Message>,
  ) =>
  (drawing: Drawing<Message>): ReadonlyArray<Html> => {
    const open = new Set(options.model.open)
    const { onMessage } = options
    const state = (shown: boolean) => h.DataAttribute('state', shown ? 'open' : 'closed')
    const rail = drawing.railed
    const followed = drawing.followed === undefined ? [] : [h.OnClick(drawing.followed)]
    const parts = (row: RowParts) => [
      ...(row.icon === undefined
        ? []
        : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [row.icon])]),
      h.span(builders.label.attrs(), [row.label]),
      ...(row.badge === undefined ? [] : [h.span(builders.badge.attrs(), [row.badge])]),
    ]
    const linkOf = (
      leaf: SidebarLeaf,
      extra: SlotAttributes<Message>,
      inner: ReadonlyArray<Html | string>,
    ) =>
      h.a(
        builders.link.attrs([
          ...extra,
          h.Href(leaf.href),
          ...(leaf.current === true ? [h.AriaCurrent('page')] : []),
          ...followed,
        ]),
        inner,
      )
    const drawRow = (row: SidebarRow): Html => {
      if (!isBranch(row)) {
        return h.keyed('li')(row.id, builders.item.attrs(), [
          drawing.tip(row, trigger => linkOf(row, rail ? trigger : [], parts(row))),
        ])
      }
      const shown = open.has(row.id)
      const nestedId = `${drawing.prefix}-${row.id}-items`
      const press = rail
        ? Message.ExpandedTo({ id: row.id })
        : Message.ToggledSection({ id: row.id })
      return h.keyed('li')(row.id, builders.item.attrs([state(shown)]), [
        drawing.tip(row, trigger =>
          h.button(
            builders.branch.attrs([
              ...(rail ? trigger : []),
              h.Type('button'),
              h.AriaExpanded(shown && !rail),
              h.AriaControls(nestedId),
              state(shown),
              h.OnClick(onMessage(press)),
            ]),
            [...parts(row), h.span(builders.chevron.attrs([h.AriaHidden(true)]), [])],
          ),
        ),
        h.ul(
          builders.links.attrs([
            h.Id(nestedId),
            h.DataAttribute('nested', ''),
            state(shown && !rail),
            ...(shown && !rail ? [] : [h.Attribute('inert', '')]),
          ]),
          row.items.map(leaf =>
            h.li(builders.item.attrs(), [
              linkOf(leaf, [], [h.span(builders.label.attrs(), [leaf.label])]),
            ]),
          ),
        ),
      ])
    }
    return options.groups.map(group => {
      const collapsible = group.title !== undefined && group.collapsible !== false
      // A rail shows every group's icons: its headings are hidden, so none can shut.
      const shown = rail || !collapsible || open.has(group.id)
      const linksId = `${drawing.prefix}-${group.id}-links`
      const heading = Option.match(Option.fromNullishOr(group.title), {
        onNone: () => [],
        onSome: title =>
          collapsible
            ? [
                h.button(
                  builders.trigger.attrs([
                    h.Type('button'),
                    h.AriaExpanded(shown),
                    h.AriaControls(linksId),
                    state(shown),
                    h.OnClick(onMessage(Message.ToggledSection({ id: group.id }))),
                  ]),
                  [
                    h.span(builders.title.attrs(), [title]),
                    h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
                  ],
                ),
              ]
            : [h.div(builders.heading.attrs([h.Id(`${linksId}-heading`)]), [title])],
      })
      return h.keyed('div')(group.id, builders.section.attrs([state(shown)]), [
        ...heading,
        h.ul(
          builders.links.attrs([
            h.Id(linksId),
            state(shown),
            ...(collapsible || group.title === undefined
              ? []
              : [h.AriaLabelledBy(`${linksId}-heading`)]),
            ...(shown ? [] : [h.Attribute('inert', '')]),
          ]),
          group.rows.map(drawRow),
        ),
      ])
    })
  }
