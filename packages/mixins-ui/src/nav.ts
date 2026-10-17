import type { ItemInfo, RenderInfo } from '@foldkit/ui/nav'
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { Anchor, topLayer } from './anchor.js'
import { FollowDirection, readingKey } from './direction.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'

/**
 * A navigation menu, shadcn's and the APG's disclosure navigation: a
 * navigation landmark whose list holds links, and triggers that each show a
 * panel of links (a mega menu). Its keys are the browser's (Tab to move,
 * Enter to follow or open), with no roving tab stop, since that is a
 * composite widget's pattern and not a landmark's; the arrows, Home and End
 * move between the top-level links and triggers, and through a panel's
 * links, as the APG's optional keys. `indicator` and `highlight`, drawn in
 * the list, are the current link's marker and the hover that follows the
 * pointer, which `fluid` moves, as Tabs' do; a trigger whose panel holds
 * the current page is marked as current.
 *
 * Two ways in: `view` draws the whole menu from entries and keeps which
 * panel is open in this module's Model, which the application folds with
 * `update`; `toView` (and `resolve`, `draw`) style `@foldkit/ui`'s stateless
 * Nav of links.
 */
export const NavSlots = Slots.define({
  nav: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  link: Slot.make({ capability: Capability.Interactive }),
  /** A top-level button that shows its panel, `aria-expanded`. */
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.Click, Event.KeyDown] }),
  /** The mark that a trigger opens a panel. */
  chevron: Slot.make({ capability: Capability.Container }),
  /** A trigger's panel, in the browser's top layer, placed against its trigger. */
  panel: Slot.make({ capability: Capability.Container }),
  /** A panel's columns of groups. */
  groups: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  /** A group's list of links. */
  links: Slot.make({ capability: Capability.Container }),
  panelItem: Slot.make({ capability: Capability.Container }),
  panelLink: Slot.make({ capability: Capability.Interactive }),
  /** A panel link's words. */
  title: Slot.make({ capability: Capability.Container }),
  /** A panel link's line under its words. */
  description: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

export interface ResolvedNav<Value extends string, Message> {
  readonly nav: SlotAttributes<Message>
  readonly list: SlotAttributes<Message>
  readonly indicator: SlotAttributes<Message>
  readonly highlight: SlotAttributes<Message>
  readonly items: ReadonlyArray<
    Omit<ItemInfo<Value>, 'link'> & {
      readonly item: SlotAttributes<Message>
      readonly link: SlotAttributes<Message>
    }
  >
}

/** Applies `mixins` to the nav's bundles: its landmark, and each item's link. */
export const resolve = <Value extends string, Input, Message>(
  render: RenderInfo<Value>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedNav<Value, Message> => {
  const builders = buildersOf(NavSlots, mixins, context)
  return {
    nav: builders.nav.attrs(render.nav),
    list: builders.list.attrs(),
    // Items of the list, so it holds only `li`s, and nothing a reader counts.
    indicator: builders.indicator.attrs([
      context.h.AriaHidden(true),
      context.h.Role('presentation'),
    ]),
    highlight: builders.highlight.attrs([
      context.h.AriaHidden(true),
      context.h.Role('presentation'),
    ]),
    items: render.items.map(info => ({
      ...info,
      item: builders.item.attrs(),
      // Upstream's bundle marks the current link `aria-current="page"` already.
      link: builders.link.attrs(info.link),
    })),
  }
}

/** The links drawn in a list, the indicator and highlight first. */
export const draw = <Value extends string, Message>(
  nav: ResolvedNav<Value, Message>,
  label: (value: Value) => Html | string,
  h: HtmlBuilder<Message>,
): Html =>
  h.nav(nav.nav, [
    h.ul(nav.list, [
      h.li(nav.indicator, []),
      h.li(nav.highlight, []),
      ...nav.items.map(item =>
        h.keyed('li')(item.value, item.item, [h.a(item.link, [label(item.value)])]),
      ),
    ]),
  ])

/**
 * The nav's `toView`: with no `draw`, the links in a list, each showing
 * `label` of its value; a `draw` of your own receives the bundles.
 */
export const toView =
  <Value extends string, Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    label: (value: Value) => Html | string,
    custom?: (resolved: ResolvedNav<Value, Message>) => Html,
  ) =>
  (render: RenderInfo<Value>): Html => {
    const resolved = resolve(render, mixins, context)
    return custom === undefined ? draw(resolved, label, context.h) : custom(resolved)
  }

/** Marks a panel, so the top-level row's Mounts leave what is inside one alone. */
const PANEL_ATTRIBUTE = 'data-nav-panel'
const outsidePanels = `:not([${PANEL_ATTRIBUTE}] *)`
/** The current link, or a trigger whose panel holds it, in the top-level row only. */
const current = `:is([aria-current="page"], [data-current])${outsidePanels}`

