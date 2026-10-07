/**
 * A Toast view with the consumer `toView` seam `@foldkit/ui/toast` does not
 * expose. State, Messages, update, Commands, Mounts, and subscriptions stay
 * upstream: `make` binds upstream's `Toast.make` for the payload and swaps
 * in only markup assembly, transcribed from `@foldkit/ui@0.165.0`
 * (`packages/ui/src/toast/index.ts`, MIT (c) 2025 Devin Jameson) at tag
 * `@foldkit/ui@0.165.0`, with the computed bundles named (`ToastRenderInfo`)
 * and handed to `toView`.
 *
 * The default `toView` reproduces upstream's markup; the parity battery
 * draws both views over the same models, so drift fails loudly. If upstream
 * gains a seam, delete this module; on a bump, re-transcribe and re-run
 * the battery.
 */
import { Match, Option, type Schema } from 'effect'
import * as UpstreamToast from '@foldkit/ui/toast'
import { Position, SwipeState, Variant, type EntryHandlers } from '@foldkit/ui/toast'
import { childAttributes, type ChildAttribute, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import { isSwipeExcludedTarget } from './toastUtils.js'

/** One toast entry's bundle: element id, attributes, and drawn content. */
export type ToastEntryRender = Readonly<{
  id: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

/** The toast stack's computed bundles. */
export type ToastRenderInfo = Readonly<{
  id: string
  container: ReadonlyArray<ChildAttribute>
  entries: ReadonlyArray<ToastEntryRender>
}>

type VariantRole = 'status' | 'alert'

const variantToRole = (variant: typeof Variant.Type): VariantRole =>
  Match.value(variant).pipe(
    Match.withReturnType<VariantRole>(),
    Match.when('Info', () => 'status'),
    Match.when('Success', () => 'status'),
    Match.when('Warning', () => 'alert'),
    Match.when('Error', () => 'alert'),
    Match.exhaustive,
  )

const positionToContainerStyle = (
  position: typeof Position.Type,
): Readonly<Record<string, string>> => {
  const base: Readonly<Record<string, string>> = {
    position: 'fixed',
    display: 'flex',
    gap: '8px',
    padding: '16px',
    pointerEvents: 'none',
    zIndex: '2147483600',
  }

  return Match.value(position).pipe(
    Match.withReturnType<Readonly<Record<string, string>>>(),
    Match.when('TopLeft', () => ({
      ...base,
      top: '0',
      left: '0',
      flexDirection: 'column-reverse',
    })),
    Match.when('TopCenter', () => ({
      ...base,
      top: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      flexDirection: 'column-reverse',
    })),
    Match.when('TopRight', () => ({
      ...base,
      top: '0',
      right: '0',
      flexDirection: 'column-reverse',
    })),
    Match.when('BottomLeft', () => ({
      ...base,
      bottom: '0',
      left: '0',
      flexDirection: 'column',
    })),
    Match.when('BottomCenter', () => ({
      ...base,
      bottom: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      flexDirection: 'column',
    })),
    Match.when('BottomRight', () => ({
      ...base,
      bottom: '0',
      right: '0',
      flexDirection: 'column',
    })),
    Match.exhaustive,
  )
}

const DEFAULT_ARIA_LABEL = 'Notifications'

const LEFT_MOUSE_BUTTON = 0

/**
 * Binds upstream's `Toast.make` for the payload and swaps in the forked
 * view: behavior is untouched, only markup assembly carries the seam.
 */
export const make = <A, I>(payloadSchema: Schema.Codec<A, I>) => {
  const bound = UpstreamToast.make(payloadSchema)
  type Entry = typeof bound.Entry.Type
  type ToastModel = typeof bound.Model.Type
  type ToastMessage = typeof bound.Message.Type

  /** Upstream view inputs plus the seam. Omit `toView` for upstream markup. */
  type ToastViewInputs = Readonly<{
    position: typeof Position.Type
    entryToView: (entry: Entry, handlers: EntryHandlers) => Html
    ariaLabel?: string
    containerClassName?: string
    entryClassName?: string
    toView?: (render: ToastRenderInfo) => Html
  }>

  const computeRender = (
    model: ToastModel,
    viewInputs: ToastViewInputs,
    h: HtmlBuilder<ToastMessage>,
  ): ToastRenderInfo => {
    const { id, entries } = model
    const {
      position,
      entryToView,
      ariaLabel = DEFAULT_ARIA_LABEL,
      containerClassName,
      entryClassName,
    } = viewInputs

    const container = childAttributes([
      h.Id(id),
      h.Role('region'),
      h.AriaLabel(ariaLabel),
      h.AriaLive('polite'),
      h.Style(positionToContainerStyle(position)),
      ...(containerClassName ? [h.Class(containerClassName)] : []),
    ])

    const renderEntryItem = (entry: Entry): ToastEntryRender => {
      const { transitionState } = entry.animation

      const animationAttributes = Match.value(transitionState).pipe(
        Match.when('EnterStart', () => [
          h.DataAttribute('closed', ''),
          h.DataAttribute('enter', ''),
          h.DataAttribute('transition', ''),
        ]),
        Match.when('EnterAnimating', () => [
          h.DataAttribute('enter', ''),
          h.DataAttribute('transition', ''),
        ]),
        Match.when('LeaveStart', () => [
          h.DataAttribute('leave', ''),
          h.DataAttribute('transition', ''),
        ]),
        Match.when('LeaveAnimating', () => [
          h.DataAttribute('closed', ''),
          h.DataAttribute('leave', ''),
          h.DataAttribute('transition', ''),
        ]),
        Match.orElse(() => []),
      )

      const swipeOffset = bound.swipeOffset(entry.swipeState)
      const maybeSwipePhase = SwipeState.match<Option.Option<'move' | 'settling' | 'end'>>(
        entry.swipeState,
        {
          Idle: () => Option.none(),
          Dragging: () => Option.some('move'),
          Settling: () => Option.some('settling'),
          Dismissing: () => Option.some('end'),
        },
      )
      const swipeExitTranslate = SwipeState.match<string | undefined>(entry.swipeState, {
        Idle: () => undefined,
        Dragging: () => undefined,
        Settling: () => undefined,
        Dismissing: ({ direction }) => {
          if (transitionState !== 'LeaveAnimating') {
            return undefined
          }

          return Match.value(direction).pipe(
            Match.when('Right', () => '100vw'),
            Match.when('Left', () => '-100vw'),
            Match.exhaustive,
          )
        },
      })
      const swipeTranslate =
        swipeExitTranslate ?? (swipeOffset !== 0 ? `${String(swipeOffset)}px` : undefined)
      const swipeAttributes = Option.match(maybeSwipePhase, {
        onNone: () => [],
        onSome: phase => [h.DataAttribute('swipe', phase)],
      })

      const handlePointerDown = (
        pointerType: string,
        button: number,
        _screenX: number,
        _screenY: number,
        _timeStamp: number,
        clientX: number,
        _clientY: number,
        pointerId: number,
        target: EventTarget | null,
      ): Option.Option<ToastMessage> => {
        if (
          (pointerType === 'mouse' && button !== LEFT_MOUSE_BUTTON) ||
          isSwipeExcludedTarget(pointerType, target)
        ) {
          return Option.none()
        } else {
          return Option.some(
            bound.Message.PressedEntryPointer({
              entryId: entry.id,
              pointerId,
              clientX,
            }),
          )
        }
      }

      const handlers: EntryHandlers = {
        dismiss: childAttributes([h.OnClick(bound.Message.Dismissed({ entryId: entry.id }))]),
      }

      return {
        id: entry.id,
        attributes: childAttributes([
          h.Id(entry.id),
          h.Role(variantToRole(entry.variant)),
          h.AriaAtomic(true),
          h.DataAttribute('variant', entry.variant),
          h.Style({
            pointerEvents: 'auto',
            ...(Option.isSome(model.maybeSwipeConfig) ? { touchAction: 'pan-y' } : {}),
            ...(swipeTranslate !== undefined
              ? {
                  translate: swipeTranslate,
                  '--toast-swipe-move-x': `${String(swipeOffset)}px`,
                }
              : {}),
          }),
          h.OnMouseEnter(bound.Message.HoveredEntry({ entryId: entry.id })),
          h.OnMouseLeave(bound.Message.LeftEntry({ entryId: entry.id })),
          ...(Option.isSome(model.maybeSwipeConfig) ? [h.OnPointerDown(handlePointerDown)] : []),
          ...animationAttributes,
          ...swipeAttributes,
          ...(entryClassName ? [h.Class(entryClassName)] : []),
        ]),
        content: entryToView(entry, handlers),
      }
    }

    return { id, container, entries: entries.map(renderEntryItem) }
  }

  /** Upstream's markup from the computed bundles: the default `toView`. */
  const defaultToView =
    (h: HtmlBuilder<ToastMessage>) =>
    (render: ToastRenderInfo): Html =>
      h.keyed('div')(
        render.id,
        [...render.container],
        render.entries.map(entry =>
          h.keyed('div')(entry.id, [...entry.attributes], [entry.content]),
        ),
      )

  const view = defineView<ToastModel, ToastMessage, ToastViewInputs>((model, viewInputs, h) => {
    const render = computeRender(model, viewInputs, h)
    return (viewInputs.toView ?? defaultToView(h))(render)
  })

  return { ...bound, view }
}
