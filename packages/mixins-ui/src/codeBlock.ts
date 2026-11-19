import { Option } from 'effect'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { CodeBlockSlots } from './codeBlock/slots.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

export { follow } from './codeBlock/follow.js'
export { CodeBlockSlots } from './codeBlock/slots.js'

/**
 * A highlighted run of the code, as offsets into it: the shape
 * `foldkit-richtext`'s `CodeToken` has, so a tokenizer's output passes as it is.
 */
export interface CodeToken {
  readonly from: number
  readonly to: number
  readonly kind: string
}

/**
 * The kinds the recipe colours: a diff's `added` and `removed`, a
 * `highlight`, a diagnostic's `error` and `warning`, `dim` for the lines a
 * walkthrough is not about, and `selected`, which also presses the line's
 * gutter button under `onLineSelect`. A kind of your own is a recipe `add`.
 */
export type CodeMarkKind =
  | 'added'
  | 'removed'
  | 'highlight'
  | 'error'
  | 'warning'
  | 'dim'
  | 'selected'

/** A whole line marked by what it is: `data-mark` on the line. */
export interface CodeMark {
  /** The line's number as drawn, counted from `startLine`. */
  readonly line: number
  readonly kind: CodeMarkKind | (string & {})
}

/** The copy button: what pressing it causes, and whether that has happened. */
export interface CodeBlockCopy<Message> {
  /**
   * The Message a press sends, given the code; run `foldkit-primitives`'
   * `copyText` from it. Without one the button is drawn with no handler, for
   * a page whose script copies by itself (a server-rendered static region).
   */
  readonly onCopy?: ((code: string) => Message) | undefined
  /** Draws the button as done: `data-copied="true"` and the `copied` words. */
  readonly copied?: boolean | undefined
}

/** The block's words: the copy button's, a gutter button's name, and the expand button's. */
export interface CodeBlockWords {
  readonly copy: string
  readonly copied: string
  /** A line's gutter button under `onLineSelect`; `{line}` is its number. */
  readonly selectLine: string
  /** The button under a collapsed block; `{count}` is how many lines the code has. */
  readonly expand: string
  /** The same button once the block shows all of its code. */
  readonly collapse: string
}

/** The words a code block starts from; `words` overrides them one at a time. */
export const words: CodeBlockWords = {
  copy: 'Copy',
  copied: 'Copied',
  selectLine: 'Line {line}',
  expand: 'Show all {count} lines',
  collapse: 'Show less',
}

/**
 * Shows the first `lines` lines under a fade, and a button for the rest. Every
 * line stays in the page, clamped by style, so a find, a copy of the page's
 * text and an anchor still reach the whole code. A block of `lines` lines or
 * fewer is drawn whole, with no button.
 */
export interface CodeBlockCollapsed<Message> {
  readonly lines: number
  /** Whether the whole code shows, and the button offers `words.collapse`. Default: no. */
  readonly expanded?: boolean | undefined
  /**
   * The Message a press sends; the application flips `expanded`. Without one
   * the button is drawn with no handler, for a page whose script toggles it
   * (a server-rendered static region): the button carries the words it shows
   * after a press as `data-toggled-label`.
   */
  readonly onToggle?: Message | undefined
}

/**
 * Code in one call: the text, the tokens that color it, a title (a file
 * name) or a language over it, line numbers, and a copy button. No upstream
 * component stands behind it.
 */
