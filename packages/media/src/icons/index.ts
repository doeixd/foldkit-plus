/**
 * SVG to `IconData`, for builds and generator scripts: a Vite plugin reading
 * an icon set, a script writing a package's icon constants. The parse is where
 * an icon is checked, because it is drawn inline: an element or attribute
 * outside the presentational allowlist, a `style`, an event attribute, or a
 * reference outside the icon fails here, naming the icon, rather than being
 * dropped.
 */
import { Schema } from 'effect'
import { TAGS, type IconData, type SvgNode, type SvgTag } from '../icon.js'

const ELEMENTS: ReadonlySet<string> = new Set(TAGS)
const isTag = (tag: string): tag is SvgTag => ELEMENTS.has(tag)

/** Words for a reader, which an icon's label replaces; skipped with what they hold. */
const DROPPED_ELEMENTS = new Set(['title', 'desc', 'metadata'])

const PRESENTATION = [
  'clip-path',
  'clip-rule',
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'mask',
  'opacity',
  'paint-order',
  'shape-rendering',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'transform',
  'vector-effect',
  'visibility',
]

const ATTRIBUTES = new Set([
  ...PRESENTATION,
  'id',
  'd',
  'pathLength',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'width',
  'height',
  'points',
  'href',
  'offset',
  'stop-color',
  'stop-opacity',
  'fx',
  'fy',
  'fr',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
])

/** The root keeps what it paints; its size is its container's, so it gives that up. */
const ROOT_ATTRIBUTES = new Set(PRESENTATION)
const DROPPED_ROOT = new Set(['xmlns', 'xmlns:xlink', 'version', 'width', 'height', 'viewBox'])
const ROOT_ALLOWED = new Set([...ROOT_ATTRIBUTES, ...DROPPED_ROOT])

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
])

const USER_UNITS = /^\d+(\.\d+)?$/

/**
 * The icon in `svg`, one whole SVG document, as `IconData`; `name` says which
 * icon a refusal is about. Throws on anything outside the allowlist.
 */
