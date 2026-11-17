/**
 * A post's body is stored as Markdown text. The site and the studio's preview read it
 * into a rich-text document and draw that with the standard rendering, so what the
 * editor wrote (bold, links, quotes, numbered lists, code) is what a reader sees.
 */
import * as RichText from 'foldkit-richtext'
import { renderBlocks } from 'foldkit-richtext-dom/view'
import { parse } from 'foldkit-richtext-markdown'
import type { Html } from 'foldkit/html'

/** Identities are fixed by position, so the same text always reads as the same document. */
export const documentOf = (markdown: string): RichText.Document => {
  let next = 0
  return parse(markdown, { mint: () => `m${next++}` }).document
}

export const drawMarkdown = (markdown: string): ReadonlyArray<Html> =>
  renderBlocks(documentOf(markdown).children, RichText.standardRendering)

/** How long a body takes to read, at a reader's usual pace. */
export const readingTime = (markdown: string): string =>
  `${Math.max(1, Math.round(RichText.count(documentOf(markdown)).words / 230))} min read`
