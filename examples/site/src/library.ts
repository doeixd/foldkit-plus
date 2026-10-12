/**
 * What the view asks of the site's content. The server's library is built
 * from the repository at build time (`content/library.ts`); the browser's
 * renders nothing, since every region it would draw is in the page already.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { Example, Page } from './main.js'

/** What a static region holds. */
export type Region = ReadonlyArray<Html | string>

export type Draw = (ih: HtmlBuilder<never>) => Region

export interface Library {
  /** What the page at an address is. */
  readonly pageAt: (path: string) => Page
  /** A doc page's sidebar: its subsite's guides and API. */
  readonly sidebar: (path: string) => Draw
  /** A doc page's article. */
  readonly article: (path: string) => Draw
  /** A doc page's "On this page". */
  readonly outline: (path: string) => Draw
  /** A home page example's code, coloured. */
  readonly example: (example: Example | 'app' | 'remote') => Draw
}

const unavailable =
  (what: string): Draw =>
  () => {
    throw new Error(`the browser has no ${what}: it is in the page the server rendered`)
  }

/**
 * The browser's library. Every region is in the page, which the browser adopts
 * without drawing; were one missing, drawing it fails loudly.
 */
export const browserLibrary: Library = {
  pageAt: () => {
    throw new Error('the browser does not look pages up: the server named this one')
  },
  sidebar: () => unavailable('sidebar'),
  article: () => unavailable('article'),
  outline: () => unavailable('outline'),
  example: () => unavailable('example'),
}
