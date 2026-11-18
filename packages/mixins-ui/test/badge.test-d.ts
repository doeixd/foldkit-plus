/**
 * A badge is dismissed or a link, never both: a button inside a link is
 * invalid markup. Type-checked, not executed.
 */
import { Badge } from '../src/index.js'
import { h, message } from './fixture.js'

export const dismissible = Badge.view({ text: 'Design', onDismiss: message('Clicked') }, h)
export const link = Badge.view({ text: 'Docs', href: '/docs', external: true }, h)

export const bothDirections = Badge.view(
  // @ts-expect-error a link holds no dismiss button.
  { text: 'Docs', href: '/docs', onDismiss: message('Clicked') },
  h,
)

// @ts-expect-error `external` only means something on a link.
export const loneExternal = Badge.view({ text: 'Docs', external: true }, h)

// @ts-expect-error a dismiss Message of another application's.
export const foreignMessage = Badge.view({ text: 'Design', onDismiss: 'nope' }, h)
