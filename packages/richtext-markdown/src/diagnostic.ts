/**
 * What a Markdown interpreter could not express (§124 §1). Both directions report here
 * rather than dropping content silently, so a caller can refuse, warn, or show a
 * placeholder — which is §3's rule for an interpreter.
 */
import type { NodeId } from 'foldkit-richtext'

export interface MarkdownDiagnostic {
  readonly code: 'UnsupportedNode' | 'UnsupportedMark'
  /** The kind, mark, or node type the mapping has no syntax or no shape for. */
  readonly detail: string
  /** The block or run it sits on, when the mapping got that far. */
  readonly node?: NodeId
}
