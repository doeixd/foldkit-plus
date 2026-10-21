/**
 * Compile-time contract of `Theme.fluidType`: a container range is not also a
 * viewport range. Type-checked, not executed.
 */
import { Theme } from '../src/theme.js'

Theme.fluidType({ min: '1rem', max: '2rem', container: true })
Theme.fluidType({ min: '1rem', max: '2rem', viewport: { min: '320px', max: '1440px' } })
// @ts-expect-error A container range is not also a viewport range.
Theme.fluidType({
  min: '1rem',
  max: '2rem',
  container: true,
  viewport: { min: '320px', max: '1440px' },
})
