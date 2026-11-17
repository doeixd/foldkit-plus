/**
 * The Menu and Overlays sections as an island: a row-action menu, a popover, a tooltip and a hover card.
 */
import { Option, Schema } from 'effect'
import { Runtime, Update } from 'foldkit'
import { mapMessages } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { HoverIntent as UiHoverIntent, Popover as UiPopover } from '@foldkit/ui'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { SlotView } from 'foldkit-mixins'
import {
  Anchor,
  HoverIntent,
  HoverIntentSlots,
  Icon,
  Menu,
  Popover,
  Tooltip,
} from 'foldkit-mixins-ui'
import {
  HoverCardStyle,
  KbdStyle,
  MenuStyle,
  PageStyle,
  PopoverStyle,
  RowIconStyle,
  TooltipStyle,
} from '../style.js'
import { PageSlots } from '../slots.js'
import { foldsFor } from '../fold.js'

/** A row's words and parts as data; `glyph` is the path of the 16px icon the view draws. */
interface RowSpec {
  readonly value: string
  readonly label: string
  readonly glyph: string
  readonly hint?: string
  readonly shortcut?: readonly [string, ...ReadonlyArray<string>]
  readonly group?: string
  readonly tone?: 'destructive'
}

const ROWS: ReadonlyArray<RowSpec> = [
  {
    value: 'reply',
    label: 'Reply',
    glyph: 'M6 3L2 7l4 4M2 7h8a4 4 0 014 4v2',
    shortcut: ['⌘', 'R'],
    group: 'Respond',
  },
  {
    value: 'forward',
    label: 'Forward',
    glyph: 'M10 3l4 4-4 4M14 7H6a4 4 0 00-4 4v2',
    hint: 'Mail',
    group: 'Respond',
  },
  {
    value: 'archive',
    label: 'Archive',
    glyph: 'M2 4h12v3H2zM3 7v6h10V7M6.5 9.5h3',
    group: 'Manage',
  },
  {
    value: 'delete',
    label: 'Delete',
    glyph: 'M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4',
    shortcut: ['⌫'],
    tone: 'destructive',
    group: 'Manage',
  },
]

export const Model = Schema.Struct({
  menu: Menu.Model,
  picked: Schema.Option(Schema.String),
  popover: UiPopover.Model,
  tooltip: UiTooltip.Model,
  hoverCard: UiHoverIntent.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Menu: { message: Menu.Message },
  Popover: { message: UiPopover.Message },
  Tooltip: { message: UiTooltip.Message },
  HoverCard: { message: UiHoverIntent.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  menu: Menu.init('row-actions', ROWS),
  picked: Option.none(),
  popover: UiPopover.init({ id: 'details-popover' }),
  tooltip: UiTooltip.init({ id: 'hint-tooltip' }),
  hoverCard: UiHoverIntent.init(),
})

const own = foldsFor<Model, Message>()

/** Visibility notifications need no parent state: showing is the child's own fact. */
const foldTooltip = Update.foldChild({
  ...own('tooltip', Message.Tooltip),
  update: UiTooltip.update,
  foldOutMessage: UiTooltip.OutMessage.match<Update.Step<Model, Message>>({
    Shown: () => model => ({ model }),
    Hidden: () => model => ({ model }),
  }),
})

const foldHoverCard = Update.foldChild({
  ...own('hoverCard', Message.HoverCard),
  update: UiHoverIntent.update,
  foldOutMessage: UiHoverIntent.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => model => ({ model }),
    Closed: () => model => ({ model }),
  }),
})

const foldPopover = Update.foldChild({
  ...own('popover', Message.Popover),
  update: UiPopover.update,
  foldOutMessage: UiPopover.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => model => ({ model }),
    Closed: () => model => ({ model }),
  }),
})

/** The Menu reports the value of the row chosen; the Model keeps it, and the menu closed itself. */
const foldMenu = (model: Model, message: Menu.Message): Return<Model, Message> => {
  const next = Menu.update(model.menu, message)
  const picked = Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value)
  const commands = mapMessages(next.commands ?? [], inner => Message.Menu({ message: inner }))
  if (next.model === model.menu && Option.isNone(picked) && commands.length === 0) return { model }
  return {
    model: modifyFields(model, {
      menu: () => next.model,
      picked: current => (Option.isSome(picked) ? picked : current),
    }),
    commands,
  }
}

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Menu: ({ message }) => foldMenu(model, message),
    Popover: ({ message }) => foldPopover(model, message),
    Tooltip: ({ message }) => foldTooltip(model, message),
    HoverCard: ({ message }) => foldHoverCard(model, message),
  })

