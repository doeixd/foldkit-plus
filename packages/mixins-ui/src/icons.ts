/**
 * Attribute-dispatched mask icons: mechanisms, not components. An element
 * shows the icon its attribute names, drawn from `--icon` over the text's
 * color. Where an icon comes from (a data URI, a file) is the application's:
 * pass resolved `url(…)` strings. No slots, no views.
 */
import { Style, type StyleValue } from 'foldkit-mixins'

/** Draws the icon in `--icon` before the element's words, in their color. */
export const glyph = (size: string): StyleValue =>
  Style.nest('&::before', {
    WebkitMask: 'var(--icon) center / contain no-repeat',
    background: 'currentColor',
    content: '""',
    flexShrink: '0',
    height: size,
    mask: 'var(--icon) center / contain no-repeat',
    width: size,
  })

/** Sets `--icon` by an attribute's value: each value its own icon. */
export const byAttribute = (
  attribute: string,
  icons: Readonly<Record<string, string>>,
): StyleValue =>
  Style.compose(
    ...Object.entries(icons).map(([value, url]) =>
      Style.nest(`&[${attribute}="${value}"]`, { '--icon': url }),
    ),
  )
