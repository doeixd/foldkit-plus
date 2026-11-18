import type { Html, HtmlBuilder } from 'foldkit/html'

/** A line icon in the text's colour, from one path on a 16-unit square. */
export const outline = <Message>(h: HtmlBuilder<Message>, d: string): Html =>
  h.svg(
    [
      h.ViewBox('0 0 16 16'),
      h.Attribute('width', '1em'),
      h.Attribute('height', '1em'),
      h.Attribute('fill', 'none'),
      h.Attribute('stroke', 'currentColor'),
      h.Attribute('stroke-width', '1.5'),
      h.Attribute('stroke-linecap', 'round'),
      h.Attribute('stroke-linejoin', 'round'),
    ],
    [h.path([h.Attribute('d', d)], [])],
  )