export const parse = (svg: string, name: string): IconData => {
  const refuse = (reason: string): never => {
    throw new Error(`The icon "${name}" cannot be drawn inline: ${reason}.`)
  }

  const decode = (value: string): string =>
    value.replace(/&([^;\s]*);/g, (whole, entity: string) => {
      if (!entity.startsWith('#')) {
        return ENTITIES.get(entity) ?? refuse(`it holds the unknown entity ${whole}`)
      }
      const [, hex, decimal] = /^#(?:x([0-9a-fA-F]+)|([0-9]+))$/.exec(entity) ?? []
      const point =
        hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal ?? '0', 10)
      return point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : refuse(`it holds ${whole}, which is no character`)
    })

  const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y

  const attributesOf = (tag: string, source: string, allowed: ReadonlySet<string>) => {
    const attributes: Record<string, string> = Object.create(null)
    ATTRIBUTE.lastIndex = 0
    while (ATTRIBUTE.lastIndex < source.trimEnd().length) {
      const from = ATTRIBUTE.lastIndex
      const match = ATTRIBUTE.exec(source)
      if (match === null)
        return refuse(`its <${tag}> is malformed at "${source.slice(from).trim()}"`)
      const written = match[1]!
      const value = decode(match[2] ?? match[3]!)
      const attribute = written === 'xlink:href' ? 'href' : written
      if (Object.hasOwn(attributes, attribute)) refuse(`its <${tag}> sets ${attribute} twice`)
      if (!allowed.has(attribute))
        refuse(`its <${tag}> has the attribute ${attribute}, which is not drawn inline`)
      if (attribute === 'href' && !value.startsWith('#'))
        refuse(`its <${tag}> links outside the icon (${value})`)
      // A presentation attribute is read as CSS, where `URL(` is `url(` and an escape can spell either.
      if (value.includes('\\')) refuse(`its <${tag}>'s ${attribute} holds a CSS escape`)
      for (const [, target] of value.matchAll(/url\(\s*['"]?([^)'"]*)/gi)) {
        if (!target!.trim().startsWith('#'))
          refuse(`its <${tag}>'s ${attribute} refers outside the icon (${value})`)
      }
      attributes[attribute] = value
    }
    return attributes
  }

  interface Open {
    readonly tag: SvgTag
    readonly attributes: Readonly<Record<string, string>>
    readonly children: Array<SvgNode>
  }
  let root:
    | { readonly attributes: Readonly<Record<string, string>>; readonly children: Array<SvgNode> }
    | undefined
  /** The elements open inside the root now, innermost last. */
  const open: Array<Open> = []
  let closed = false
  /** How deep inside a dropped element the parse is; its content is skipped whole. */
  let dropping = 0
  let at = 0

  while (at < svg.length) {
    const start = svg.indexOf('<', at)
    const text = svg.slice(at, start === -1 ? svg.length : start).trim()
    if (text !== '' && dropping === 0) refuse(`it holds the text "${text}"`)
    if (start === -1) break

    const [opener, closer] = svg.startsWith('<!--', start) ? ['<!--', '-->'] : ['<', '>']
    const end = svg.indexOf(closer, start + opener.length)
    if (end === -1) refuse(`a ${opener === '<' ? 'tag' : 'comment'} never closes`)
    at = end + closer.length
    if (opener === '<!--') continue
    const inside = svg.slice(start + 1, end)

    if (inside.startsWith('?') || inside.startsWith('!DOCTYPE')) {
      if (root !== undefined) refuse('it holds a declaration inside its drawing')
      continue
    }
    if (inside.startsWith('!')) refuse('it holds CDATA or a declaration')

    if (inside.startsWith('/')) {
      const tag = inside.slice(1).trim()
      if (dropping > 0) {
        if (DROPPED_ELEMENTS.has(tag)) dropping -= 1
        continue
      }
      if (open.length === 0 && tag === 'svg' && root !== undefined && !closed) {
        closed = true
        continue
      }
      const element = open.pop()
      if (element?.tag !== tag) {
        refuse(`</${tag}> closes ${element === undefined ? 'nothing' : `<${element.tag}>`}`)
      }
      ;(open.at(-1) ?? root!).children.push(element!)
      continue
    }

    const selfClosing = inside.endsWith('/')
    const body = selfClosing ? inside.slice(0, -1) : inside
    const tag = /^[^\s/>]*/.exec(body)![0]
    if (dropping > 0) {
      if (DROPPED_ELEMENTS.has(tag) && !selfClosing) dropping += 1
      continue
    }
    if (closed) refuse('it holds markup after its svg')
    if (root === undefined) {
      if (tag !== 'svg') refuse(`its root is <${tag}>, not <svg>`)
      root = { attributes: attributesOf(tag, body.slice(tag.length), ROOT_ALLOWED), children: [] }
      if (selfClosing) closed = true
      continue
    }
    if (DROPPED_ELEMENTS.has(tag)) {
      if (!selfClosing) dropping += 1
      continue
    }
    if (!isTag(tag)) return refuse(`it holds <${tag}>, which is not drawn inline`)
    const element: Open = {
      tag,
      attributes: attributesOf(tag, body.slice(tag.length), ATTRIBUTES),
      children: [],
    }
    if (selfClosing) (open.at(-1) ?? root).children.push(element)
    else open.push(element)
  }

  if (root === undefined) return refuse('it holds no svg')
  if (!closed) refuse(`<${open.at(-1)?.tag ?? 'svg'}> never closes`)

  const { viewBox, width, height } = root.attributes
  const presentation: Record<string, string> = {}
  for (const [attribute, value] of Object.entries(root.attributes)) {
    if (!DROPPED_ROOT.has(attribute)) presentation[attribute] = value
  }
  return {
    viewBox:
      viewBox ??
      (width !== undefined &&
      height !== undefined &&
      USER_UNITS.test(width) &&
      USER_UNITS.test(height)
        ? `0 0 ${width} ${height}`
        : refuse('it has no viewBox, and no width and height in user units to make one')),
    attributes: presentation,
    nodes: root.children,
  }
}

const Box = {
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  left: Schema.optional(Schema.Number),
  top: Schema.optional(Schema.Number),
}
type IconifyBox = Schema.Struct.Type<typeof Box>

/**
 * An Iconify set, as its JSON file holds it (`@iconify-json/<prefix>/icons.json`).
 * What the drawing does not need (`info`, `categories`, an icon's `hidden`) is
 * read past.
 */
export const IconifySet = Schema.Struct({
  prefix: Schema.String,
  icons: Schema.Record(Schema.String, Schema.Struct({ body: Schema.String, ...Box })),
  aliases: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        parent: Schema.String,
        rotate: Schema.optional(Schema.Number),
        hFlip: Schema.optional(Schema.Boolean),
        vFlip: Schema.optional(Schema.Boolean),
        ...Box,
      }),
    ),
  ),
  ...Box,
})
export type IconifySet = typeof IconifySet.Type

/** Every name the set draws: its icons, then its aliases. */
export const namesOf = (set: IconifySet): ReadonlyArray<string> => [
  ...Object.keys(set.icons),
  ...Object.keys(set.aliases ?? {}),
]

/**
 * The icon `name` of an Iconify set, through its aliases, each of which may
 * give its own box. An alias that rotates or flips its parent is refused
 * rather than drawn as a second, transformed drawing.
 */
export const fromIconify = (set: IconifySet, name: string): IconData => {
  const label = `${set.prefix}:${name}`
  const refuse = (reason: string): never => {
    throw new Error(`The icon "${label}" cannot be drawn inline: ${reason}.`)
  }
  const boxes: Array<IconifyBox> = []
  let current = name
  while (!Object.hasOwn(set.icons, current)) {
    const alias =
      set.aliases !== undefined && Object.hasOwn(set.aliases, current)
        ? set.aliases[current]!
        : undefined
    if (alias === undefined) return refuse(`the set has no icon ${current}`)
    if (alias.rotate !== undefined || alias.hFlip === true || alias.vFlip === true) {
      refuse('it is an alias that rotates or flips its parent')
    }
    if (boxes.length > 16) refuse('its aliases go round in a circle')
    boxes.push(alias)
    current = alias.parent
  }
  const icon = set.icons[current]!
  const nearest = [...boxes, icon, set]
  const read = (key: keyof IconifyBox, otherwise: number) =>
    nearest.find(box => box[key] !== undefined)?.[key] ?? otherwise
  return parse(
    `<svg viewBox="${read('left', 0)} ${read('top', 0)} ${read('width', 16)} ${read('height', 16)}">${icon.body}</svg>`,
    label,
  )
}
