/**
 * Input rules (§124 §4): what was typed becomes an action, and the action is the
 * insertion, the consumption of what the rule matched, and the rule's own commands.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const insertion: RichText.Command = { type: 'InsertText', text: ' ' }

const rule = (
  name: string,
  when: string,
  remove: number,
  commands: RichText.Action = [],
): RichText.InputRule => ({
  name,
  match: textBefore => (textBefore === when ? { remove, commands } : undefined),
})

const retype = (level: 1 | 2 | 3): RichText.Command => ({
  type: 'RetypeBlock',
  to: { type: 'Heading', level },
})

/** The action for typing one character into a block whose text was `textBefore`. */
const action = (
  rules: ReadonlyArray<RichText.InputRule>,
  textBefore: string,
  text: string,
): RichText.Action => RichText.applyInputRules(rules, { textBefore, text, insertion })

describe('turning what was typed into an action', () => {
  it('is the insertion alone when no rule matches', () => {
    expect(action([rule('h1', '# ', 2)], 'plain', ' ')).toEqual([insertion])
    expect(action([], '#', ' ')).toEqual([insertion])
  })

  it('inserts, consumes the match backwards, then runs the rule’s commands', () => {
    expect(action([rule('h1', '# ', 2, [retype(1)])], '#', ' ')).toEqual([
      insertion,
      { type: 'DeleteBackward' },
      { type: 'DeleteBackward' },
      retype(1),
    ])
  })

  it('shows a rule the text the insertion will produce, not only what is there', () => {
    const seen: Array<string> = []
    const watching: RichText.InputRule = {
      name: 'watching',
      match: textBefore => {
        seen.push(textBefore)
        return undefined
      },
    }
    action([watching], '#', ' ')
    expect(seen).toEqual(['# '])
  })

  it('lets the first matching rule win', () => {
    expect(action([rule('first', '# ', 1), rule('second', '# ', 3)], '#', ' ')).toEqual([
      insertion,
      { type: 'DeleteBackward' },
    ])
  })
})