export interface CodeBlockView<Message> {
  readonly code: string
  /** Sorted, not overlapping, inside the code. Default: none, plain text. */
  readonly tokens?: ReadonlyArray<CodeToken> | undefined
  /** Written as `data-language` on the root, and shown when there is no title. */
  readonly language?: string | undefined
  /** Shown over the code: a file name, say. */
  readonly title?: string | undefined
  /** Numbers each line: `data-line-numbers="true"` on the root. */
  readonly lineNumbers?: boolean | undefined
  /** The first line's number, for an excerpt; every `line` the block hands out counts from it. Default 1. */
  readonly startLine?: number | undefined
  /** A line's gutter text in place of its number, as a patch's `+` and `-` or two columns of numbers. */
  readonly gutter?: ((line: number) => string) | undefined
  /** Lines marked by what they are; at most one mark a line. */
  readonly marks?: ReadonlyArray<CodeMark> | undefined
  /** Wraps long lines in place of scrolling sideways: `data-wrap="true"` on the root. */
  readonly wrap?: boolean | undefined
  readonly collapsed?: CodeBlockCollapsed<Message> | undefined
  /** Makes each line's gutter a button that sends this with the line's number. */
  readonly onLineSelect?: ((line: number) => Message) | undefined
  /** Html at a line's end (a badge, a button), or none. Its text joins the block's text. */
  readonly lineAction?: ((line: number) => Option.Option<Html>) | undefined
  readonly copy?: CodeBlockCopy<Message> | undefined
  /** The block's words, over `CodeBlock.words`. */
  readonly words?: Partial<CodeBlockWords> | undefined
  /** A style of `CodeBlockSlots`, for the block's look. */
  readonly style?: NamedStyle<typeof CodeBlockSlots> | undefined
  /** Mixins beside the style; `CodeBlock.follow` keeps a growing block at its end. */
  readonly mixins?: MixinList<Message> | undefined
}

/** A run of the code: plain, or one token's text with its kind. */
interface Run {
  readonly text: string
  readonly kind: string | undefined
}

/**
 * The code cut into lines of runs. A token out of order, overlapping the one
 * before it, outside the code or covering nothing throws: it is the
 * tokenizer's bug, and drawing it would color the wrong text.
 */
export const linesOf = (
  code: string,
  tokens: ReadonlyArray<CodeToken>,
): ReadonlyArray<ReadonlyArray<Run>> => {
  const runs: Array<Run> = []
  let at = 0
  for (const token of tokens) {
    if (!(Number.isInteger(token.from) && Number.isInteger(token.to)))
      throw new RangeError(
        `a ${token.kind} token at [${token.from}, ${token.to}) is not at whole offsets`,
      )
    if (token.from < at || token.to <= token.from || token.to > code.length)
      throw new RangeError(
        `a ${token.kind} token at [${token.from}, ${token.to}) is out of order, empty, or outside ${code.length} characters`,
      )
    if (token.from > at) runs.push({ text: code.slice(at, token.from), kind: undefined })
    runs.push({ text: code.slice(token.from, token.to), kind: token.kind })
    at = token.to
  }
  if (at < code.length) runs.push({ text: code.slice(at), kind: undefined })
  // A run that crosses a line break is cut at it, so each line holds its own runs.
  const lines: Array<Array<Run>> = [[]]
  for (const run of runs)
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part !== '') lines.at(-1)!.push({ text: part, kind: run.kind })
    })
  // A final line break ends the last line; it does not start another to number.
  if (lines.length > 1 && lines.at(-1)?.length === 0) lines.pop()
  return lines
}

/**
 * Each mark's kind by its line. A mark outside the lines, or a second on one
 * line, throws: the caller counted the lines differently, and drawing it
 * would mark the wrong one.
 */
const marksOf = (
  marks: ReadonlyArray<CodeMark>,
  first: number,
  count: number,
): ReadonlyMap<number, string> => {
  const byLine = new Map<number, string>()
  for (const mark of marks) {
    if (!Number.isInteger(mark.line) || mark.line < first || mark.line >= first + count)
      throw new RangeError(
        `a ${mark.kind} mark on line ${mark.line} is outside lines ${first} to ${first + count - 1}`,
      )
    if (byLine.has(mark.line))
      throw new RangeError(
        `line ${mark.line} is marked twice (${byLine.get(mark.line)}, ${mark.kind})`,
      )
    byLine.set(mark.line, mark.kind)
  }
  return byLine
}

