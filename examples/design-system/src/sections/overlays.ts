/**
 * The Menu and Overlays sections as an island: a row-action menu, a popover, a tooltip and a hover card.
 */
import { Schema } from 'effect'
import { Runtime, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { HoverIntent as UiHoverIntent, Menu as UiMenu, Popover as UiPopover } from '@foldkit/ui'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { SlotView } from 'foldkit-mixins'
import {
  Anchor,
  HoverIntent,
  HoverIntentSlots,
  Menu,
  MenuView,
  Popover,
  Tooltip,
} from 'foldkit-mixins-ui'
import { HoverCardStyle, MenuStyle, PageStyle, PopoverStyle, TooltipStyle } from '../style.js'
import { PageSlots } from '../slots.js'
import { foldsFor } from '../fold.js'

const MenuAction = Schema.Union([
  Schema.Literal('Reply'),
  Schema.Literal('Forward'),
  Schema.Literal('Archive'),
  Schema.Literal('Delete'),
])

type MenuAction = typeof MenuAction.Type

const ActionMenu = MenuView.create<MenuAction>()

export const Model = Schema.Struct({
  menu: UiMenu.Model,
  menuChoice: Schema.String,
  popover: UiPopover.Model,
  tooltip: UiTooltip.Model,
  hoverCard: UiHoverIntent.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Menu: { message: UiMenu.Message },
  Popover: { message: UiPopover.Message },
  Tooltip: { message: UiTooltip.Message },
  HoverCard: { message: UiHoverIntent.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  menu: UiMenu.init({ id: 'row-actions' }),
  menuChoice: '',
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

/** The chosen action is the parent's fact; the menu already closed itself. */
const foldMenu = Update.foldChild({
  ...own('menu', Message.Menu),
  update: ActionMenu.update,
  foldOutMessage: UiMenu.OutMessage.match<
    Update.Step<Model, Message>,
    UiMenu.OutMessage<MenuAction>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { menuChoice: () => value }),
      }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    Menu: ({ message }) => foldMenu(model, message),
    Popover: ({ message }) => foldPopover(model, message),
    Tooltip: ({ message }) => foldTooltip(model, message),
    HoverCard: ({ message }) => foldHoverCard(model, message),
  })

const menuItems: ReadonlyArray<MenuAction> = ['Reply', 'Forward', 'Archive', 'Delete']

const itemGroupKey = (item: MenuAction): string =>
  item === 'Archive' || item === 'Delete' ? 'Manage' : 'Respond'

/**
 * A row-action menu: grouped items, one disabled, the choice reported back.
 * The draw mirrors the fork's default markup with the resolved bundles.
 */
const MenuDemo = (model: Pick<Model, 'menu' | 'menuChoice'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.menu.id,
    model: model.menu,
    view: ActionMenu.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
      items: menuItems,
      itemToConfig: (item: MenuAction) => ({ content: h.span([], [item]) }),
      buttonContent: h.span([], ['Actions']),
      isItemDisabled: (item: MenuAction) => item === 'Archive',
      itemGroupKey,
      groupToHeading: (groupKey: string) =>
        groupKey === 'Manage' ? { content: h.span([], ['Manage']) } : undefined,
      toView: Menu.toView([MenuStyle.mixin], { h }),
    },
    toParentMessage: message => Message.Menu({ message }),
  })

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
      model.menuChoice === ''
        ? 'Grouped actions with one disabled. Open it and pick one.'
        : `Chose ${model.menuChoice}.`,
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
