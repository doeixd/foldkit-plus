import { Effect, Match, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { Bounds } from 'foldkit-primitives/observers'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A floating panel, Zag's: a non-modal window over the page that its header
 * drags, its edges and corners resize, and its controls minimize, maximize,
 * restore and close. Where it is and how big is this Model, which the
 * application keeps and folds with `update(limits)`; the view draws it
 * there, fixed to the viewport.
 *
 * ```text
 * drag trigger, edge: Move -> Gesture* -> update -> rect, kept within the viewport
 * arrows on the drag trigger or the corner -> Nudged -> update -> rect
 * view: rect, stage -> left, top, width, height; order -> stacking
 * ```
 *
 * The viewport is measured by `Bounds` on a box of its size drawn beside
 * the panel, so a drag cannot take the panel past it (`overflow` allows
 * it). A drag is worked out from where it began, so a clamped move gives
 * the panel back as the pointer returns. Minimized, the body hides and the
 * panel cannot be resized; maximized, it fills the viewport and cannot be
 * moved, and restore puts it back where it was.
 *
 * Several panels stack by `order`, the application's list of their ids
 * from the bottom: a press or focus inside one sends the `Raised`
 * OutMessage, which the application folds with `raise`. The topmost is
 * marked `data-topmost`, the others `data-behind`.
 *
 * The panel is a non-modal dialog named by its title. Its drag trigger is a
 * tab stop the arrows move the panel from, and its bottom-end corner one they
 * resize it from (`step` a press, five times that with Shift); Escape
 * closes it.
 */
export const FloatingPanelSlots = Slots.define({
  /** Around the panel and its measure; drawn as no box. */
  root: Slot.make({ capability: Capability.Container }),
  /** A box the viewport's size that `Bounds` measures; never seen. */
  boundary: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.PointerDown, Event.Focus],
    attributes: [Attr.Role],
  }),
  /** The bar along the top: the drag trigger and the controls. */
  header: Slot.make({ capability: Capability.Container }),
  /**
   * The part of the header a drag moves the panel by, and the arrows from
   * focus: apart from the controls, whose presses a captured drag would take.
   */
  dragTrigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown, Event.PointerDown],
    attributes: [Attr.AriaLabel],
  }),
  title: Slot.make({ capability: Capability.Container }),
  controls: Slot.make({ capability: Capability.Container }),
  minimize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  maximize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  restore: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  close: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  body: Slot.make({ capability: Capability.Container }),
  /** An edge or corner a drag resizes from, named by `data-edge`; the bottom-end corner takes the arrows too. */
  handle: Slot.make({ capability: Capability.Interactive, attributes: [Attr.AriaLabel] }),
})

export const Stage = Schema.Literals(['default', 'minimized', 'maximized'])
export type Stage = typeof Stage.Type

/** What a gesture moves: the whole panel, or one edge or corner of it. */
export const Handle = Schema.Literals(['move', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])
export type Handle = typeof Handle.Type
export type Edge = Exclude<Handle, 'move'>

export const Rect = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})
export type Rect = typeof Rect.Type

export const Model = Schema.Struct({
  /** Prefixes every id the panel draws, and names it in a stack's `order`. */
  id: Schema.String,
  open: Schema.Boolean,
  stage: Stage,
  /** Where the panel is in the viewport and its size, in CSS pixels, from the top left. */
  rect: Rect,
  /** The viewport's size, once measured; 0 before. */
  boundary: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  /** While a drag runs: what it moves, and the rect as it began. */
  gesture: Schema.Option(Schema.Struct({ handle: Handle, from: Rect })),
  /** The element to give focus back to on close, when opened from one. */
  opener: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Measured: { width: Schema.Number, height: Schema.Number },
  GestureStarted: { handle: Handle },
  /** From where the gesture began, in CSS pixels. */
  GestureMoved: { deltaX: Schema.Number, deltaY: Schema.Number },
  GestureEnded: {},
  /** An arrow key moved or resized the panel by this much. */
  Nudged: { handle: Handle, deltaX: Schema.Number, deltaY: Schema.Number },
  StageChosen: { stage: Stage },
  Closed: {},
  /** A press or focus inside the panel. */
  Activated: {},
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/** Told to the application: bring this panel above the others (`raise`). */
export const Raised = Schema.TaggedStruct('Raised', { id: Schema.String })
export type Raised = typeof Raised.Type

/** The smallest size `update` lets a resize reach, unless the limits say otherwise. */
export const MIN_SIZE = { width: 160, height: 96 } as const

export interface Limits {
  /** Default `MIN_SIZE`. */
  readonly min?: { readonly width: number; readonly height: number } | undefined
  readonly max?: { readonly width: number; readonly height: number } | undefined
  /** Snaps every move and resize to multiples of this many pixels. */
  readonly grid?: number | undefined
  /** Whether the panel may go past the viewport; default false. */
  readonly overflow?: boolean | undefined
}

export const init = (options: {
  readonly id: string
  readonly rect: Rect
  readonly open?: boolean | undefined
}): Model => ({
  id: options.id,
  open: options.open ?? false,
  stage: 'default',
  rect: options.rect,
  boundary: { width: 0, height: 0 },
  gesture: Option.none(),
  opener: Option.none(),
})

const panelId = (id: string): string => `${id}-panel`
const titleId = (id: string): string => `${id}-title`

/** Focuses the element of this id once the render that drew it has committed. */
export const Focus = Command.define('FloatingPanel.Focus', {
  args: { elementId: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ elementId }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        document.getElementById(elementId)?.focus()
        return Message.CompletedFocus()
      }),
    ),
})

