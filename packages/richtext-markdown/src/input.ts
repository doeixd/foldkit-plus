/**
 * Markdown input rules (§124 §4): the block markers that reshape a block as they are typed.
 *
 * `# ` through `###### ` retype the block (`RetypeBlock`); `> `, `- `, `* `, `+ `, and an
 * ordered marker such as `1. ` wrap it in a quote or a list (`WrapBlock`). A fence would
 * need the block replaced by a `CodeBlock`, which no command expresses yet, so it stays text
 * and no rule claims it.
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

/** The block markers the standard vocabulary can carry out. */
export const markdownInputRules: ReadonlyArray<InputRule> = [
  ...HEADING_LEVELS.map(level => headingRule(level)),
  quoteRule,
  bulletRule,
  orderedRule,
]
