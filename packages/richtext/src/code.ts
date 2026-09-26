/**
 * Code highlighting, as decorations (§124 §7, §130): the document holds a `CodeBlock`'s
 * language and its plain text, and what a highlighter finds in that text is presentation,
 * derived and discarded like a search match. The contract lives here because it is
 * format-agnostic — a tokenizer is a function from text to ranges — while grammars, which
 * are not, live in `foldkit-richtext-code` and its Shiki adapter.
 */
import { eachBlock, positionInBlock, type Document } from './document.js'
import type { Decoration, DecorationSet } from './decoration.js'

/**
 * One token in a code block's text, as offsets into that text. `kind` becomes the
 * decoration's kind, so it is what a stylesheet reaches the token by — a grammar names its
 * kinds `syntax-string`, `syntax-number`, and so on (§129).
 */
export interface CodeToken {
  readonly from: number
  readonly to: number
  readonly kind: string
}

/** A pure read of one code block's text. A tokenizer that needs to load first is Shiki's case. */
export type CodeTokenizer = (text: string) => ReadonlyArray<CodeToken>

/**
 * Every token the given tokenizers find in the document's `CodeBlock`s, as decorations. A
 * block is tokenized by the tokenizer registered for its `language` prop; one with no
 * language, or one nothing is registered for, yields nothing. The registry is a `Map`
 * because the language is read from the document, and a plain object would answer a
 * language named `constructor` from its prototype.
 *
 * A token outside its block's text, or one that covers nothing, throws with the language
 * that produced it: it is a tokenizer's bug, and a decoration guessed from it would
 * highlight the wrong text.
 */
export const codeDecorations = (
  document: Document,
  tokenizers: ReadonlyMap<string, CodeTokenizer>,
): DecorationSet => {
  const found: Array<Decoration> = []
  eachBlock(document.children, block => {
    if (block.type !== 'Node' || block.kind !== 'CodeBlock') return
    const language = block.props.language
    if (typeof language !== 'string') return
    const tokenizer = tokenizers.get(language)
    if (tokenizer === undefined) return
    const text = block.children.map(run => run.text).join('')
    for (const token of tokenizer(text)) {
      const covers =
        Number.isInteger(token.from) && Number.isInteger(token.to) && token.from < token.to
      const from = covers ? positionInBlock(block, token.from) : undefined
      const to = from === undefined ? undefined : positionInBlock(block, token.to)
      if (from === undefined || to === undefined) {
        throw new RangeError(
          `The ${language} tokenizer produced ${token.kind} at [${token.from}, ${token.to}) in a block of ${text.length} characters`,
        )
      }
      found.push({ from, to, kind: token.kind })
    }
  })
  return found
}
