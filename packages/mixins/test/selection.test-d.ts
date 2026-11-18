/**
 * `selection` is a typed group of the shipped theme: a name it lacks is an
 * error, and an application overrides it by composing a theme over it.
 */
import { describe, it } from 'vitest'
import { Theme } from '../src/theme.js'

const palette = Theme.standard(Theme.make({}))

describe('selection tokens', () => {
  it('reads and overrides the group’s own names', () => {
    Theme.ref(palette).selection.background
    Theme.ref(palette).selection.ink
    Theme.compose(palette, { selection: { background: 'rebeccapurple', ink: 'white' } })
    Theme.scoped(palette, '.quiet', { selection: { background: 'yellow' } })
  })

  it('refuses a name the group lacks', () => {
    // @ts-expect-error `color` is not a selection token
    Theme.ref(palette).selection.color
  })
})
