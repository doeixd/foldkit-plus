/**
 * foldkit-richtext-markdown — the Markdown interpreter (§124 §1). Markdown is an
 * interpreter over a semantic Document, not a second document model: this maps both
 * directions and reports what a mapping cannot express rather than dropping it silently.
 *
 * `print` writes CommonMark with GFM's lists, tasks, strikethrough, and tables; `parse`
 * reads the same set back, so `print(parse(markdown))` and `parse(print(document))` are
 * the round trips the design's testing section asks for. A profile for custom syntax
 * arrives when a custom syntax needs both directions at once.
 */
export { type MarkdownDiagnostic } from './diagnostic.js'
export { markdownInputRules } from './input.js'
export { print, type PrintedMarkdown } from './print.js'
export { parse, type ParseOptions, type ParsedMarkdown } from './parse.js'