export const view = <Message>(options: CodeBlockView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    CodeBlockSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { collapsed, gutter, onLineSelect, lineAction } = options
  const first = options.startLine ?? 1
  if (!Number.isInteger(first)) throw new RangeError(`startLine ${first} is not a whole number`)
  if (collapsed !== undefined && !(Number.isInteger(collapsed.lines) && collapsed.lines >= 1))
    throw new RangeError(`collapsed.lines ${collapsed.lines} is not a whole number of at least 1`)
  const heading = options.title ?? options.language
  const copy = options.copy
  const text = wordsOf(words, options.words)
  const header =
    heading === undefined && copy === undefined
      ? []
      : [
          h.div(builders.header.attrs(), [
            h.span(builders.title.attrs(), heading === undefined ? [] : [heading]),
            ...(copy === undefined
              ? []
              : [
                  h.button(
                    builders.copy.attrs([
                      h.Type('button'),
                      h.DataAttribute('copied', String(copy.copied === true)),
                      ...(copy.onCopy === undefined ? [] : [h.OnClick(copy.onCopy(options.code))]),
                    ]),
                    [copy.copied === true ? text.copied : text.copy],
                  ),
                  // The button's own words change, which a screen reader does not announce.
                  h.span(
                    builders.status.attrs([h.Role('status')]),
                    copy.copied === true ? [text.copied] : [],
                  ),
                ]),
          ]),
        ]
  const all = linesOf(options.code, options.tokens ?? [])
  const marks = marksOf(options.marks ?? [], first, all.length)
  // Only a block longer than its `lines` has anything to clamp.
  const clamped = collapsed !== undefined && all.length > collapsed.lines
  const expanded = collapsed?.expanded === true
  const numberOf = (line: number) => (gutter === undefined ? String(line) : gutter(line))
  const numbered =
    gutter !== undefined || options.lineNumbers === true || onLineSelect !== undefined
  // Every gutter as wide as the widest, so the code starts in one column.
  const gutterWidth = numbered
    ? Math.max(2, ...all.map((_, index) => numberOf(first + index).length))
    : 0
  const gutterOf = (line: number) => {
    const number = h.DataAttribute('number', numberOf(line))
    return onLineSelect === undefined
      ? h.span(builders.gutter.attrs([h.AriaHidden(true), number]), [])
      : h.button(
          builders.gutter.attrs([
            h.Type('button'),
            number,
            h.AriaLabel(fill(text.selectLine, { line })),
            h.AriaPressed(String(marks.get(line) === 'selected')),
            h.OnClick(onLineSelect(line)),
          ]),
          [],
        )
  }
  // Lines are inline and joined by the line breaks themselves, so the text of
  // the block is the code exactly (bar what `lineAction` adds), for a copy
  // that reads it from the page; the gutter draws its text from an attribute.
  const lines = all.flatMap((runs, index) => {
    const line = first + index
    const mark = marks.get(line)
    const action = lineAction === undefined ? Option.none() : lineAction(line)
    return [
      ...(index === 0 ? [] : ['\n']),
      h.span(builders.line.attrs(mark === undefined ? [] : [h.DataAttribute('mark', mark)]), [
        ...(numbered ? [gutterOf(line)] : []),
        ...runs.map(run =>
          run.kind === undefined
            ? run.text
            : h.span(builders.token.attrs([h.DataAttribute('kind', run.kind)]), [run.text]),
        ),
        ...Option.match(action, {
          onNone: () => [],
          onSome: drawn => [h.span(builders.lineAction.attrs(), [drawn])],
        }),
      ]),
    ]
  })
  const rootStyle = {
    ...(numbered ? { '--fk-code-gutter': `${gutterWidth}ch` } : {}),
    ...(collapsed !== undefined && clamped ? { '--fk-code-clamp': String(collapsed.lines) } : {}),
  }
  const expandWords = fill(text.expand, { count: all.length })
  return h.figure(
    builders.root.attrs([
      ...(options.language === undefined ? [] : [h.DataAttribute('language', options.language)]),
      h.DataAttribute('line-numbers', String(options.lineNumbers === true)),
      ...(options.wrap === true ? [h.DataAttribute('wrap', 'true')] : []),
      ...(clamped ? [h.DataAttribute('collapsed', String(!expanded))] : []),
      ...(Object.keys(rootStyle).length === 0 ? [] : [h.Style(rootStyle)]),
    ]),
    [
      ...header,
      h.pre(builders.body.attrs(), [
        h.code(builders.code.attrs(), [...lines, ...(options.code.endsWith('\n') ? ['\n'] : [])]),
      ]),
      ...(collapsed !== undefined && clamped
        ? [
            h.button(
              builders.expand.attrs([
                h.Type('button'),
                h.AriaExpanded(expanded),
                h.DataAttribute('toggled-label', expanded ? expandWords : text.collapse),
                ...(collapsed.onToggle === undefined ? [] : [h.OnClick(collapsed.onToggle)]),
              ]),
              [expanded ? text.collapse : expandWords],
            ),
          ]
        : []),
    ],
  )
}
