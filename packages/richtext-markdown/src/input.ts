/**
 * Markdown input rules (§124 §4): the block markers that reshape a block as they are typed.
 *
 * `# ` through `###### ` retype the block (`RetypeBlock`); `> `, `- `, `* `, `+ `, and an
 * ordered marker such as `1. ` wrap it in a quote or a list (`WrapBlock`); a fence with an
 * optional language, such as `` ```ts ``, converts it to a `CodeBlock` (`ConvertBlock`);
 * `[ ] ` or `[x] ` at the start of a list item makes it a task (see `taskRule` for where).
 *
 * Every marker, and the space that completes it, must be the whole text before the caret,
 * which is what puts it at the block's start — the same place Markdown reads a block marker
 * — and what keeps `see # ` or `a - b` mid-sentence as text.
 */
import type { InputRule } from 'foldkit-richtext'
import { HEADING_LEVELS } from './levels.js'

/** The rule for one heading level. */
const headingRule = (level: (typeof HEADING_LEVELS)[number]): InputRule => {
  const marker = `${'#'.repeat(level)} `
  return {
    name: `heading-${level}`,
    match: textBefore =>
      textBefore === marker
        ? {
            remove: marker.length,
            commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level } }],
          }
        : undefined,
  }
}

const quoteRule: InputRule = {
  name: 'quote',
  match: textBefore =>
    textBefore === '> '
      ? { remove: 2, commands: [{ type: 'WrapBlock', containers: [{ kind: 'Quote' }] }] }
      : undefined,
}

const bulletRule: InputRule = {
  name: 'bullet-list',
  match: textBefore =>
    /^[-*+] $/.test(textBefore)
      ? {
          remove: 2,
          commands: [{ type: 'WrapBlock', containers: [{ kind: 'List' }, { kind: 'ListItem' }] }],
        }
      : undefined,
}

/**
 * An ordered marker starts the list at its number, as Markdown's does; `start` is left out
 * at 1, which is how the parser writes a list that starts there. Markdown allows at most
 * nine digits.
 */
const orderedRule: InputRule = {
  name: 'ordered-list',
  match: textBefore => {
    const marker = /^(\d{1,9})[.)] $/.exec(textBefore)
    if (marker === null) return undefined
    const start = Number(marker[1])
    return {
      remove: textBefore.length,
      commands: [
        {
          type: 'WrapBlock',
          containers: [
            { kind: 'List', props: start === 1 ? { ordered: true } : { ordered: true, start } },
            { kind: 'ListItem' },
          ],
        },
      ],
    }
  },
}

/**
 * A fence and its language, completed by a space rather than the line break Markdown reads
 * it at: Enter splits a block, and a rule sees only what is typed. A fence is three or more
 * backticks or tildes, as Markdown's is. The language is the word after it, as an info string
 * starts, and a backtick cannot be part of it; none leaves the prop out.
 */
const fenceRule: InputRule = {
  name: 'code-block',
  match: textBefore => {
    const fence = /^(?:`{3,}|~{3,})([\w+#.-]*) $/.exec(textBefore)
    if (fence === null) return undefined
    const language = fence[1]!
    return {
      remove: textBefore.length,
      commands: [
        {
          type: 'ConvertBlock',
          to: { kind: 'CodeBlock', props: language.length === 0 ? {} : { language } },
        },
      ],
    }
  },
}

/**
 * A task marker, `[ ] ` or `[x] `, at the start of a list item: `- ` has already made the
 * item by then, so the rule reads that it is in one. The item becomes a task where it stands,
 * with everything it holds. `RetypeContainer` refuses unless the marker is in the item's first
 * block, as Markdown reads it, so in a later paragraph of the item the marker stays text.
 */
const taskRule: InputRule = {
  name: 'task-list',
  match: (textBefore, within) => {
    const marker = /^\[( |x|X)\] $/.exec(textBefore)
    if (marker === null || within[0] !== 'ListItem') return undefined
    return {
      remove: textBefore.length,
      commands: [
        {
          type: 'RetypeContainer',
          to: { kind: 'TaskItem', props: { checked: marker[1] !== ' ' } },
        },
      ],
    }
  },
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const graphemeCount = (text: string): number => Array.from(graphemes.segment(text)).length

/** What may stand before an opening delimiter: the block's start, a space, or an opening mark. */
const OPENS_AFTER = /[\s([{"'“‘]/u

/**
 * An inline marker, closed as it is typed: `**bold**` becomes bold text the moment the second
 * `**` is, and what is typed next is plain again. The content is not empty, neither starts nor
 * ends with a space, and holds no delimiter character, and the opening stands at the block's
 * start or after a space or an opening bracket or quote, so `snake_case_name` and `2*3*4` stay
 * text. The marked text replaces the delimited run, so one undo restores what was typed.
 */
const inlineRule = (name: string, delimiter: string, mark: string): InputRule => ({
  name,
  match: textBefore => {
    if (!textBefore.endsWith(delimiter)) return undefined
    const closing = textBefore.length - delimiter.length
    const opening = textBefore.lastIndexOf(delimiter, closing - delimiter.length - 1)
    if (opening < 0) return undefined
    const content = textBefore.slice(opening + delimiter.length, closing)
    const before = textBefore[opening - 1]
    if (
      content.length === 0 ||
      content.includes(delimiter[0]!) ||
      content.trim() !== content ||
      (before !== undefined && !OPENS_AFTER.test(before))
    ) {
      return undefined
    }
    return {
      // Backward deletes remove a grapheme each, so the run is counted in graphemes.
      remove: graphemeCount(textBefore.slice(opening)),
      commands: [{ type: 'InsertText', text: content, marks: [mark] }],
      storedMarks: [],
    }
  },
})

/**
 * The inline markers: `**bold**`, `*italic*` and `_italic_`, `` `code` ``, and `~~struck~~`.
 * Content never holds its delimiter's character, so `**a**` is never read as italic around `*a*`.
 */
export const markdownInlineRules: ReadonlyArray<InputRule> = [
  inlineRule('bold', '**', 'Bold'),
  inlineRule('strikethrough', '~~', 'Strikethrough'),
  inlineRule('italic', '*', 'Italic'),
  inlineRule('italic-underscore', '_', 'Italic'),
  inlineRule('code', '`', 'Code'),
]

/** The block markers the standard vocabulary can carry out, then the inline ones. */
export const markdownInputRules: ReadonlyArray<InputRule> = [
  ...HEADING_LEVELS.map(level => headingRule(level)),
  quoteRule,
  bulletRule,
  orderedRule,
  fenceRule,
  taskRule,
  ...markdownInlineRules,
]
