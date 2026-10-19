import * as UiTooltip from '@foldkit/ui/tooltip'
import { Match, Option, Schema, Stream } from 'effect'
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
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FluidHover, Measure, Move } from 'foldkit-primitives/dom'
import { flipped } from './choices.js'
import { readingKey } from './direction.js'
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
 * as Tabs' do.
 *
 * Initialised with a `width`, the column is resizable, and its width is the
 * Model's too: a `resize` handle on its edge drags it within the bounds, and
 * dragged below half the least width it collapses, as one gesture, keeping
 * the width it had to come back to. One Model holds both, so a collapse
 * never leaves the dragged width behind.
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
  /** What leads the header or footer (a logo, an avatar): all a rail shows of it. */
  mark: Slot.make({ capability: Capability.Container }),
  /** The rest of the header or footer, beside its mark; a rail hides it. */
  detail: Slot.make({ capability: Capability.Container }),
  /** A row's words; in an icon rail, kept for its name and hidden. */
  label: Slot.make({ capability: Capability.Container }),
  /** A row's count, at its end. */
  badge: Slot.make({ capability: Capability.Container }),
  /** What holds a rail row's control and its tooltip, laid out as the control alone. */
  tip: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  /** A resizable column's handle on its inline-end edge, a `separator`. */
  resize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
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

/** The header or the footer: a mark, which a rail keeps centred, and what follows it. */
export interface SidebarEnd {
  readonly content: Html
  /** A logo or an avatar, drawn first; without one a rail shows nothing of this end. */
  readonly mark?: Html | undefined
}

export interface SidebarGroup {
  /** Names the group in the Model's `open`, unique in the sidebar. */
  readonly id: string
  /** The group's heading; without one, its rows stand alone. */
  readonly title?: string | undefined
  /** Whether the heading shows and hides the rows; default true where there is a heading. */
  readonly collapsible?: boolean | undefined
  readonly rows: ReadonlyArray<SidebarRow>
}

const isBranch = (row: SidebarRow): row is SidebarBranch => row.items !== undefined

const Tip = Schema.Struct({ row: Schema.String, tooltip: UiTooltip.Model })

/** A resizable column's width, in CSS pixels, and the bounds a drag or a key keeps it in. */
const Width = Schema.Struct({ size: Schema.Number, min: Schema.Number, max: Schema.Number })

export const Model = Schema.Struct({
  id: Schema.String,
  collapsed: Schema.Boolean,
  /** The expanded column's width, when it is resizable; kept while collapsed. */
  width: Schema.Option(Width),
  /** While a drag runs: the width the column showed at the press, and its expanded width then. */
  drag: Schema.Option(Schema.Struct({ from: Schema.Number, size: Schema.Number })),
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
  /** The resize handle pressed, over a column `from` pixels wide. */
  ResizeStarted: { from: Schema.Number },
  /** The press moved `delta` pixels toward the inline end. */
  Resized: { delta: Schema.Number },
  ResizeEnded: {},
  /** The handle's keys: the column expanded, `size` pixels wide within the bounds. */
  SetWidth: { size: Schema.Number },
})
export type Message = typeof Message.Type

const clamp = (size: number, min: number, max: number) => Math.min(max, Math.max(min, size))

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
  /**
   * Given, the column is resizable: `size` wide at first (default 240, the
   * recipe's 15rem), within `min` and `max` (default 192 and 384), in CSS pixels.
   */
  readonly width?:
    | {
        readonly size?: number | undefined
        readonly min?: number | undefined
        readonly max?: number | undefined
      }
    | undefined
}

