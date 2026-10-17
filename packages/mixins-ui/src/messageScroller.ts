import { Effect, Queue, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import type { MixinList } from './resolve.js'
import { view as scrollArea, type ScrollAreaSlots } from './scrollArea.js'

/**
 * A message scroller: a conversation's messages in a `ScrollArea` that
 * keeps the newest in view while the reader is at the bottom, stops
 * following once they scroll up, and offers a button back to the latest
 * that counts what arrived meanwhile. Older messages loaded above leave
 * what the reader looks at where it was.
 *
 * ```text
 * scroll position -> FollowEnd -> LeftEnd / ReachedEnd -> update -> following
 * new message -> Appended -> unseen (while not following)
 * jump button -> Jumped -> ScrollToEnd -> ReachedEnd
 * ```
 *
 * The scroll position is the browser's, and the Mount on the log reads it:
 * while the log's end is in view it scrolls to the end whenever the log
 * grows, a streamed answer included, and otherwise keeps the first message
 * in view at the same place. The Model only mirrors what the Mount saw, for
 * the button; the application tells it what arrived (`Appended`), since
 * only the application knows a new message from an older one loaded above.
 *
 * The log is the APG's `role="log"`, named by `label`: a reader hears what
 * is added to it, and a `ChatMessage` still streaming is `aria-busy`, so an
 * answer is read once whole. The scroller fills the height of what holds it.
 */
export const MessageScrollerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  log: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  jump: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  /** How many arrived since the reader left the end, beside the jump button's mark. */
  count: Slot.make({ capability: Capability.Container }),
})

export const Model = Schema.Struct({
  /** Prefixes every id the scroller draws, unique on the page. */
  id: Schema.String,
  /** The log's end is in view, so the scroller follows what arrives. */
  following: Schema.Boolean,
  /** Messages appended since the reader left the end. */
  unseen: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The reader scrolled up from the end. */
  LeftEnd: {},
  /** The log's end came into view: by the reader, by the jump, or when drawn. */
  ReachedEnd: {},
  /** The application added `count` messages at the end. */
  Appended: { count: Schema.Number },
  /** The jump button was pressed. */
  Jumped: {},
  CompletedScrollToEnd: {},
})
export type Message = typeof Message.Type

export const init = (options: { readonly id: string }): Model => ({
  id: options.id,
  following: true,
  unseen: 0,
})

/** The id of the log of the scroller `id`, which `ScrollToEnd` looks up. */
export const logId = (id: string): string => `${id}-log`

const jumpId = (id: string): string => `${id}-jump`

/** How near the end, in pixels, counts as at it: a fraction of a line short still follows. */
const NEAR = 16

/** Whether the theme or the reader asked for nothing to move: the `travel` or `motion` knob at 0. */
const still = (element: Element): boolean => {
  const style = getComputedStyle(element)
  return (
    style.getPropertyValue('--fk-knob-travel').trim() === '0' ||
    style.getPropertyValue('--fk-knob-motion').trim() === '0' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Scrolls the scroller `id` to its end once the render has committed,
 * smoothly unless motion is stilled. A jump button that held the focus
 * hands it to the scrolling area, since the button goes once the end is in
 * view.
 */
export const ScrollToEnd = Command.define('MessageScroller.ScrollToEnd', {
  args: { id: Schema.String },
  messages: [Message.CompletedScrollToEnd],
  execute: ({ id }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const scroller = document.getElementById(logId(id))?.parentElement
        if (scroller instanceof HTMLElement) {
          if (document.activeElement === document.getElementById(jumpId(id))) {
            scroller.focus({ preventScroll: true })
          }
          scroller.scrollTo({
            top: scroller.scrollHeight,
            behavior: still(scroller) ? 'instant' : 'smooth',
          })
        }
        return Message.CompletedScrollToEnd()
      }),
    ),
})

/**
 * Follows the log's end, as a Mount on the log, whose parent is what
 * scrolls. It tells the reader leaving the end (a scroll up) from the log
 * growing: a scroll that moves up and leaves the end stops following, and
 * one that reaches within `NEAR` of the end starts again. While following,
 * any growth (a message, a streamed word, a picture loading) scrolls to
 * the end; otherwise the first message in view is held where it was, so a
 * page of older messages lands above it unseen. It turns the browser's own
 * scroll anchoring off on the scroller, which would correct the same growth
 * a second time, and which Safari lacks. Without a `ResizeObserver` (a DOM with no
 * layout) it only reports the end reached. A Scene test of a page that
 * draws the scroller resolves it: `Scene.Mount.resolve(FollowEnd, Message.ReachedEnd())`.
 */
