/**
 * An icon as data: what a build reads from an icon set or an SVG file, parsed
 * (`foldkit-media/icons`), not markup to set as HTML. A view draws it
 * (`Icon.draw` in `foldkit-mixins-ui`), and a style masks with it (`maskUrl`),
 * from the one value.
 */

/** One element of an icon's drawing, and its children. */
export interface SvgNode {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: ReadonlyArray<SvgNode>
}

/** An icon: its `viewBox`, the attributes its root `svg` carries (its fill and stroke), and its drawing. */
export interface IconData {
  readonly viewBox: string
  readonly attributes: Readonly<Record<string, string>>
  readonly nodes: ReadonlyArray<SvgNode>
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const attributesOf = (attributes: Readonly<Record<string, string>>): string =>
  Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('')

const nodeMarkup = ({ tag, attributes, children }: SvgNode): string =>
  children.length === 0
    ? `<${tag}${attributesOf(attributes)}/>`
    : `<${tag}${attributesOf(attributes)}>${children.map(nodeMarkup).join('')}</${tag}>`

/** The icon as one standalone `svg` document. */
export const serialize = (icon: IconData): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(icon.viewBox)}"${attributesOf(icon.attributes)}>${icon.nodes.map(nodeMarkup).join('')}</svg>`

/**
 * The icon as a CSS `url()`, for a mask (`Icons.byAttribute`, `Icons.glyph`):
 * a mask reads only the drawing's shape, so its colours do not matter, and
 * the element it masks paints in `currentColor`.
 */
export const maskUrl = (icon: IconData): string =>
  `url("data:image/svg+xml,${encodeURIComponent(serialize(icon))}")`