/** A sidebar, expanded unless `collapsed`, with a Tooltip for each of `rows`. */
export const init = (config: InitConfig): Model => ({
  id: config.id,
  collapsed: config.collapsed ?? false,
  width: Option.map(Option.fromNullishOr(config.width), ({ size, min = 192, max = 384 }) => ({
    size: clamp(size ?? 240, min, max),
    min,
    max,
  })),
  drag: Option.none(),
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

/** The Model with the column `collapsed` and `size` wide expanded; the same Model if neither moved. */
const resized = (model: Model, collapsed: boolean, size: number): Model =>
  Option.match(model.width, {
    onNone: () => model,
    onSome: width =>
      collapsed === model.collapsed && size === width.size
        ? model
        : modifyFields(model, {
            collapsed: () => collapsed,
            width: () => Option.some({ ...width, size }),
          }),
  })

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
    ResizeStarted: ({ from }) =>
      Option.match(model.width, {
        onNone: () => ({ model }),
        onSome: ({ size }) => ({
          model: modifyFields(model, { drag: () => Option.some({ from, size }) }),
        }),
      }),
    // Below half the least width the column collapses, and keeps the width the drag began at.
    Resized: ({ delta }) => ({
      model: Option.match(Option.all([model.width, model.drag]), {
        onNone: () => model,
        onSome: ([{ min, max }, { from, size }]) => {
          const wanted = from + delta
          return wanted < min / 2
            ? resized(model, true, size)
            : resized(model, false, clamp(wanted, min, max))
        },
      }),
    }),
    ResizeEnded: () => ({
      model: Option.isNone(model.drag) ? model : modifyFields(model, { drag: () => Option.none() }),
    }),
    SetWidth: ({ size }) => ({
      model: Option.match(model.width, {
        onNone: () => model,
        onSome: ({ min, max }) => resized(model, false, clamp(size, min, max)),
      }),
    }),
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

/**
 * The resize handle's drag, from the Move Mount: the width the column shows
 * at the press, read from the navigation the handle controls, then each
 * move's distance toward the inline end, which is the left under `rtl`.
 */
const Widen = Mount.defineStream('SidebarWiden', {
  messages: [Message],
  execute: ({ element, viewStateChanges }) => {
    let across = 1
    return Move()
      .f(element, viewStateChanges)
      .pipe(
        Stream.map(fact =>
          Match.valueTags(fact, {
            MoveStarted: () => {
              across = element.matches(':dir(rtl)') ? -1 : 1
              const nav = element.ownerDocument.getElementById(
                element.getAttribute('aria-controls') ?? '',
              )
              return Message.ResizeStarted({ from: nav?.getBoundingClientRect().width ?? 0 })
            },
            Moved: ({ deltaX }) => Message.Resized({ delta: deltaX * across }),
            MoveEnded: () => Message.ResizeEnded(),
          }),
        ),
      )
  },
})

/** What an arrow key on the resize handle moves the width by, in CSS pixels. */
const STEP = 16

export interface SidebarView<Message> {
  readonly model: Model
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** The navigation landmark's name. */
  readonly label: string
  readonly groups: ReadonlyArray<SidebarGroup>
  /** Above the navigation: a workspace's logo and name, a switcher. */
  readonly header?: SidebarEnd | undefined
  /** Below it: the person signed in, settings. */
  readonly footer?: SidebarEnd | undefined
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
  const end = (
    slot: typeof builders.header,
    given: SidebarEnd | undefined,
    attributes: ReadonlyArray<Attribute<Message>>,
  ): ReadonlyArray<Html> =>
    given === undefined
      ? []
      : [
          h.div(slot.attrs(attributes), [
            ...(given.mark === undefined ? [] : [h.span(builders.mark.attrs(), [given.mark])]),
            h.div(builders.detail.attrs(), [given.content]),
          ]),
        ]
  return h.div(
    builders.root.attrs([
      collapsed,
      h.DataAttribute('collapse', rail ? 'icons' : 'offcanvas'),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      // A phone shows only the opener of a sidebar that has a Sheet to open.
      ...(options.sheet === undefined ? [] : [h.DataAttribute('opens-sheet', '')]),
      ...Option.match(model.width, {
        onNone: () => [],
        onSome: ({ size }) => [h.Style({ '--_fk-sidebar-width': `${size}px` })],
      }),
      // While dragged, the column follows the pointer at once; otherwise it eases.
      ...(Option.isSome(model.drag) ? [h.DataAttribute('resizing', '')] : []),
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
      ...end(builders.header, options.header, [collapsed]),
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
      ...end(builders.footer, options.footer, [collapsed]),
      ...Option.match(model.width, {
        onNone: () => [],
        onSome: ({ size, min, max }) => [
          h.div(
            builders.resize.attrs([
              h.Role('separator'),
              h.AriaOrientation('vertical'),
              h.AriaLabel(`Resize ${options.label}`),
              h.AriaControls(navId),
              // Collapsed is the handle's least place, below the bounds a drag keeps.
              h.AriaValuemin(0),
              h.AriaValuemax(max),
              h.AriaValuenow(model.collapsed ? 0 : size),
              h.Tabindex(0),
              h.OnKeyDownSelfPreventDefault(pressed => {
                const key = readingKey(pressed, options.direction)
                const to = (width: number) =>
                  Option.some(onMessage(Message.SetWidth({ size: width })))
                if (key === 'Home') return to(min)
                if (key === 'End') return to(max)
                if (key === 'ArrowLeft') return to(size - STEP)
                if (key === 'ArrowRight') return to(size + STEP)
                if (key === 'Enter') return Option.some(onMessage(Message.ToggledCollapsed()))
                return Option.none()
              }),
              h.OnDoubleClick(onMessage(Message.ToggledCollapsed())),
              h.OnMount(Mount.mapMessage(Widen(), onMessage)),
            ]),
            [],
          ),
        ],
      }),
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
                            ...end(builders.header, options.header, []),
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
                            ...end(builders.footer, options.footer, []),
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
