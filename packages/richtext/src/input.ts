/**
 * Input rules (§124 §4): what someone just typed, read as an intent. A rule is not a
 * Transform (§23): a transform normalizes a document whenever it is applied, while a rule
 * is about the moment a particular thing was typed — `# ` at the start of a block means
 * "make this a heading" only at that moment, and never on a document loaded from storage.
 *
 * `applyInputRules` is the composition: the insertion, the deletes that consume what the
 * rule matched, and the rule's commands, as one action, so a transition and an undo step
 * cover typing the marker and the change it made.
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

/** One edit to read a rule against, named so two strings cannot be handed over swapped. */
export interface InputContext {
  /** The caret's block text before the caret, before this insertion. */
  readonly textBefore: string
  /** What was just typed. */
  readonly text: string
  /** The insertion itself, which a matching rule then acts on. */
  readonly insertion: Command
}

/**
 * The commands that insert the text and then let the first matching rule act on it: the
 * insertion, one backward delete per character the rule consumed, and the rule's commands.
 * Consumption is by deleting backwards rather than by a range, because a range would have
 * to be computed against a state the insertion has not produced yet — the deletes resolve
 * as each one runs. A rule that does not match yields the insertion alone.
 *
 * A rule that claims to consume more than it was shown throws: those deletes would run past
 * the block's start and join it to the one before, which no rule means.
 */
export const applyInputRules = (rules: ReadonlyArray<InputRule>, input: InputContext): Action => {
  const typed = `${input.textBefore}${input.text}`
  for (const rule of rules) {
    const matched = rule.match(typed)
    if (matched === undefined) continue
    if (!Number.isInteger(matched.remove) || matched.remove < 0 || matched.remove > typed.length) {
      throw new RangeError(
        `Input rule "${rule.name}" removes ${matched.remove} characters of the ${typed.length} it was shown`,
      )
    }
    const consumed: ReadonlyArray<Command> = Array.from(
      { length: matched.remove },
      (): Command => ({ type: 'DeleteBackward' }),
    )
    return [input.insertion, ...consumed, ...matched.commands]
  }
  return [input.insertion]
}
