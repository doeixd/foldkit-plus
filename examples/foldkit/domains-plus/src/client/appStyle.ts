/**
 * The theme and its tokens, upstream's greys among them, the font, and the
 * page sheet. Apart from `style.ts`, which declares the Slots with `slots` and
 * `forSlots` from here: that module is shipped to the browser as data
 * (`vite.config.ts` lists it in `modules`), and data holds no function.
 */
import geistLatinUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'

/**
 * The tokens, the Slots' constructors and the page sheet. The browser reads
 * none of them: its sheet is the file `foldkit-mixins/vite` writes, and its
 * Slots come frozen from `style.ts`.
 */
export const app = AppStyle.make({
  theme: Theme.make({
    type: { body: "'Geist Variable', Arial, Helvetica, sans-serif", heading: 'inherit' },
    accent: { chroma: 0 },
    // Upstream's dropdowns are the page's own dark, not an inverted panel.
    menu: { panel: 'default' },
  }),
  tokens: Theme.define({
    domains: {
      page: '#000',
      panel: '#0a0a0a',
      raised: '#1a1a1a',
      text: '#ededed',
      muted: '#999',
      soft: '#888',
      faint: '#777',
      line: '#262626',
      lineSoft: '#222',
      lineHeader: '#1f1f1f',
      lineControl: '#2b2b2b',
      lineStrong: '#333',
      lineFirm: '#292929',
      lineHover: '#555',
      lineFocus: '#666',
      added: '#50e3a4',
      skeleton: '#1c1c1c',
      /** How long upstream's phone sheets take to slide in or out. */
      slide: '500ms',
    },
    overlay: { scrim: 'rgb(0 0 0 / 0.6)' },
  }),
  // Upstream is dark only: every `light-dark()` token takes its dark half.
  colorScheme: 'dark',
  global: [
    Style.global(`@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(${geistLatinUrl}) format('woff2-variations');
}`),
    Style.global(`@keyframes domains-skeleton-pulse { from { opacity: 0.45 } to { opacity: 1 } }`),
  ],
})
export const { t, slots, forSlots } = app
