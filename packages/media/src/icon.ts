/**
 * An icon as data: what a build reads from an icon set or an SVG file, parsed
 * (`foldkit-media/icons`), not markup to set as HTML. A view draws it
 * (`draw`), and a style masks with it (`maskUrl`),
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
  // Only what a data URL in a quoted CSS `url()` cannot hold is escaped (a line break ends a CSS
  // string): a theme writes every chrome icon this way, and escaping the spaces, `=` and `/`
  // too adds a quarter to each.
  `url("data:image/svg+xml,${serialize(icon).replace(/[%#<>"\n\r\t]/g, unsafe => `%${unsafe.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`)}")`

const keys = new WeakMap<IconData, string>()

/**
 * A short name for the icon, from its content: the same drawing has the same
 * key on a server and in the browser, and two drawings almost never share
 * one. A drawing's ids are prefixed with it, and a sprite names its symbol by it.
 */
export const key = (icon: IconData): string => {
  const known = keys.get(icon)
  if (known !== undefined) return known
  // 64-bit FNV-1a over the serialized drawing.
  let hash = 0xcbf29ce484222325n
  for (const unit of serialize(icon)) {
    hash ^= BigInt(unit.codePointAt(0)!)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  const made = `i${hash.toString(36)}`
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

const idPrefix = (prefix: string): string => {
  if (/^(?!fk_)[A-Za-z0-9_-]+$/.test(prefix)) return prefix
  let encoded = ''
  for (let at = 0; at < prefix.length; at++) {
    encoded += prefix.charCodeAt(at).toString(16).padStart(4, '0')
  }
  return `fk_${encoded}`
}

/**
 * The icon with each id it defines, and each `href` and `url()` naming one,
 * prefixed: two icons drawn inline on one page share the document's ids, and
 * an exported SVG's `id="a"` would otherwise paint another icon's gradient.
 * A prefix outside an identifier's safe characters is encoded before it
 * reaches a CSS `url()`. An icon with no ids is returned as it was given.
 * Kept per icon and prefix, since a view asks again on every render.
 */
export const prefixIds = (icon: IconData, prefix: string): IconData => {
  const memo = prefixed.get(icon) ?? { ids: idsOf(icon.nodes, new Set()), byPrefix: new Map() }
  prefixed.set(icon, memo)
  const { ids, byPrefix } = memo
  if (ids.size === 0) return icon
  const known = byPrefix.get(prefix)
  if (known !== undefined) return known
  const writtenPrefix = idPrefix(prefix)
  const rename = (id: string) => (ids.has(id) ? `${writtenPrefix}-${id}` : id)
  const rewriteValue = (name: string, value: string): string => {
    if (name === 'id') return rename(value)
    // The parser admits only a fragment `href`.
    if (name === 'href') return `#${rename(value.slice(1))}`
    return value.replace(
      /url\(\s*(['"]?)#([^)'"\s]*)\1\s*\)/gi,
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

/** How a drawing's strokes are drawn: their width, and whether their ends and joins are round. */
export interface Stroke {
  readonly width?: number | undefined
  readonly corners?: 'round' | 'square' | undefined
}

/**
 * The icon with its strokes redrawn: every `stroke-width`, `stroke-linecap`
 * and `stroke-linejoin` it sets replaced, or set on its root where it sets
 * none. A filled icon draws no stroke, so it is unchanged in what shows. For
 * a mask, whose drawing CSS cannot reach once it is a `url()`.
 */
export const withStroke = (icon: IconData, stroke: Stroke): IconData => {
  const set: Record<string, string> = {}
  if (stroke.width !== undefined) set['stroke-width'] = String(stroke.width)
  if (stroke.corners !== undefined) {
    set['stroke-linecap'] = stroke.corners
    set['stroke-linejoin'] = stroke.corners === 'round' ? 'round' : 'miter'
  }
  const names = Object.keys(set)
  const found = new Set<string>()
  const restroke = (attributes: Readonly<Record<string, string>>) => {
    const written = { ...attributes }
    for (const name of names) {
      if (Object.hasOwn(attributes, name)) {
        written[name] = set[name]!
        found.add(name)
      }
    }
    return written
  }
  const walk = (node: SvgNode): SvgNode => ({
    tag: node.tag,
    attributes: restroke(node.attributes),
    children: node.children.map(walk),
  })
  const nodes = icon.nodes.map(walk)
  const attributes = restroke(icon.attributes)
  // A property the drawing never sets is set once on the root, which every node inherits.
  for (const name of names) if (!found.has(name)) attributes[name] = set[name]!
  return { viewBox: icon.viewBox, attributes, nodes }
}

type Element<Node, Attribute> = (
  attributes: ReadonlyArray<Attribute>,
  children: ReadonlyArray<Node>,
) => Node

/**
 * What `draw` needs of a view's builder: an element per tag an icon may hold,
 * and raw attributes. Foldkit's `HtmlBuilder` is one, so this package needs
 * no view library of its own.
 */
export type SvgBuilder<Node, Attribute> = {
  readonly svg: Element<Node, Attribute>
  readonly Attribute: (name: string, value: string) => Attribute
  readonly AriaHidden: (value: boolean) => Attribute
} & { readonly [Tag in SvgTag]: Element<Node, Attribute> }

/**
 * The icon as inline SVG, through a view's builder (`h`): `size` square
 * (`1em` unless given, so it stands as tall as its text; `foldkit-mixins-ui`'s
 * `Icon.view` fills its glyph with it), kept so in a squeezed flex row, and
 * hidden from assistive technology,
 * since the control it sits in carries the name. Every attribute is written as
 * an attribute, so a server render writes the same markup. Ids are prefixed by
 * `key(icon)`; `options.key` sets one drawing's ids apart from another of the
 * same icon, since a gradient defined in a copy that is hidden paints nothing
 * for the copy that shows. Each key's drawing is kept for the icon's life, so
 * take keys from a small fixed set (a place on the page), not one per row.
 */
export const draw = <Node, Attribute>(
  icon: IconData,
  h: SvgBuilder<Node, Attribute>,
  options: { readonly key?: string; readonly size?: string } = {},
): Node => {
  const prefix = key(icon) + (options.key === undefined ? '' : `-${options.key}`)
  const { viewBox, attributes, nodes } = prefixIds(icon, prefix)
  const size = options.size ?? '1em'
  const written = (from: Readonly<Record<string, string>>) =>
    Object.entries(from).map(([name, value]) => h.Attribute(name, value))
  const drawn = ({ tag, attributes, children }: SvgNode): Node =>
    h[tag](written(attributes), children.map(drawn))
  return h.svg(
    [
      h.Attribute('viewBox', viewBox),
      h.Attribute('width', size),
      h.Attribute('height', size),
      // A flex row squeezed narrower than its content shrinks an svg to nothing, width or not.
      h.Attribute('style', 'flex-shrink: 0'),
      h.AriaHidden(true),
      ...written(attributes),
    ],
    nodes.map(drawn),
  )
}