export type Return = ReturnWithOutMessage<Model, Message, Raised>

/**
 * Opens the panel where it last was and focuses it; `opener`, the id of
 * what opened it, takes focus back on close.
 */
export const open = (model: Model, options: { readonly opener?: string } = {}): Return =>
  model.open
    ? { model }
    : {
        model: modifyFields(model, {
          open: () => true,
          opener: () => Option.fromNullishOr(options.opener),
        }),
        commands: [Focus({ elementId: panelId(model.id) })],
      }

/** Closes the panel, keeping where it was, and gives focus back to its opener. */
export const close = (model: Model): Return =>
  model.open
    ? {
        model: modifyFields(model, { open: () => false, gesture: () => Option.none() }),
        commands: Option.match(model.opener, {
          onNone: () => [],
          onSome: elementId => [Focus({ elementId })],
        }),
      }
    : { model }

/** `order` with `id` on top: the same array when it already is. */
export const raise = (order: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  order[order.length - 1] === id ? order : [...order.filter(other => other !== id), id]

const within = (value: number, least: number, most: number) =>
  Math.min(Math.max(value, least), Math.max(least, most))

const sameRect = (a: Rect, b: Rect) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * Where `from` goes when `handle` moves by `deltaX`, `deltaY`, within the
 * limits and the viewport. Pure, so a drag and the keys agree.
 */
export const moveRect = (
  from: Rect,
  handle: Handle,
  deltaX: number,
  deltaY: number,
  boundary: { readonly width: number; readonly height: number },
  limits: Limits = {},
): Rect => {
  const grid = limits.grid ?? 0
  const snap = (value: number) => (grid > 0 ? Math.round(value / grid) * grid : value)
  const dx = snap(deltaX)
  const dy = snap(deltaY)
  // Unmeasured, there is no viewport to keep it in yet.
  const bounded = limits.overflow !== true && boundary.width > 0 && boundary.height > 0
  if (handle === 'move') {
    const x = from.x + dx
    const y = from.y + dy
    return {
      ...from,
      x: bounded ? within(x, 0, boundary.width - from.width) : x,
      y: bounded ? within(y, 0, boundary.height - from.height) : y,
    }
  }
  const min = limits.min ?? MIN_SIZE
  const max = limits.max ?? { width: Infinity, height: Infinity }
  const span = (
    start: number,
    size: number,
    delta: number,
    side: 'start' | 'end' | 'none',
    least: number,
    most: number,
    room: number,
  ): readonly [number, number] => {
    if (side === 'none') return [start, size]
    const end = start + size
    if (side === 'end') {
      const reach = bounded ? room - start : Infinity
      return [start, within(size + delta, least, Math.min(most, reach))]
    }
    const reach = bounded ? end : Infinity
    const next = within(size - delta, least, Math.min(most, reach))
    return [end - next, next]
  }
  const sideX = handle.includes('w') ? 'start' : handle.includes('e') ? 'end' : 'none'
  const sideY = handle.includes('n') ? 'start' : handle.includes('s') ? 'end' : 'none'
  const [x, width] = span(from.x, from.width, dx, sideX, min.width, max.width, boundary.width)
  const [y, height] = span(from.y, from.height, dy, sideY, min.height, max.height, boundary.height)
  return { x, y, width, height }
}

/** The panel's `update` within `limits`; the same Model when nothing changes. */
export const update = (limits: Limits = {}) => {
  const placed = (model: Model, rect: Rect): Return =>
    sameRect(rect, model.rect) ? { model } : { model: modifyFields(model, { rect: () => rect }) }

  /** Whether `handle` may change the panel at its stage. */
  const allowed = (model: Model, handle: Handle) =>
    model.stage === 'default' || (model.stage === 'minimized' && handle === 'move')

  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Measured: ({ width, height }) => {
        if (width === model.boundary.width && height === model.boundary.height) return { model }
        const boundary = { width, height }
        // A smaller viewport brings the panel back inside it.
        const rect = moveRect(model.rect, 'move', 0, 0, boundary, limits)
        return { model: modifyFields(model, { boundary: () => boundary, rect: () => rect }) }
      },
      GestureStarted: ({ handle }) =>
        allowed(model, handle)
          ? {
              model: modifyFields(model, {
                gesture: () => Option.some({ handle, from: model.rect }),
              }),
            }
          : { model },
      GestureMoved: ({ deltaX, deltaY }) =>
        Option.match(model.gesture, {
          onNone: () => ({ model }),
          onSome: ({ handle, from }) =>
            placed(model, moveRect(from, handle, deltaX, deltaY, model.boundary, limits)),
        }),
      GestureEnded: () =>
        Option.isNone(model.gesture)
          ? { model }
          : { model: modifyFields(model, { gesture: () => Option.none() }) },
      Nudged: ({ handle, deltaX, deltaY }) =>
        allowed(model, handle)
          ? placed(model, moveRect(model.rect, handle, deltaX, deltaY, model.boundary, limits))
          : { model },
      StageChosen: ({ stage }) =>
        stage === model.stage
          ? { model }
          : { model: modifyFields(model, { stage: () => stage, gesture: () => Option.none() }) },
      Closed: () => close(model),
      Activated: () => ({ model, outMessage: Raised.make({ id: model.id }) }),
      CompletedFocus: () => ({ model }),
    })
}

