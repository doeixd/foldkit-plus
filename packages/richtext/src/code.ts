/**
 * Code tokenizers (§124 §7, §130): a document's `CodeBlock`s read as decorations, so
 * highlighting is derived presentation rather than document content — the block holds the
 * text, and the colours are discarded with the render.
 *
 * The contract and the producer are here because both are format-agnostic: a tokenizer is
 * text to ranges, and this reads `CodeBlock`s the way `searchDecorations` reads text. A
 * *grammar* is one format's, so it belongs in a package of its own (`foldkit-richtext-code`),
 * and a highlighter with a heavy dependency in another (`foldkit-richtext-code-shiki`).
 */
import type { Decoration, DecorationSet } from './decoration.js'
import { eachBlock, positionInBlock, type Document } from './document.js'

/** One token: the range of a block's text it covers, and what to call it. */
export interface CodeToken {
  readonly from: number
  readonly to: number
  /** What the token is, which becomes the decoration's kind (`syntax-string`). */
  readonly kind: string
}

/**
 * One language's lexer. `tokenize` is a pure read of the block's text — no positions, no
 * document, no clock — and the producer maps the ranges it returns onto the runs.
 */
export interface CodeTokenizer {
  readonly language: string
  readonly tokenize: (text: string) => ReadonlyArray<CodeToken>
}

/**
 * A token's decoration kind. The *kind* is what a stylesheet reaches a decoration by, so the
 * token's own name is part of it — `syntax-string`, `syntax-number` — and the token's name is
 * also in the decoration's `data`, which is what a registry over `data` would read (§129).
 */
export const syntaxDecorationKind = (token: string): string => `syntax-${token}`

/**
 * Every `CodeBlock` a tokenizer recognises, read as decorations. A block with no tokenizer for
 * its language yields nothing — an unhighlighted language is not an error — and a token whose
 * range does not resolve is skipped rather than guessed at, as any other read does.
 */
export const codeDecorations = (
  document: Document,
  tokenizers: ReadonlyArray<CodeTokenizer>,
): DecorationSet => {
  const byLanguage = new Map(tokenizers.map(tokenizer => [tokenizer.language, tokenizer]))
  const found: Array<Decoration<{ readonly token: string }>> = []
  eachBlock(document.children, block => {
    if (block.type !== 'Node' || block.kind !== 'CodeBlock') return
    const language = block.props.language
    if (typeof language !== 'string') return
    const tokenizer = byLanguage.get(language)
    if (tokenizer === undefined) return
    const text = block.children.map(run => run.text).join('')
    for (const token of tokenizer.tokenize(text)) {
      if (token.from >= token.to) continue
      const anchor = positionInBlock(block, token.from)
      const focus = positionInBlock(block, token.to)
      if (anchor === undefined || focus === undefined) continue
      found.push({
        from: anchor,
        to: focus,
        kind: syntaxDecorationKind(token.kind),
        data: { token: token.kind },
      })
    }
  })
  return found
}
