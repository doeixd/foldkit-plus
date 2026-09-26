/**
 * A Markdown source session (§8, §136): the document printed as Markdown to be edited as
 * text, and read back when editing ends. Only one side is editable at a time, so while a
 * session is open the rich document stands still and the draft is the only thing changing.
 *
 * The session holds no copy of the document. Closing an unedited session returns the
 * document the caller still has, untouched — its identities, and whatever the printer
 * could not show — so switching modes without typing loses nothing. Only an edited draft is
 * parsed, and only then is what the printer could not show lost; `close` reports it with
 * the parser's own diagnostics, so the caller can warn before it commits.
 */
import { Schema } from 'effect'
import type * as RichText from 'foldkit-richtext'
import { MarkdownDiagnostic } from './diagnostic.js'
import { parse, type ParseOptions } from './parse.js'
import { print } from './print.js'
import { MarkdownStyle } from './style.js'

export const SourceSession = Schema.Struct({
  /** What `print` wrote when the session opened: the draft of a session nobody edited. */
  printed: Schema.String,
  /** The Markdown being edited; replace it as the text changes. */
  draft: Schema.String,
  /** What the Markdown could not show, which an edited draft no longer carries. */
  unprintable: Schema.Array(MarkdownDiagnostic),
  /** The spellings the draft was printed with (§138). */
  style: MarkdownStyle,
})
export type SourceSession = typeof SourceSession.Type

/**
 * Opens a session on a document: its Markdown, as both what was printed and the draft,
 * spelled as `style` says — the one the last session closed with, so a writer's `_hello_`
 * comes back as they wrote it.
 */
export const openSource = (
  document: RichText.Document,
  style: MarkdownStyle = {},
): SourceSession => {
  const printed = print(document, { style })
  return {
    printed: printed.markdown,
    draft: printed.markdown,
    unprintable: printed.diagnostics,
    style,
  }
}

export interface ClosedSource {
  /** The document to continue with: the caller's own when the draft was not edited. */
  readonly document: RichText.Document
  /** Whether the draft was edited, and so whether `document` is new. */
  readonly changed: boolean
  /** What the document loses by the edit: the unprintable, then what parsing reported. */
  readonly diagnostics: ReadonlyArray<MarkdownDiagnostic>
  /**
   * The spellings to open the next session with: what the edited draft used, over what the
   * session opened with, so a construct the draft no longer contains keeps its spelling.
   */
  readonly style: MarkdownStyle
}

/**
 * Ends a session against the document the caller holds. A pure read, so it also serves as a
 * preview of the draft: nothing is committed until the caller puts `document` in its Model.
 */
export const closeSource = (
  session: SourceSession,
  document: RichText.Document,
  options: ParseOptions,
): ClosedSource => {
  if (session.draft === session.printed) {
    return { document, changed: false, diagnostics: [], style: session.style }
  }
  const parsed = parse(session.draft, options)
  return {
    document: parsed.document,
    changed: true,
    diagnostics: [...session.unprintable, ...parsed.diagnostics],
    style: { ...session.style, ...parsed.style },
  }
}