/** The arrows' directions, physical: a panel is placed from the top left either way. */
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const EDGES: ReadonlyArray<Edge> = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']

export interface FloatingPanelView<ParentMessage> {
  readonly model: Model
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** The title, naming the panel and its header. */
  readonly title: string
  readonly content: Html
  /** The ids of every panel on the page, from the bottom; the last is on top. */
  readonly order?: ReadonlyArray<string> | undefined
  /** Whether it can be resized; default true. */
  readonly resizable?: boolean | undefined
  /** Whether its header drags it; default true. */
  readonly draggable?: boolean | undefined
  /** Whether Escape closes it; default true. */
  readonly closeOnEscape?: boolean | undefined
  /** Pixels an arrow moves or resizes it by; five times that with Shift. Default 10. */
  readonly step?: number | undefined
  /** Default `'ltr'`; under `'rtl'` the corner the arrows resize from is the bottom left. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** The controls' words, defaults `Minimize`, `Maximize`, `Restore`, `Close`, and the header's and corner's. */
  readonly labels?:
    | {
        readonly minimize?: string
        readonly maximize?: string
        readonly restore?: string
        readonly close?: string
        readonly move?: string
        readonly resize?: string
      }
    | undefined
  /** A style of `FloatingPanelSlots`, for the look. */
  readonly style?: NamedStyle<typeof FloatingPanelSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

/** The z-index of the lowest panel in a stack, above the page's own layers. */
export const BASE_LAYER = 40

export const view = <ParentMessage>(
  options: FloatingPanelView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  if (options.title.trim() === '') throw new Error('FloatingPanel: a title is required, its name')
  const { model, onMessage } = options
  if (!model.open) return h.empty
  const builders = SlotView.buildersFor(
    FloatingPanelSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const send = (message: Message) => onMessage(message)
  const { id, rect, stage } = model
  const labels = options.labels ?? {}
  const step = options.step ?? 10
  const resizable = options.resizable !== false && stage === 'default'
  const draggable = options.draggable !== false && stage !== 'maximized'
  // A panel missing from the order is drawn above it, as the last opened would be.
  const given = options.order ?? []
  const order = given.includes(id) ? given : [...given, id]
  const place = Math.max(0, order.indexOf(id))
  const topmost = place === order.length - 1
  // The corner at the bottom and the end of the reading.
  const corner: Edge = options.direction === 'rtl' ? 'sw' : 'se'

  const arrows = (handle: Handle) =>
    h.OnKeyDownSelfPreventDefault((key, modifiers) =>
      Option.map(Option.fromNullishOr(ARROWS[key]), ([x, y]) => {
        const by = modifiers.shiftKey ? step * 5 : step
        return send(Message.Nudged({ handle, deltaX: x * by, deltaY: y * by }))
      }),
    )

  const gesture = (handle: Handle) =>
    h.OnMount(
      Mount.mapMessage(Move(), fact =>
        send(
          Match.valueTags(fact, {
            MoveStarted: () => Message.GestureStarted({ handle }),
            Moved: ({ deltaX, deltaY }) => Message.GestureMoved({ deltaX, deltaY }),
            MoveEnded: () => Message.GestureEnded(),
          }),
        ),
      ),
    )

  const control = (builder: typeof builders.close, label: string, message: Message, key: string) =>
    h.button(
      builder.attrs([h.Key(key), h.Type('button'), h.AriaLabel(label), h.OnClick(send(message))]),
      [],
    )

  const stageControls =
    stage === 'default'
      ? [
          control(
            builders.minimize,
            labels.minimize ?? 'Minimize',
            Message.StageChosen({ stage: 'minimized' }),
            'minimize',
          ),
          control(
            builders.maximize,
            labels.maximize ?? 'Maximize',
            Message.StageChosen({ stage: 'maximized' }),
            'maximize',
          ),
        ]
      : [
          control(
            builders.restore,
            labels.restore ?? 'Restore',
            Message.StageChosen({ stage: 'default' }),
            'restore',
          ),
        ]

  const handles = resizable
    ? EDGES.map(edge =>
        h.div(
          builders.handle.attrs([
            h.Key(`${edge}-${corner}`),
            h.DataAttribute('edge', edge),
            // The browser's own pan would take the press away from the drag.
            h.Style({ touchAction: 'none' }),
            gesture(edge),
            ...(edge === corner
              ? [
                  h.Tabindex(0),
                  h.Role('button'),
                  h.AriaLabel(labels.resize ?? `Resize ${options.title}`),
                  h.AriaKeyshortcuts('ArrowUp ArrowDown ArrowLeft ArrowRight'),
                  arrows(edge),
                ]
              : [h.AriaHidden(true)]),
          ]),
          [],
        ),
      )
    : []

  const placement =
    stage === 'maximized'
      ? { position: 'fixed', inset: '0', width: 'auto', height: 'auto' }
      : {
          position: 'fixed',
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          ...(stage === 'minimized' ? {} : { height: `${rect.height}px` }),
        }

  return h.div(builders.root.attrs([h.Style({ display: 'contents' })]), [
    h.div(
      builders.boundary.attrs([
        h.AriaHidden(true),
        h.Style({ position: 'fixed', inset: '0', visibility: 'hidden', pointerEvents: 'none' }),
        h.OnMount(
          Mount.mapMessage(Bounds(), ({ width, height }) =>
            send(Message.Measured({ width, height })),
          ),
        ),
      ]),
      [],
    ),
    h.div(
      builders.panel.attrs([
        h.Id(panelId(id)),
        h.Role('dialog'),
        h.AriaModal(false),
        h.AriaLabelledBy(titleId(id)),
        h.Tabindex(-1),
        h.DataAttribute('stage', stage),
        h.DataAttribute(topmost ? 'topmost' : 'behind', ''),
        ...(Option.isSome(model.gesture) ? [h.DataAttribute('dragging', '')] : []),
        ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
        // The rect is the panel's outer box, border included.
        h.Style({ ...placement, boxSizing: 'border-box', zIndex: String(BASE_LAYER + place) }),
        h.OnPointerDown(() => Option.some(send(Message.Activated()))),
        h.OnFocusEnter(send(Message.Activated())),
        ...(options.closeOnEscape === false
          ? []
          : [
              h.OnKeyDownPreventDefault(key =>
                key === 'Escape' ? Option.some(send(Message.Closed())) : Option.none(),
              ),
            ]),
      ]),
      [
        h.div(builders.header.attrs(), [
          h.div(
            builders.dragTrigger.attrs([
              ...(draggable
                ? [
                    h.Tabindex(0),
                    h.AriaLabel(labels.move ?? `Move ${options.title}`),
                    h.AriaKeyshortcuts('ArrowUp ArrowDown ArrowLeft ArrowRight'),
                    h.Style({ touchAction: 'none' }),
                    arrows('move'),
                    gesture('move'),
                  ]
                : []),
              // Maximized it holds no drag, and an element keeps the Mount it was drawn with.
              h.Key(draggable ? 'draggable' : 'fixed'),
            ]),
            [h.span(builders.title.attrs([h.Id(titleId(id))]), [options.title])],
          ),
          h.div(builders.controls.attrs(), [
            ...stageControls,
            control(builders.close, labels.close ?? 'Close', Message.Closed(), 'close'),
          ]),
        ]),
        h.div(builders.body.attrs(stage === 'minimized' ? [h.Hidden(true)] : []), [
          options.content,
        ]),
        ...handles,
      ],
    ),
  ])
}
