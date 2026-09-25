/**
 * Markdown input rules (§124 §4): the block markers that retype a block as they are typed.
 *
 * `# ` through `###### ` are here because the command vocabulary can carry them out —
 * `RetypeBlock` changes a text block's type and keeps its runs. `> `, `- `, `1. `, and a
 * fence would each need the block wrapped in a container, or replaced by an atom, and that
 * is a vocabulary decision rather than a rule: until a command expresses it, those markers
 * stay text and no rule claims them.
 */
import type { InputRule } from 'foldkit-richtext'

const LEVELS = [1, 2, 3, 4, 5, 6] as const

/**
 * The rule for one level. The hashes and the space that completes them must be the whole
 * text before the caret, which is what puts them at the block's start — the same place
 * Markdown reads a heading marker — and what keeps `see # ` mid-sentence as text.
 */
const headingRule = (level: (typeof LEVELS)[number]): InputRule => {
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

/** The block markers the standard vocabulary can carry out, one rule per heading level. */
export const markdownInputRules: ReadonlyArray<InputRule> = LEVELS.map(level => headingRule(level))
