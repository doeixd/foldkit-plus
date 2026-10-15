/**
 * The rich text chrome's icons: line drawings on a 24-unit grid, stroked in the text's color, so
 * every toolbar, menu and card draws from one set. Decorative: each is hidden from assistive
 * technology, and the control it sits in carries the name that is read.
 *
 * The drawings are Lucide's (https://lucide.dev), under its ISC license:
 *
 *   ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
 *   Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *   Permission to use, copy, modify, and/or distribute this software for any purpose with or
 *   without fee is hereby granted, provided that the above copyright notice and this permission
 *   notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
 *   WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *   AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
 *   CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
 *   WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 *   CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'

const box = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'
const dot = (x: number, y: number) => `M${x} ${y + 1}a1 1 0 1 0 0-2 1 1 0 0 0 0 2z`

const paths = {
  // Text blocks.
  paragraph: ['M13 4v16', 'M17 4v16', 'M19 4H9.5a4.5 4.5 0 0 0 0 9H13'],
  'heading-1': ['M4 12h8', 'M4 18V6', 'M12 18V6', 'm17 12 3-2v8'],
  'heading-2': ['M4 12h8', 'M4 18V6', 'M12 18V6', 'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1'],
  'heading-3': [
    'M4 12h8',
    'M4 18V6',
    'M12 18V6',
    'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2',
    'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2',
  ],
  quote: ['M17 6H3', 'M21 12H8', 'M21 18H8', 'M3 12v6'],
  'bulleted-list': ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  'numbered-list': [
    'M10 6h11',
    'M10 12h11',
    'M10 18h11',
    'M4 6h1v4',
    'M4 10h2',
    'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  ],
  checklist: ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'],
  'code-block': [box, 'm10 9-3 3 3 3', 'm14 15 3-3-3-3'],
  // Marks.
  bold: ['M14 12a4 4 0 0 0 0-8H6v8', 'M15 20a4 4 0 0 0 0-8H6v8Z'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
  underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
  strikethrough: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  highlight: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  kbd: [
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M6 8h.01',
    'M10 8h.01',
    'M14 8h.01',
    'M18 8h.01',
    'M8 12h.01',
    'M12 12h.01',
    'M16 12h.01',
    'M7 16h10',
  ],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  comment: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  // Blocks to insert.
  table: [box, 'M3 9h18', 'M3 15h18', 'M12 3v18'],
  image: [box, 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M21 15l-5-5L5 21'],
  video: [
    'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5',
    'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  ],
  audio: [
    'M9 18V5l12-2v13',
    'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ],
  file: [
    'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
  ],
  callout: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4',
  ],
  toggle: ['m3 10 2.5-2.5L3 5', 'm3 19 2.5-2.5L3 14', 'M10 6h11', 'M10 12h11', 'M10 18h11'],
  divider: ['M5 12h14'],
  footnote: [
    'm4 19 8-8',
    'm12 19-8-8',
    'M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06',
  ],
  // Actions.
  undo: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9a5 5 0 0 0 0 10h3'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  replace: [
    'M14 4a1 1 0 0 1 1-1',
    'M15 10a1 1 0 0 1-1-1',
    'M21 4a1 1 0 0 0-1-1',
    'M21 9a1 1 0 0 1-1 1',
    'm3 7 3 3 3-3',
    'M6 10V5a2 2 0 0 1 2-2h2',
    'M4 14h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  ],
  'match-case': ['m3 15 4-8 4 8', 'M4 13h6', 'M18 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M21 9v6'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  copy: [
    'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  ],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  more: [dot(5, 12), dot(12, 12), dot(19, 12)],
  grip: [dot(9, 5), dot(9, 12), dot(9, 19), dot(15, 5), dot(15, 12), dot(15, 19)],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  back: ['m12 19-7-7 7-7', 'M19 12H5'],
  contents: [
    'M21 12h-8',
    'M21 6H8',
    'M21 18h-8',
    'M3 6v4c0 1.1.9 2 2 2h3',
    'M3 10v6c0 1.1.9 2 2 2h3',
  ],
  reset: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
} as const satisfies Readonly<Record<string, ReadonlyArray<string>>>

/** The names of the drawings in the set. */
export type RichTextIconName = keyof typeof paths

/** Whether a name, such as a slash entry's id, has a drawing in the set. */
export const isRichTextIcon = (name: string): name is RichTextIconName => Object.hasOwn(paths, name)

/** An icon as inline SVG, `size` CSS pixels square, in the text's color. */
export const richTextIcon = <Message>(
  h: HtmlBuilder<Message>,
  name: RichTextIconName,
  { size = 16 }: { readonly size?: number } = {},
): Html =>
  h.svg(
    [
      h.ViewBox('0 0 24 24'),
      h.Width(String(size)),
      h.Height(String(size)),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('2'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
      h.AriaHidden(true),
      h.DataAttribute('icon', name),
    ],
    paths[name].map(d => h.path([h.D(d)], [])),
  )

/**
 * An icon as a CSS `url(…)`, for markup that cannot hold an element of its own, such as a
 * rendering's adornment: a stylesheet masks it over the text's color.
 */
export const richTextIconUrl = (name: RichTextIconName): string => {
  const drawn = paths[name].map(d => `<path d="${d}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawn}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
