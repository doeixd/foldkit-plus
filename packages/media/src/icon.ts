/**
 * An icon as data: what a build reads from an icon set or an SVG file, parsed
 * (`foldkit-media/icons`), not markup to set as HTML. A view draws it
 * (`Icon.draw` in `foldkit-mixins-ui`), and a style masks with it (`maskUrl`),
 * from the one value.
 */

/** The elements an icon may hold: presentational SVG, nothing that runs, loads or holds text. */
export const TAGS = [
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'use',
] as const
export type SvgTag = (typeof TAGS)[number]

/** One element of an icon's drawing, and its children. */
export interface SvgNode {
  readonly tag: SvgTag
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

const keys = new WeakMap<IconData, string>()

/**
 * A short name for the icon, from its content: the same drawing has the same
 * key on a server and in the browser, and two drawings almost never share
 * one. A drawing's ids are prefixed with it, and a sprite names its symbol by it.
 */
export const key = (icon: IconData): string => {
  const known = keys.get(icon)
  if (known !== undefined) return known
  // FNV-1a over the serialized drawing.
  let hash = 0x811c9dc5
  for (const unit of serialize(icon)) {
    hash ^= unit.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193)
  }
  const made = `i${(hash >>> 0).toString(36)}`
  keys.set(icon, made)
  return made
}

const idsOf = (nodes: ReadonlyArray<SvgNode>, into: Set<string>): Set<string> => {
  for (const node of nodes) {
    if (node.attributes['id'] !== undefined) into.add(node.attributes['id'])
    idsOf(node.children, into)
  }
  return into
}

interface Prefixed {
  readonly ids: ReadonlySet<string>
  readonly byPrefix: Map<string, IconData>
}

const prefixed = new WeakMap<IconData, Prefixed>()

/**
 * The icon with each id it defines, and each `href` and `url()` naming one,
 * prefixed: two icons drawn inline on one page share the document's ids, and
 * an exported SVG's `id="a"` would otherwise paint another icon's gradient.
 * An icon with no ids is returned as it was given. Kept per icon and prefix,
 * since a view asks again on every render.
 */
export const prefixIds = (icon: IconData, prefix: string): IconData => {
  const memo = prefixed.get(icon) ?? { ids: idsOf(icon.nodes, new Set()), byPrefix: new Map() }
  prefixed.set(icon, memo)
  const { ids, byPrefix } = memo
  if (ids.size === 0) return icon
  const known = byPrefix.get(prefix)
  if (known !== undefined) return known
  const rename = (id: string) => (ids.has(id) ? `${prefix}-${id}` : id)
  const rewriteValue = (name: string, value: string): string => {
    if (name === 'id') return rename(value)
    // The parser admits only a fragment `href`.
    if (name === 'href') return `#${rename(value.slice(1))}`
    return value.replace(
      /url\(\s*(['"]?)#([^)'"]*)\1\s*\)/gi,
      (_, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`,
    )
  }
  const rewrite = (attributes: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [name, rewriteValue(name, value)]),
    )
  const walk = (node: SvgNode): SvgNode => ({
    tag: node.tag,
    attributes: rewrite(node.attributes),
    children: node.children.map(walk),
  })
  const made: IconData = {
    viewBox: icon.viewBox,
    attributes: rewrite(icon.attributes),
    nodes: icon.nodes.map(walk),
  }
  byPrefix.set(prefix, made)
  return made
}