const rowsOf = (h: HtmlBuilder<Message>): ReadonlyArray<Menu.ItemRow> =>
  ROWS.map(({ glyph, ...row }) => ({
    ...row,
    icon: Icon.view(
      {
        icon: {
          viewBox: '0 0 16 16',
          attributes: {
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '1.5',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          },
          nodes: [{ tag: 'path', attributes: { d: glyph }, children: [] }],
        },
        key: row.value,
        style: RowIconStyle,
      },
      h,
    ),
  }))

/** The row the Model's picked value names: two rows may share a label, so it is found by value. */
const pickedLabel = (model: Pick<Model, 'picked'>): Option.Option<string> =>
  Option.flatMap(model.picked, value =>
    Option.map(Option.fromNullishOr(ROWS.find(row => row.value === value)), row => row.label),
  )

/**
 * A row-action menu: rows with an icon, a hint or a shortcut, a tone for the one that
 * deletes, a disabled one, and two groups under headings. The Menu's own Model and keys
 * do the work; the page draws the rows from data and reads the value it reports.
 */
const MenuDemo = (model: Pick<Model, 'menu'>, h: HtmlBuilder<Message>): Html =>
  Menu.view(
    {
      model: model.menu,
      rows: rowsOf(h),
      buttonContent: h.span([], ['Actions']),
      isRowDisabled: value => value === 'archive',
      onMessage: message => Message.Menu({ message }),
      mixins: [MenuStyle.mixin],
      kbd: KbdStyle,
    },
    h,
  )

/**
 * A live details popover: anchored against its trigger, dismissed on escape
 * or outside press. The draw places the resolved bundles; the backdrop only
 * exists while open.
 */
const PopoverDemo = (model: Pick<Model, 'popover'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.popover.id,
    model: model.popover,
    view: UiPopover.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
      toView: attributes => {
        const resolved = Popover.resolve(attributes, [PopoverStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(resolved.button, ['Show details']),
            ...(resolved.isVisible
              ? [
                  h.div(resolved.backdrop, []),
                  h.div(resolved.panel, [
                    'Project details, anchored live: six people, three open milestones, and one demo that keeps growing.',
                  ]),
                ]
              : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.Popover({ message }),
  })

/**
 * The live hint tooltip: the panel renders only while the component is
 * visible — after the hover delay, or on keyboard focus — and positions
 * itself against the trigger through the anchor.
 */
const TooltipDemo = (model: Pick<Model, 'tooltip'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.tooltip.id,
    model: model.tooltip,
    view: UiTooltip.view,
    viewInputs: {
      anchor: { placement: 'top', gap: 6, padding: 8 },
      toView: attributes => {
        const { trigger, panel, isVisible } = Tooltip.resolve(attributes, [TooltipStyle.mixin], {
          input: undefined,
          h,
          id: model.tooltip.id,
        })
        return h.div(
          [],
          [
            h.button(trigger, ['Hover or focus me']),
            ...(isVisible ? [h.span(panel, ['A helpful hint'])] : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.Tooltip({ message }),
  })

/**
 * A team-member hover card, live: open and close delays keep it from
 * flickering, and the Anchor behavior positions the panel against the
 * trigger. The panel renders only while open.
 */
const AnchorCard = Anchor.behavior(HoverIntentSlots)<unknown, Message>({
  floating: 'panel',
  config: () => ({
    buttonId: 'teammate-button',
    anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
  }),
})

const HoverDemo = (model: Pick<Model, 'hoverCard'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: 'teammate-card',
    model: model.hoverCard,
    view: UiHoverIntent.view,
    viewInputs: {
      focusTriggerSelector: '#teammate-button',
      toView: render => {
        const resolved = HoverIntent.resolve(render, [HoverCardStyle.mixin, AnchorCard.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(
              [...resolved.trigger, h.Type('button'), h.Id('teammate-button')],
              ['A team member'],
            ),
            ...(resolved.isVisible
              ? [
                  h.div(resolved.panel, [
                    'Wren Quan, design engineer. Moving into the card keeps it open; leaving either side starts the close delay.',
                  ]),
                ]
              : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.HoverCard({ message }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      Option.match(pickedLabel(model), {
        onNone: () =>
          'Rows with an icon, a hint, a shortcut and a tone, in two groups, one disabled. Open it and pick one.',
        onSome: label => `Chose ${label}.`,
      }),
    ]),
    MenuDemo(model, h),
    h.h2(slots.sectionTitle.attrs(), ['Overlays']),
    h.p(slots.sectionText.attrs(), [
      'Floating UI with real state: a popover that anchors, a tooltip that shows on hover or focus, and a hover card. Escape or an outside press dismisses them.',
    ]),
    PopoverDemo(model, h),
    TooltipDemo(model, h),
    HoverDemo(model, h),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
