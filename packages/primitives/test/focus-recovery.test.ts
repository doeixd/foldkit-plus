// @vitest-environment jsdom
/**
 * `part` writes the attribute names the `FocusRecovery` Mount reads.
 */
import { type Attribute, inertHtml as h } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FOCUS_RECOVERY_PART, FOCUS_RECOVERY_TO, part } from '../src/dom/focus-recovery.js'

/** Each attribute the list sets, by name, as the DOM will hold it. */
const attributesOf = (attributes: ReadonlyArray<Attribute<never>>) => {
  const node = h.li(attributes, [])
  return { ...node?.data?.attrs, ...node?.data?.props }
}

describe('part', () => {
  it('marks the element with the attribute the Mount reads', () => {
    expect(FOCUS_RECOVERY_PART).toBe('data-fk-focus-recovery-part')
    expect(attributesOf(part<never>(h))).toEqual({ [FOCUS_RECOVERY_PART]: '' })
  })

  it('names the fallback with the attribute the Mount reads', () => {
    expect(FOCUS_RECOVERY_TO).toBe('data-fk-focus-recovery-to')
    expect(attributesOf(part<never>(h, { to: 'search' }))).toEqual({
      [FOCUS_RECOVERY_PART]: '',
      [FOCUS_RECOVERY_TO]: 'search',
    })
  })
})
