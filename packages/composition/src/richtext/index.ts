/**
 * `foldkit-composition/richtext`: rich text held as a Block's prop.
 *
 * A page and a rich-text document are two documents on purpose, and they meet
 * in one direction: a Block holds a `foldkit-richtext` Document as its `body`.
 * The Block names the Kit the body accepts, so validating the page validates
 * the body too, each finding reported at its path as `composition:nested`.
 */
import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import { Block } from '../block.js'
import type { Content } from '../content.js'

export const RichTextBlock = {
  /**
   * A Block whose one prop is `body`, a rich-text Document the Kit accepts:
   * `RichTextBlock.define('Text', { kit: ArticleKit, provides: [Content.Flow] })`.
   */
  define: <const Name extends string>(
    name: Name,
    config: { readonly kit: RichText.Kit; readonly provides: ReadonlyArray<Content> },
  ) =>
    Block.define(name, {
      Props: Schema.Struct({ body: RichText.Document }),
      provides: config.provides,
      check: props =>
        RichText.validate(props.body, config.kit).map(finding => ({
          path: finding.node === undefined ? ['body'] : ['body', finding.node],
          message: finding.message,
        })),
    }),
}
