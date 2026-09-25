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

describe('turning what was typed into an action', () => {
  it('is the insertion alone when no rule matches', () => {
    expect(RichText.applyInputRules([rule('h1', '# ', 2)], 'plain', ' ', insertion)).toEqual([
      insertion,
    ])
    expect(RichText.applyInputRules([], '#', ' ', insertion)).toEqual([insertion])
  })

  it('inserts, consumes the match backwards, then runs the rule’s commands', () => {
    expect(
      RichText.applyInputRules([rule('h1', '# ', 2, [retype(1)])], '#', ' ', insertion),
    ).toEqual([insertion, { type: 'DeleteBackward' }, { type: 'DeleteBackward' }, retype(1)])
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
    RichText.applyInputRules([watching], '#', ' ', insertion)
    expect(seen).toEqual(['# '])
  })

  it('lets the first matching rule win', () => {
    const action = RichText.applyInputRules(
      [rule('first', '# ', 1), rule('second', '# ', 3)],
      '#',
      ' ',
      insertion,
    )
    expect(action).toEqual([insertion, { type: 'DeleteBackward' }])
  })
})
