/**
 * A component page's controls: one that changes nothing under the picks beside
 * it is drawn disabled, with the reason, and keeps the value it holds.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'

import { showcaseOf } from '../src/gallery/showcases.js'
import { idleHint } from '../src/gallery/showcase.js'
import { Message } from '../src/main.js'
import { SiteStyle } from '../src/style.js'
import { choices } from '../src/view/components.js'

const card = Option.getOrThrow(showcaseOf('card'))
const elevation = card.axes.find(axis => axis.name === 'elevation')!
const hint = (surface: string) => idleHint(card.axes, elevation, { surface })

const h = SlotView.inertBuilder<Message>()
const slots = SlotView.buildersFor(SiteStyle.slots, [], { input: undefined, h })
const drawn = (idle: string | undefined) =>
  JSON.stringify(
    choices(
      slots,
      h,
      'elevation',
      [{ value: '3', label: '3' }],
      '3',
      () => Message.PickedVariant({ axis: 'elevation', value: '3' }),
      idle,
    ) satisfies Html,
    (key, value) => (key === 'elm' ? undefined : value),
  )

describe('the card page’s elevation control', () => {
  it('is live under the surfaces that read it, and idle under the flat ones', () => {
    expect(hint('outlined')).toBeUndefined()
    expect(hint('elevated')).toBeUndefined()
    expect(hint('filled')).toBe('outlined and elevated only')
    expect(hint('plain')).toBe('outlined and elevated only')
    // Untouched, the card is outlined, which reads elevation.
    expect(idleHint(card.axes, elevation, {})).toBeUndefined()
  })

  it('leaves an axis with no dependency alone', () => {
    const surface = card.axes.find(axis => axis.name === 'surface')!
    expect(idleHint(card.axes, surface, { surface: 'filled' })).toBeUndefined()
  })

  it('is drawn in a disabled fieldset, still showing its value, with the reason', () => {
    const idle = drawn('outlined and elevated only')
    expect(idle).toContain('"disabled":true')
    expect(idle).toContain('outlined and elevated only')
    expect(idle).toContain('"aria-pressed":"true"')
    expect(drawn(undefined)).not.toContain('"disabled"')
  })
})
