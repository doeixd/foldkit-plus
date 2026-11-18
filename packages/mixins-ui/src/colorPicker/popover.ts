import type { AnchorConfig } from '@foldkit/ui/anchor'
import * as UiPopover from '@foldkit/ui/popover'
import { Effect, Queue, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import {
  buildersOf,
  drawn,
  paintOf,
  widestText,
  format,
  type ColorPickerView,
} from '../colorPicker.js'
import { idSelector } from '../datePickerUtils.js'
import * as Popover from '../popover.js'
import type { MixinList } from '../resolve.js'

export interface ColorPickerPopover<Message> extends ColorPickerView<Message> {
  /**
   * The Popover's Model, made with `contentFocus: true`
   * (`Popover.init({ id, contentFocus: true })` from `@foldkit/ui/popover`):
   * the picker owns its panel's focus, so a press inside never closes it.
   */
  readonly popover: UiPopover.Model
  /** The Popover's Messages, for `Popover.update`. */
  readonly onPopover: (message: UiPopover.Message) => NoInfer<Message>
  /** Where the panel opens; default below the trigger, at its start. */
  readonly anchor?: AnchorConfig | undefined
  /** The Popover's own look and Mixins, as `Popover.toView` takes them. */
  readonly popoverMixins?: MixinList<Message> | undefined
}

const DEFAULT_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
  portal: false,
}

/**
 * Focus going from the picker to an element outside it, as a Mount on its
 * root: the Popover's `BlurredPanel`, which closes it without taking focus
 * back from where Tab took it (and, as upstream decides, keeps open a panel a
 * mouse opened). Focus going nowhere (a press on the panel's words, the window
 * losing focus) leaves it open, and a press outside is the backdrop's.
 */
const LeftPicker = Mount.defineStream('ColorPickerLeft', {
  messages: [UiPopover.Message.BlurredPanel],
  execute: ({ element }) =>
    Stream.callback<UiPopover.BlurredPanel>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const left = (event: globalThis.Event) => {
            const to = event instanceof FocusEvent ? event.relatedTarget : null
            if (to instanceof Node && !element.contains(to))
              Queue.offerUnsafe(queue, UiPopover.Message.BlurredPanel())
          }
          element.addEventListener('focusout', left)
          return left
        }),
        left => Effect.sync(() => element.removeEventListener('focusout', left)),
      ),
    ),
})

/**
 * The picker behind a swatch of its color and its text, in the package's
 * Popover. The panel opens on the area's thumb, and closes on Escape, a press
 * outside, or focus leaving it (unless a mouse opened it); a press or a drag
 * anywhere inside keeps it open, whatever opened it. The open state is the
 * Popover's Model.
 */
export const popover = <Outer>(options: ColorPickerPopover<Outer>, h: HtmlBuilder<Outer>): Html => {
  if (!options.popover.contentFocus)
    throw new Error(
      `ColorPicker.popover: make the Popover "${options.popover.id}" with contentFocus: true; ` +
        'without it, focus moving into the picker closes the panel under a finger or the keys',
    )
  const builders = buildersOf(options, h)
  return h.submodel({
    slotId: options.popover.id,
    model: options.popover,
    view: UiPopover.view,
    viewInputs: {
      anchor: options.anchor ?? DEFAULT_ANCHOR,
      focusSelector: idSelector(`${options.model.id}-area`),
      toView: Popover.toView(options.popoverMixins ?? [], { h }, shown =>
        h.div(builders.picker.attrs([h.Style(paintOf(options.model.color))]), [
          h.button(shown.button, [
            h.span(builders.trigger.attrs(), [
              h.span(builders.swatch.attrs([h.AriaHidden(true)]), []),
              // The format's widest text, drawn unseen beneath, holds the trigger's width
              // while the color changes: a centred trigger moved its panel at each step.
              h.span(
                builders.value.attrs([
                  h.DataAttribute(
                    'widest',
                    widestText(options.model.format, options.model.color.alpha),
                  ),
                ]),
                [format(options.model.color, options.model.format)],
              ),
            ]),
          ]),
          ...(shown.isVisible
            ? [
                h.div(shown.backdrop, []),
                h.div(shown.layer, [
                  h.div(shown.panel, [
                    drawn(options, h, [
                      h.OnMount(Mount.mapMessage(LeftPicker(), options.onPopover)),
                    ]),
                  ]),
                ]),
              ]
            : []),
        ]),
      ),
    },
    toParentMessage: options.onPopover,
  })
}