/**
 * What moves the `indicator` and `highlight`, on the list: the current link
 * (or the trigger whose panel holds it) is measured (`--fk-nav-chosen-*`),
 * and one highlight follows the pointer to the nearest top-level link or
 * trigger (`--fk-nav-hover-*`), born at the current one, in a row or a
 * column. Pass them beside the style; until they run, the current link
 * marks itself.
 */
export const fluid = [
  Behavior.forSlots(NavSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'nav-chosen': current } }),
      }),
    },
    { name: 'NavChosen' },
  ).mixin,
  Behavior.forSlots(NavSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'nav-hover',
            item: `:is(a, button)${outsidePanels}`,
            axis: 'xy',
            gapClick: true,
            from: current,
          }),
      }),
    },
    { name: 'NavHover' },
  ).mixin,
  // Measured again when the direction flips, which resizes nothing.
  Behavior.forSlots(NavSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowDirection(),
      }),
    },
    { name: 'NavDirection' },
  ).mixin,
] as const

/** A top-level link. */
export interface NavLink {
  readonly label: string
  readonly href: string
  /** Whether it leads to the page shown, `aria-current="page"`. */
  readonly current?: boolean | undefined
  readonly groups?: undefined
}

/** A link in a panel, its words and a line under them. */
export interface NavPanelLink {
  readonly label: string
  readonly href: string
  readonly description?: string | undefined
  readonly current?: boolean | undefined
}

/** A column of a panel: its links under an optional heading. */
export interface NavPanelGroup {
  readonly title?: string | undefined
  readonly links: ReadonlyArray<NavPanelLink>
}

/** A trigger and the panel it shows. */
export interface NavPanel {
  /** Names the panel in the Model's `open`; unique among the entries. */
  readonly id: string
  readonly label: string
  readonly groups: ReadonlyArray<NavPanelGroup>
  readonly href?: undefined
}

export type NavEntry = NavLink | NavPanel

const isPanel = (entry: NavEntry): entry is NavPanel => entry.groups !== undefined

