import type { SwitchAttributes } from '@foldkit/ui/switch'
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attr, Behavior, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/** Mirrors the checkbox contract: both the control and its label own `click`. */
export const SwitchSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({
    capability: Capability.Container,
    events: [Event.Click],
  }),
  description: Slot.make({ capability: Capability.Container }),
  hiddenInput: Slot.make({
    capability: Capability.Base,
    attributes: [Attr.Value],
  }),
})

/** The switch's bundles with the attached Mixins applied. */
export type ResolvedSwitch<Message> = Resolved<
  SwitchAttributes<Message>,
  typeof SwitchSlots,
  Message
>

/** Applies `mixins` to the switch's bundles. */
export const resolve = <Input, Message>(
  attributes: SwitchAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedSwitch<Message> => resolveFor(SwitchSlots, mixins, context)(attributes)

/** The switch's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedSwitch<Message>) => Html,
  ) =>
  (attributes: SwitchAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

/** How far, in pixels, a press must move before it is a drag and no longer a click. */
const DRAG_SLOP = 4

/** How long, in milliseconds, after a drag's release its click is still swallowed. */
const CLICK_AFTER_DRAG = 100

const Dragged = Schema.TaggedStruct('SwitchDragged', { isChecked: Schema.Boolean })

type Capturing = Element & { setPointerCapture?: (id: number) => void }

/** The thumb's `translate` along the track from where it rests unchecked, in either direction. */
const placeOf = (element: Element, sign: 1 | -1): number => {
  const [x] = getComputedStyle(element, '::before').translate.split(' ')
  const px = Number.parseFloat(x ?? '')
  return Number.isNaN(px) ? 0 : sign * px
}

/**
 * Follows a press on the switch past `DRAG_SLOP`: the thumb tracks the
 * pointer, and on release it is on when its middle lies past the track's, so
 * a drag that ends on the side it began on reports nothing. The state and the
 * direction are read from the element as the press lands, since a Mount's
 * arguments are read once. The click the browser sends after such a drag is
 * swallowed, or it would toggle again.
 */
const Drag = Mount.defineStream('SwitchDrag', {
  messages: [Dragged],
  execute: ({ element }) =>
    Stream.callback<typeof Dragged.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const target = element as Capturing
          let press: {
            readonly pointerId: number
            readonly x: number
            readonly sign: 1 | -1
            readonly from: number
            readonly room: number
            dragging: boolean
            place: number
          } | null = null
          let settle: MutationObserver | null = null
          let releasedAt = Number.NEGATIVE_INFINITY
          const rest = () => {
            settle?.disconnect()
            settle = null
            element.removeAttribute('data-dragging')
            ;(element as HTMLElement).style.removeProperty('--_fk-switch-drag')
            ;(element as HTMLElement).style.removeProperty('touch-action')
          }
          const down = (event: Event) => {
            const pointer = event as PointerEvent
            const off =
              element.getAttribute('aria-disabled') === 'true' ||
              element.getAttribute('aria-readonly') === 'true' ||
              element.hasAttribute('disabled')
            if (off || pointer.button !== 0 || press !== null) return
            rest()
            const sign = element.matches(':dir(rtl)') ? -1 : 1
            const box = element.getBoundingClientRect()
            const thumb = Number.parseFloat(getComputedStyle(element, '::before').inlineSize)
            const from = placeOf(element, sign)
            press = {
              pointerId: pointer.pointerId,
              x: pointer.clientX,
              sign,
              from,
              // The thumb rests 2px in from each end of the track.
              room: box.width - 4 - thumb,
              dragging: false,
              place: from,
            }
          }
          const move = (event: Event) => {
            const pointer = event as PointerEvent
            if (press === null || press.pointerId !== pointer.pointerId) return
            const along = press.sign * (pointer.clientX - press.x)
            if (!press.dragging) {
              if (Math.abs(along) < DRAG_SLOP) return
              press.dragging = true
              try {
                target.setPointerCapture?.(press.pointerId)
              } catch {
                // Without capture the move still reports while over the element.
              }
              element.setAttribute('data-dragging', '')
              ;(element as HTMLElement).style.setProperty('touch-action', 'pan-y')
            }
            press.place = Math.min(Math.max(press.from + along, 0), press.room)
            ;(element as HTMLElement).style.setProperty(
              '--_fk-switch-drag',
              `${press.sign * press.place}px`,
            )
          }
          const end = (event: Event) => {
            const pointer = event as PointerEvent
            const held = press
            if (held === null || held.pointerId !== pointer.pointerId) return
            press = null
            if (!held.dragging) return
            releasedAt = event.timeStamp
            const isChecked = held.place > held.room / 2
            const unchanged = isChecked === (element.getAttribute('aria-checked') === 'true')
            const cancelled = event.type !== 'pointerup'
            if (cancelled || unchanged) {
              rest()
              return
            }
            // Held where it was let go until the Model's answer redraws the
            // switch, so the thumb does not slide back and forth.
            settle = new MutationObserver(rest)
            settle.observe(element, { attributes: true, attributeFilter: ['aria-checked'] })
            Queue.offerUnsafe(queue, Dragged.make({ isChecked }))
          }
          const click = (event: Event) => {
            // The browser sends it right after the release, after the pointer
            // events: a timer set at the release ran before it.
            if (event.timeStamp - releasedAt > CLICK_AFTER_DRAG) return
            releasedAt = Number.NEGATIVE_INFINITY
            event.preventDefault()
            event.stopImmediatePropagation()
          }
          const listeners = [
            ['pointerdown', down],
            ['pointermove', move],
            ['pointerup', end],
            ['pointercancel', end],
            ['lostpointercapture', end],
          ] as const
          for (const [type, listener] of listeners) element.addEventListener(type, listener)
          element.addEventListener('click', click, { capture: true })
          return () => {
            for (const [type, listener] of listeners) element.removeEventListener(type, listener)
            element.removeEventListener('click', click, { capture: true })
            rest()
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/**
 * Lets the thumb be dragged: past the middle of the track on release, the
 * switch turns to the side it is on, sent as `onToggle`'s Message beside the
 * click's. Not built in, as a Scene test must resolve every Mount with a
 * Message; pass it beside the style (`mixins: [style.mixin, Switch.draggable(onToggle)]`),
 * with the `onToggle` the view was given. A disabled or read-only switch
 * does not drag.
 */
export const draggable = <Message>(onToggle: (isChecked: boolean) => Message) =>
  Behavior.forSlots(SwitchSlots)<unknown, Message>(
    {
      button: Behavior.slot({
        requires: { capability: Capability.Interactive },
        mount: () => Mount.mapMessage(Drag(), fact => onToggle(fact.isChecked)),
      }),
    },
    { name: 'SwitchDrag' },
  ).mixin
