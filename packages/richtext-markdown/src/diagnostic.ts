/**
 * What a Markdown interpreter could not express (§124 §1). Both directions report here
 * rather than dropping content silently, so a caller can refuse, warn, or show a
 * placeholder — which is §3's rule for an interpreter. A schema, so a source session that
 * carries them can live in a Model (§136).
 */
import { Schema } from 'effect'
import { NodeId } from 'foldkit-richtext'

export const MarkdownDiagnostic = Schema.Struct({
  /** `UnsafeUrl` is a link or image whose URL the import policy (`safeUrl`) refused. */
  code: Schema.Literals(['UnsupportedNode', 'UnsupportedMark', 'UnsafeUrl']),
  /** The kind, mark, or node type the mapping has no syntax or no shape for. */
  detail: Schema.String,
  /** The block or run it sits on, when the mapping got that far. */
  node: Schema.optionalKey(NodeId),
})
export type MarkdownDiagnostic = typeof MarkdownDiagnostic.Type
