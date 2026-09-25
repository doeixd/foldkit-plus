/**
 * Input rules (§124 §4): what someone just typed, read as an intent. A rule is not a
 * Transform (§23): a transform normalizes a document whenever it is applied, while a rule
 * is about the moment a particular thing was typed — `# ` at the start of a block means
 * "make this a heading" only at that moment, and never on a document loaded from storage.
 *
 * `applyInputRules` is the composition: the insertion, the deletes that consume what the
 * rule matched, and the rule's own commands, as one action, so a transition and an undo
 * step cover typing the marker and the change it made.
 */
import type { Action, Command } from './command.js'

/** What a rule makes of the text before the caret, and what to do about it. */
export interface InputMatch {
  /** How many characters of that text the rule consumed; the caller deletes them. */
  readonly remove: number
  readonly commands: Action
}

/**
 * A rule over the text before the caret. `match` is a pure read: it sees the text and
 * nothing else, so a rule cannot depend on a selection, a clock, or the Model.
 */
export interface InputRule {
  readonly name: string
  readonly match: (textBefore: string) => InputMatch | undefined
}

/**
 * The commands that insert `text` and then let the first matching rule act on it: the
 * insertion, one backward delete per character the rule consumed, and the rule's commands.
 * Consumption is by deleting backwards rather than by a range, because a range would have
 * to be computed against a state the insertion has not produced yet — the deletes resolve
 * as each one runs. A rule that does not match yields the insertion alone.
 */
export const applyInputRules = (
  rules: ReadonlyArray<InputRule>,
  textBefore: string,
  text: string,
  insertion: Command,
): Action => {
  const typed = `${textBefore}${text}`
  for (const rule of rules) {
    const matched = rule.match(typed)
    if (matched === undefined) continue
    const consumed: ReadonlyArray<Command> = Array.from(
      { length: matched.remove },
      (): Command => ({ type: 'DeleteBackward' }),
    )
    return [insertion, ...consumed, ...matched.commands]
  }
  return [insertion]
}
