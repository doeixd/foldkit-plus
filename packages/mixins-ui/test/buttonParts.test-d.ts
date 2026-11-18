/**
 * A button presses or it is a link, never both: a link has no `type` and no
 * click. Type-checked, not executed.
 */
import { Button } from '../src/index.js'
import { h, message } from './fixture.js'

export const pressing = Button.view(
  { label: 'Save', type: 'submit', onClick: message('Clicked'), busy: true },
  h,
)
export const link = Button.view({ label: 'Docs', href: '/docs', external: true }, h)

export const both = Button.view(
  // @ts-expect-error a link holds no click.
  { label: 'Docs', href: '/docs', onClick: message('Clicked') },
  h,
)

// @ts-expect-error a link holds no type.
export const typed = Button.view({ label: 'Docs', href: '/docs', type: 'submit' }, h)

// @ts-expect-error `external` only means something on a link.
export const loneExternal = Button.view({ label: 'Docs', external: true }, h)

// @ts-expect-error a description is text; a drawing is `trailing`.
export const drawn = Button.view({ label: 'Docs', description: h.span([], []) }, h)

// @ts-expect-error `loading` is not an option: the spinner is the application's, in `icon`.
export const loading = Button.view({ label: 'Save', loading: true }, h)

// @ts-expect-error `aria-invalid` is not a word of a Button.
export const words = Button.view({ label: 'Docs', words: { invalid: 'no' } }, h)
