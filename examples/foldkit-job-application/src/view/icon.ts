import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotAttributes } from 'foldkit-mixins'

/** A chevron pointing down, drawn by the Slot whose attributes it is given. */
export const chevronDown = <Message>(
  attributes: SlotAttributes<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.svg(
    [
      ...attributes,
      h.AriaHidden(true),
      h.Xmlns('http://www.w3.org/2000/svg'),
      h.Fill('none'),
      h.ViewBox('0 0 24 24'),
      h.StrokeWidth('1.5'),
      h.Stroke('currentColor'),
    ],
    [
      h.path([
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
        h.D('M19.5 8.25l-7.5 7.5-7.5-7.5'),
      ]),
    ],
  )