export const FollowEnd = Mount.defineStream('MessageScroller.FollowEnd', {
  messages: [Message.LeftEnd, Message.ReachedEnd],
  execute: ({ element }) =>
    Stream.callback<Extract<Message, { readonly _tag: 'LeftEnd' | 'ReachedEnd' }>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const scroller = element.parentElement
          if (scroller === null || typeof ResizeObserver === 'undefined') {
            Queue.offerUnsafe(queue, Message.ReachedEnd())
            return () => {}
          }
          let following = true
          let lastTop = 0
          let held: { readonly node: HTMLElement; readonly at: number } | undefined
          const toEnd = () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' })
          const distance = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
          /**
           * Where an element is laid out, down the page: its offsets summed, which no scroll and
           * no transform moves, so a message still rising in on its entrance reads where it lands.
           */
          const laidOut = (node: HTMLElement): number => {
            let at = 0
            for (
              let each: Element | null = node;
              each instanceof HTMLElement;
              each = each.offsetParent
            ) {
              at += each.offsetTop
            }
            return at
          }
          /**
           * The innermost element at the top of the view: children are searched by halves, as
           * they stand top to bottom, and the search goes down into the one found, so a message
           * inside a group is held, not the group.
           */
          const firstInView = () => {
            const top = scroller.getBoundingClientRect().top
            let found: HTMLElement | undefined
            let level: HTMLCollection = element.children
            while (level.length > 0) {
              let low = 0
              let high = level.length
              while (low < high) {
                const middle = (low + high) >> 1
                if (level[middle]!.getBoundingClientRect().bottom > top) high = middle
                else low = middle + 1
              }
              const node = level[low]
              if (!(node instanceof HTMLElement)) break
              found = node
              level = node.children
            }
            return found === undefined ? undefined : { node: found, at: laidOut(found) }
          }
          const remember = () => {
            lastTop = scroller.scrollTop
            held = firstInView()
          }
          const report = (now: boolean) => {
            if (now === following) return
            following = now
            Queue.offerUnsafe(queue, now ? Message.ReachedEnd() : Message.LeftEnd())
          }
          const scrolled = () => {
            if (distance() <= NEAR) report(true)
            else if (scroller.scrollTop < lastTop) report(false)
            remember()
          }
          const grew = () => {
            if (following) toEnd()
            else if (held !== undefined && held.node.isConnected) {
              const moved = laidOut(held.node) - held.at
              if (Math.abs(moved) >= 0.5) {
                scroller.scrollTo({ top: scroller.scrollTop + moved, behavior: 'instant' })
              }
            }
            remember()
          }
          const observer = new ResizeObserver(grew)
          const anchoring = scroller.style.overflowAnchor
          scroller.style.overflowAnchor = 'none'
          scroller.addEventListener('scroll', scrolled, { passive: true })
          observer.observe(element)
          toEnd()
          remember()
          Queue.offerUnsafe(queue, Message.ReachedEnd())
          return () => {
            observer.disconnect()
            scroller.removeEventListener('scroll', scrolled)
            scroller.style.overflowAnchor = anchoring
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

type Return = Update.Return<Model, Message>

/** The scroller's `update`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    LeftEnd: () =>
      model.following ? { model: modifyFields(model, { following: () => false }) } : { model },
    ReachedEnd: () =>
      model.following && model.unseen === 0
        ? { model }
        : { model: modifyFields(model, { following: () => true, unseen: () => 0 }) },
    Appended: ({ count }) =>
      model.following || count <= 0
        ? { model }
        : { model: modifyFields(model, { unseen: () => model.unseen + count }) },
    Jumped: () => ({ model, commands: [ScrollToEnd({ id: model.id })] }),
    CompletedScrollToEnd: () => ({ model }),
  })

export interface MessageScrollerView<ParentMessage> {
  readonly model: Model
  /** Names the log: `Conversation with Ada`. */
  readonly label: string
  /** The messages, such as a `ChatMessage.group`, top to bottom. */
  readonly content: ReadonlyArray<Html>
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** The jump button's name; default `Jump to latest`. */
  readonly jumpLabel?: string | undefined
  /** How the count is read; default `1 new message`, `3 new messages`. */
  readonly unseenLabel?: ((count: number) => string) | undefined
  /** A style of `MessageScrollerSlots`, for the look. */
  readonly style?: NamedStyle<typeof MessageScrollerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
  /** A style of `ScrollAreaSlots`, for the area the log scrolls in. */
  readonly areaStyle?: NamedStyle<typeof ScrollAreaSlots> | undefined
  /** Mixins beside the area's style, such as `ScrollArea.overlayBars`. */
  readonly areaMixins?: MixinList<ParentMessage> | undefined
}

const unseenWords = (count: number) => (count === 1 ? '1 new message' : `${count} new messages`)

export const view = <ParentMessage>(
  options: MessageScrollerView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    MessageScrollerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  const jumpLabel = options.jumpLabel ?? 'Jump to latest'
  const unseen = model.unseen > 0 ? [(options.unseenLabel ?? unseenWords)(model.unseen)] : []
  const log = h.div(
    builders.log.attrs([
      h.Id(logId(model.id)),
      h.Role('log'),
      h.AriaLabel(options.label),
      h.OnMount(Mount.mapMessage(FollowEnd(), onMessage)),
    ]),
    options.content,
  )
  return h.div(builders.root.attrs(), [
    scrollArea({ content: log, style: options.areaStyle, mixins: options.areaMixins }, h),
    ...(model.following
      ? []
      : [
          h.button(
            builders.jump.attrs([
              h.Id(jumpId(model.id)),
              h.Type('button'),
              h.AriaLabel([jumpLabel, ...unseen].join(', ')),
              h.AriaControls(logId(model.id)),
              h.DataAttribute('unseen', String(model.unseen)),
              h.OnClick(onMessage(Message.Jumped())),
            ]),
            model.unseen > 0
              ? [h.span(builders.count.attrs([h.AriaHidden(true)]), [String(model.unseen)])]
              : [],
          ),
        ]),
  ])
}
