/**
 * Markdown input rules (§124 §4): the block markers that reshape a block as they are typed.
 *
 * `# ` through `###### ` retype the block (`RetypeBlock`); `> `, `- `, `* `, `+ `, and an
 * ordered marker such as `1. ` wrap it in a quote or a list (`WrapBlock`); a fence with an
 * optional language, such as `` ```ts ``, converts it to a `CodeBlock` (`ConvertBlock`).
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

/** The block markers the standard vocabulary can carry out. */
export const markdownInputRules: ReadonlyArray<InputRule> = [
  ...HEADING_LEVELS.map(level => headingRule(level)),
  quoteRule,
  bulletRule,
  orderedRule,
  fenceRule,
]
