/**
 * The studio's icons: line drawings on a 24-unit grid, stroked in the text's
 * color, after the Lucide set (ISC). Decorative: each is hidden from assistive
 * technology, so the words beside it are what is read.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'

const paths = {
  posts: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M16 13H8',
    'M16 17H8',
    'M10 9H8',
  ],
  pages: [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M3 9h18',
    'M9 21V9',
  ],
  site: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  ],
  external: [
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  archive: ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  // The page's Blocks.
  hero: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M3 19h18',
    'M3 22h12',
  ],
  section: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M7 8h10',
    'M7 12h10',
    'M7 16h6',
  ],
  columns: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 3v18'],
  heading: ['M6 4v16', 'M18 4v16', 'M6 12h12'],
  text: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h10'],
  image: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M21 15l-5-5L5 21',
  ],
  quote: ['M3 21c3 0 7-1 7-8V5H3v7h4', 'M14 21c3 0 7-1 7-8V5h-7v7h4'],
  callout: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  divider: ['M3 12h18', 'M8 6h8', 'M8 18h8'],
  button: ['M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M9 11h6'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z'],
  // Lucide's "layout-template": blocks already arranged, as a pattern is.
  pattern: [
    'M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M4 14h7a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
    'M17 14h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
  ],
  files: [
    'M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z',
    'M15 2v5h5',
    'M3 7v13a2 2 0 0 0 2 2h10',
  ],
  // The editor's actions.
  up: ['M12 19V5', 'M5 12l7-7 7 7'],
  down: ['M12 5v14', 'M19 12l-7 7-7-7'],
  outdent: ['M21 6H11', 'M21 12H11', 'M21 18H11', 'M7 8l-4 4 4 4'],
  indent: ['M21 6H11', 'M21 12H11', 'M21 18H11', 'M3 8l4 4-4 4'],
  copy: [
    'M9 11a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z',
    'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  ],
  clipboard: [
    'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  ],
  scissors: [
    'M3 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
    'M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
    'M20 4 8.12 15.88',
    'M14.47 14.48 20 20',
    'M8.12 8.12 12 12',
  ],
  paste: [
    'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
    'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2',
    'M16 4h2a2 2 0 0 1 2 2v2',
    'M11 14h10',
    'm17 10 4 4-4 4',
  ],
  undo: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9a5 5 0 0 0 0 10h3'],
  monitor: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M8 21h8',
    'M12 17v4',
  ],
  tablet: ['M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  phone: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M12 18h.01'],
  chevron: ['M9 18l6-6-6-6'],
} as const

export type IconName = keyof typeof paths

/**
 * An icon as a CSS `url(…)`, for markup a package draws, where a view cannot
 * add an element: a Style masks it over the text's color.
 */
export const iconUrl = (name: IconName): string => {
  const drawn = paths[name].map(d => `<path d="${d}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawn}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export const icon = <M>(h: HtmlBuilder<M>, name: IconName, size = 16): Html =>
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
      h.Style({ flexShrink: '0' }),
    ],
    paths[name].map(d => h.path([h.D(d)], [])),
  )