export const Model = Schema.Struct({
  id: Schema.String,
  /** The panel shown, by its id. */
  open: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

/** A move of focus, worked out by the view from a key and the menu's orientation and direction. */
export const Move = Schema.Literals(['next', 'previous', 'first', 'last'])
export type Move = typeof Move.Type

export const Message = defineMessageUnion({
  /** A trigger pressed: its panel shows, or hides if it showed. */
  Toggled: { panel: Schema.String },
  /** Focus left the menu, a press landed outside it, or a panel's link was followed. */
  Dismissed: {},
  /** Escape in the entry at `index`: its panel hides and its trigger takes focus. */
  Escaped: { index: Schema.Number },
  /** A key among the `count` top-level entries, from the one at `from`. */
  MovedTop: { from: Schema.Number, count: Schema.Number, move: Move },
  /** The key into a trigger's panel: it shows, and its first link takes focus. */
  Entered: { index: Schema.Number, panel: Schema.String },
  /** A key among the `count` links of the panel of entry `entry`, from the one at `from`. */
  MovedInPanel: { entry: Schema.Number, from: Schema.Number, count: Schema.Number, move: Move },
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/** A menu with every panel hidden. `id` prefixes every id it draws, unique on the page. */
export const init = (id: string): Model => ({ id, open: Option.none() })

/** The id of the top-level link or trigger at `index`. */
export const entryId = (id: string, index: number): string => `${id}-entry-${index}`
const panelId = (id: string, index: number): string => `${id}-panel-${index}`
const panelLinkId = (id: string, index: number, link: number): string =>
  `${id}-panel-${index}-link-${link}`

const nextFrame = Effect.callback<void>(resume => {
  requestAnimationFrame(() => resume(Effect.void))
})

/** Frames a panel's link may wait to show: the anchor shows a panel once it has placed it. */
const SHOW_FRAMES = 10

/**
 * Focuses the element with `id` once it is drawn and shows: a panel just
 * opened stays hidden until its anchor has placed it, and a hidden link
 * takes no focus.
 */
const Focus = Command.define('Nav.Focus', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Effect.gen(function* () {
      yield* Render.afterCommit
      for (let frame = 0; frame < SHOW_FRAMES; frame++) {
        const element = document.getElementById(id)
        if (element !== null && element.checkVisibility({ visibilityProperty: true })) {
          element.focus()
          break
        }
        yield* nextFrame
      }
      return Message.CompletedFocus()
    }),
})

const moves: Record<Move, (from: number, count: number) => number> = {
  first: () => 0,
  last: (_, count) => count - 1,
  next: from => from + 1,
  previous: from => from - 1,
}

/** Where `move` lands from `from` among `count`; the ends hold, as the APG's do not wrap. */
const target = (from: number, count: number, move: Move): number =>
  Math.min(count - 1, Math.max(0, moves[move](from, count)))

const sameOpen = Option.makeEquivalence((a: string, b: string) => a === b)

const withOpen = (model: Model, open: Option.Option<string>): Model =>
  sameOpen(open, model.open) ? model : modifyFields(model, { open: () => open })

/** The menu after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Toggled: ({ panel }) => ({
      model: withOpen(
        model,
        Option.contains(model.open, panel) ? Option.none() : Option.some(panel),
      ),
    }),
    Dismissed: () => ({ model: withOpen(model, Option.none()) }),
    Escaped: ({ index }) =>
      Option.isNone(model.open)
        ? { model }
        : {
            model: withOpen(model, Option.none()),
            commands: [Focus({ id: entryId(model.id, index) })],
          },
    MovedTop: ({ from, count, move }) => {
      const to = target(from, count, move)
      return to === from ? { model } : { model, commands: [Focus({ id: entryId(model.id, to) })] }
    },
    Entered: ({ index, panel }) => ({
      model: withOpen(model, Option.some(panel)),
      commands: [Focus({ id: panelLinkId(model.id, index, 0) })],
    }),
    MovedInPanel: ({ entry, from, count, move }) => {
      const to = target(from, count, move)
      return to === from
        ? { model }
        : { model, commands: [Focus({ id: panelLinkId(model.id, entry, to) })] }
    },
    CompletedFocus: () => ({ model }),
  })

/**
 * Reports a pointer press outside `element`'s nearest `nav`, for the open
 * panel: a press on the page does not always move focus (Safari focuses no
 * button it presses), so focus leaving the menu is not enough to hide it.
 */
const PressAway = Mount.defineStream('NavPressAway', {
  messages: [Message.Dismissed],
  execute: ({ element }) =>
    Stream.callback<typeof Message.Dismissed.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const menu = element.closest('nav') ?? element
          const pressed = (event: Event) => {
            if (event.target instanceof Node && !menu.contains(event.target)) {
              Queue.offerUnsafe(queue, Message.Dismissed())
            }
          }
          document.addEventListener('pointerdown', pressed, { capture: true })
          return () => document.removeEventListener('pointerdown', pressed, { capture: true })
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

export interface NavView<Message> {
  readonly model: Model
  readonly entries: ReadonlyArray<NavEntry>
  /** The navigation landmark's name. */
  readonly label: string
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** A row (default) or a column; a column's panels open beside it. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /**
   * Under `'rtl'` the arrows that move along a row swap, and a column's panels
   * open on its left. Given, it is drawn as the nav's `dir`.
   */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** A style of `NavSlots` (`Recipes.Nav`) and mixins beside it; `Nav.fluid` glides the indicator. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The move a key asks for along a line of entries or links, if it asks for one. */
const moveOf = (key: string, along: 'row' | 'column'): Option.Option<Move> => {
  if (key === 'Home') return Option.some('first')
  if (key === 'End') return Option.some('last')
  const [back, forth] = along === 'row' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  if (key === forth) return Option.some('next')
  if (key === back) return Option.some('previous')
  return Option.none()
}

/**
 * The navigation menu: each entry a top-level link, or a trigger with its
 * panel, drawn only while it shows, in the browser's top layer below its
 * trigger (beside it in a column). Escape hides the panel and returns focus
 * to its trigger; focus leaving the menu, a press outside it and a panel's
 * link followed hide it too.
 */
export const view = <Message>(options: NavView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = buildersOf(NavSlots, options.mixins ?? [], { h })
  const { model, entries, onMessage } = options
  const vertical = options.orientation === 'vertical'
  const count = entries.length
  const beside = options.direction === 'rtl' ? 'left-start' : 'right-start'
  const placement = vertical ? beside : 'bottom-start'
  const along = vertical ? 'column' : 'row'
  // The keys that move along the top-level row, on each link and trigger.
  const topKeys = (index: number, into: Option.Option<NavPanel>) =>
    h.OnKeyDownPreventDefault(pressed => {
      const key = readingKey(pressed, options.direction)
      const opens = Option.filter(
        into,
        entry =>
          key === (vertical ? 'ArrowRight' : 'ArrowDown') &&
          entry.groups.some(group => group.links.length > 0),
      )
      if (Option.isSome(opens)) {
        return Option.some(onMessage(Message.Entered({ index, panel: opens.value.id })))
      }
      return Option.map(moveOf(key, along), move =>
        onMessage(Message.MovedTop({ from: index, count, move })),
      )
    })

  const drawLink = (entry: NavLink, index: number) =>
    h.a(
      builders.link.attrs([
        h.Id(entryId(model.id, index)),
        h.Href(entry.href),
        ...(entry.current === true ? [h.AriaCurrent('page')] : []),
        topKeys(index, Option.none()),
      ]),
      [entry.label],
    )

  const drawPanel = (entry: NavPanel, index: number) => {
    let at = 0
    const linksOf = entry.groups.reduce((total, group) => total + group.links.length, 0)
    return h.div(
      builders.panel.attrs([
        h.Id(panelId(model.id, index)),
        h.DataAttribute('nav-panel', ''),
        h.Attribute('popover', 'manual'),
        // Hidden until the anchor first places it; it writes only `left` and
        // `top`, over the browser's `inset: 0`.
        h.Style({ position: 'absolute', margin: '0', visibility: 'hidden', inset: 'auto' }),
        h.OnMount(
          topLayer(
            Anchor({
              buttonId: entryId(model.id, index),
              anchor: { placement, gap: 8, padding: 8, portal: false },
            }),
          ),
        ),
      ]),
      [
        h.div(
          builders.groups.attrs([h.OnMount(Mount.mapMessage(PressAway(), onMessage))]),
          entry.groups.map(group =>
            h.div(builders.group.attrs(), [
              ...(group.title === undefined
                ? []
                : [h.div(builders.heading.attrs([h.AriaHidden(true)]), [group.title])]),
              h.ul(
                builders.links.attrs(group.title === undefined ? [] : [h.AriaLabel(group.title)]),
                group.links.map(link => {
                  const n = at++
                  return h.li(builders.panelItem.attrs(), [
                    h.a(
                      builders.panelLink.attrs([
                        h.Id(panelLinkId(model.id, index, n)),
                        h.Href(link.href),
                        ...(link.current === true ? [h.AriaCurrent('page')] : []),
                        h.OnClick(onMessage(Message.Dismissed())),
                        h.OnKeyDownPreventDefault(key =>
                          Option.map(moveOf(key, 'column'), move =>
                            onMessage(
                              Message.MovedInPanel({ entry: index, from: n, count: linksOf, move }),
                            ),
                          ),
                        ),
                      ]),
                      [
                        h.span(builders.title.attrs(), [link.label]),
                        ...(link.description === undefined
                          ? []
                          : [h.span(builders.description.attrs(), [link.description])]),
                      ],
                    ),
                  ])
                }),
              ),
            ]),
          ),
        ),
      ],
    )
  }

  const drawTrigger = (entry: NavPanel, index: number) => {
    const shown = Option.contains(model.open, entry.id)
    const holdsCurrent = entry.groups.some(group => group.links.some(link => link.current === true))
    return h.button(
      builders.trigger.attrs([
        h.Id(entryId(model.id, index)),
        h.Type('button'),
        h.AriaExpanded(shown),
        h.AriaControls(panelId(model.id, index)),
        ...(holdsCurrent ? [h.DataAttribute('current', '')] : []),
        h.DataAttribute('state', shown ? 'open' : 'closed'),
        h.OnClick(onMessage(Message.Toggled({ panel: entry.id }))),
        topKeys(index, Option.some(entry)),
      ]),
      [entry.label, h.span(builders.chevron.attrs([h.AriaHidden(true)]), [])],
    )
  }

  // Escape from a trigger or its panel, heard on their item while the panel shows.
  const escapes = (index: number) =>
    h.OnKeyDownPreventDefault(key =>
      key === 'Escape' ? Option.some(onMessage(Message.Escaped({ index }))) : Option.none(),
    )

  return h.nav(
    builders.nav.attrs([
      h.AriaLabel(options.label),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      h.OnFocusLeave(onMessage(Message.Dismissed())),
    ]),
    [
      h.ul(
        builders.list.attrs([h.DataAttribute('orientation', vertical ? 'vertical' : 'horizontal')]),
        [
          h.li(builders.indicator.attrs([h.AriaHidden(true), h.Role('presentation')]), []),
          h.li(builders.highlight.attrs([h.AriaHidden(true), h.Role('presentation')]), []),
          ...entries.map((entry, index) => {
            if (!isPanel(entry)) {
              return h.keyed('li')(`link-${entry.href}`, builders.item.attrs(), [
                drawLink(entry, index),
              ])
            }
            const shown = Option.contains(model.open, entry.id)
            return h.keyed('li')(
              `panel-${entry.id}`,
              builders.item.attrs(shown ? [escapes(index)] : []),
              [drawTrigger(entry, index), ...(shown ? [drawPanel(entry, index)] : [])],
            )
          }),
        ],
      ),
    ],
  )
}
