/**
 * An icon draws data or a drawing of your own, never both. Type-checked, not executed.
 */
import { parse } from 'foldkit-media/icons'
import { Icon } from '../src/index.js'
import { h } from './fixture.js'

const check = parse('<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>', 'check')

export const data = Icon.view({ icon: check, label: 'Saved' }, h)
export const own = Icon.view({ glyph: h.span([], ['AB']) }, h)

// @ts-expect-error an icon is data or a drawing of your own.
export const both = Icon.view({ icon: check, glyph: h.span([], []) }, h)

// @ts-expect-error `key` parts copies of an icon's data and means nothing for a drawing of your own.
export const keyed = Icon.view({ glyph: h.span([], []), key: 'a' }, h)

// @ts-expect-error an icon needs one or the other.
export const neither = Icon.view({ label: 'Saved' }, h)
