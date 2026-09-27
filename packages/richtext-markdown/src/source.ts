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
import { alignedIn, offsetIn, positionAt } from './caret.js'
import { MarkdownDiagnostic } from './diagnostic.js'
import { parseMapped, type ParseOptions } from './parse.js'
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
  /** Where the caret is in the draft, as an offset; replace it as it moves (§147). */
  caret: Schema.Number,
})
export type SourceSession = typeof SourceSession.Type

export interface OpenOptions {
  /** The spellings to print with: the ones the last session closed with (§138). */
  readonly style?: MarkdownStyle | undefined
  /** The rich editor's selection, whose focus becomes the draft's caret (§147). */
  readonly selection?: RichText.Selection | null | undefined
}

/**
 * Opens a session on a document: its Markdown, as both what was printed and the draft,
 * spelled as `style` says, so a writer's `_hello_` comes back as they wrote it, with the caret
 * where the selection's focus was. A node selection, or none, puts the caret at the start.
 */
export const openSource = (
  document: RichText.Document,
  options: OpenOptions = {},
): SourceSession => {
  const style = options.style ?? {}
  const printed = print(document, { style })
  const focus = options.selection?.type === 'Range' ? options.selection.focus : undefined
  return {
    printed: printed.markdown,
    draft: printed.markdown,
    unprintable: printed.diagnostics,
    style,
    caret: focus === undefined ? 0 : (offsetIn(document, printed.markdown, focus) ?? 0),
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
  /**
   * The session's caret in `document`, as a caret selection; null when the draft holds no
   * text to put it in, or when an unedited draft does not line up with the caller's document.
   */
  readonly selection: RichText.Selection | null
}

const caretAt = (position: RichText.Position | undefined): RichText.Selection | null =>
  position === undefined ? null : { type: 'Range', anchor: position, focus: position }

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
    // The caret is read in a parse of the printed text and carried over by block text; the
    // parse's own identities are throwaway, since the caller's document is what continues.
    let n = 0
    const read = parseMapped(session.draft, { mint: () => `caret-${n++}` })
    const at = positionAt(session.draft, read.segments, session.caret)
    return {
      document,
      changed: false,
      diagnostics: [],
      style: session.style,
      selection: caretAt(at === undefined ? undefined : alignedIn(read.document, document, at)),
    }
  }
  const parsed = parseMapped(session.draft, options)
  return {
    document: parsed.document,
    changed: true,
    diagnostics: [...session.unprintable, ...parsed.diagnostics],
    style: { ...session.style, ...parsed.style },
    selection: caretAt(positionAt(session.draft, parsed.segments, session.caret)),
  }
}
