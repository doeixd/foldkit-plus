/**
 * `foldkit-mixins/testing`: queries over a view drawn with the inert builder
 * (`SlotView.inertBuilder()`), for tests that check what a view draws without
 * a DOM. They read an element as the browser would: an attribute or a
 * property, whichever the builder wrote, so a test need not know that `title`
 * and `value` are properties while `aria-label` is an attribute.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { given, scene, tap } from 'foldkit/scene'
import { usedIn } from './inject.js'
import { SLOT_MARK, drawMarked } from './slotMark.js'
import type * as SlotView from './slotView.js'

/** An element or text node of an inert tree. */
export type Node = Exclude<Html, null>

/** Every node under `root`, itself first, depth first. */
const all = (root: Html | undefined): ReadonlyArray<Node> =>
  root === null || root === undefined
    ? []
    : [
        root,
        ...(root.children ?? []).flatMap(child => (typeof child === 'string' ? [] : all(child))),
      ]

/** A node's children that are nodes, not plain strings. */
const children = (node: Html | undefined): ReadonlyArray<Node> =>
  (node?.children ?? []).filter((child): child is Node => typeof child !== 'string')

/** Every element under `root` with this tag. */
const byTag = (root: Html | undefined, tag: string): ReadonlyArray<Node> =>
  all(root).filter(node => node.sel === tag)

/** The text under a node, joined. */
const text = (node: Html | undefined): string =>
  all(node)
    .map(each => each.text ?? '')
    .join('')

/** Attributes whose property has another name. */
const propertyNames: Readonly<Record<string, string>> = { for: 'htmlFor', class: 'className' }

/** An attribute or a property, whichever the builder wrote; the attribute first. */
const value = (node: Html | undefined, key: string): unknown =>
  node?.data?.attrs?.[key] ??
  node?.data?.props?.[key] ??
  node?.data?.props?.[propertyNames[key] ?? key]

/** The classes on a node, in the order the builder wrote them. */
const classes = (node: Html | undefined): ReadonlyArray<string> =>
  Object.entries(node?.data?.class ?? {})
    .filter(([, on]) => on === true)
    .map(([name]) => name)

/** The inline style on a node, empty when it has none. */
const style = (node: Html | undefined): Readonly<Record<string, string>> => node?.data?.style ?? {}

/** Every element under `root` with this role. */
const byRole = (root: Html | undefined, role: string): ReadonlyArray<Node> =>
  all(root).filter(node => value(node, 'role') === role)

/**
 * Every element under `root` named `label`: by its `aria-label`, by the text of
 * a `<label for>` pointing at its id, or by its own text. By text, only the
 * innermost element counts, not every ancestor whose text is the same.
 */
const byLabel = (root: Html | undefined, label: string): ReadonlyArray<Node> => {
  const nodes = all(root).filter(node => node.sel !== undefined)
  const labelled = new Set(
    nodes
      .filter(node => node.sel === 'label' && text(node) === label)
      .map(node => value(node, 'for')),
  )
  const byText = new Set(
    nodes.filter(
      node =>
        value(node, 'aria-label') === undefined && node.sel !== 'label' && text(node) === label,
    ),
  )
  const innermost = new Set(
    [...byText].filter(node => !all(node).some(inner => inner !== node && byText.has(inner))),
  )
  return nodes.filter(
    node =>
      value(node, 'aria-label') === label ||
      (value(node, 'id') !== undefined && labelled.has(value(node, 'id'))) ||
      innermost.has(node),
  )
}

/** Whether a toggle button is pressed; none when it is not a toggle. */
const pressed = (node: Html | undefined): Option.Option<boolean> =>
  Option.map(
    Option.fromUndefinedOr(value(node, 'aria-pressed')),
    state => state === 'true' || state === true,
  )

/** Ends the Scene `draw` borrows once the view has drawn, before its end-of-test checks. */
const DRAWN = Symbol('drawn')

/**
 * A SlotView drawn inert, each element a Slot draws marked with the Slot's
 * name, however deeply nested its view, for `bySlot` and `unslotted`. Only
 * here: a view drawn for real carries no mark.
 *
 * It draws under a Foldkit Scene's render frame, which `h.submodel` and a
 * Submodel's `childAttributes` need; nothing is dispatched, and no Command or
 * Mount the drawing declares is run or checked.
 */
const draw = <Slots, Input, Message>(
  view: SlotView.SlotView<Slots, Input, Message>,
  input: Input,
): Html => {
  let drawn: Html = null
  const drawInto = (model: Input, h: HtmlBuilder<Message>): Html => {
    drawn = view(model, h)
    // Scene refuses a view that draws nothing; what it draws is not the result.
    return h.div([], [])
  }
  try {
    drawMarked(() =>
      scene(
        { update: (model: Input) => ({ model }), view: drawInto },
        given(input),
        tap(() => {
          throw DRAWN
        }),
      ),
    )
  } catch (error) {
    if (error !== DRAWN) throw error
  }
  return drawn
}

/** The Slot a node was drawn by, in a tree from `draw`; none for one no Slot drew. */
const slotOf = (node: Html | undefined): Option.Option<string> => {
  const name = value(node, `data-${SLOT_MARK}`)
  return typeof name === 'string' ? Option.some(name) : Option.none()
}

/** Every element a Slot drew, in a tree from `draw`. */
const bySlot = (root: Html | undefined, slot: string): ReadonlyArray<Node> =>
  all(root).filter(node => Option.contains(slotOf(node), slot))

/** Where each element sits: its tags from the root, `main > nav > a`. */
const pathsOf = (root: Html | undefined): ReadonlyMap<Node, string> => {
  const paths = new Map<Node, string>()
  const walk = (node: Html | undefined, above: string): void => {
    if (node === null || node === undefined || node.sel === undefined) return
    const here = above === '' ? node.sel : `${above} > ${node.sel}`
    paths.set(node, here)
    for (const child of children(node)) walk(child, here)
  }
  walk(root, '')
  return paths
}

/** The elements of the package's own markup: every element, except inside a Slot named in `inside`. */
const own = (root: Html | undefined, inside: ReadonlyArray<string>): ReadonlyArray<Node> => {
  const skipped = new Set(inside)
  const found: Array<Node> = []
  const walk = (node: Html | undefined): void => {
    if (node === null || node === undefined || node.sel === undefined) return
    found.push(node)
    if (Option.exists(slotOf(node), name => skipped.has(name))) return
    for (const child of children(node)) walk(child)
  }
  walk(root)
  return found
}

/**
 * Every element in a tree from `draw` that no Slot drew, by its path: markup a
 * stylist could reach only through a selector into the package. What a Slot
 * named in `inside` holds is not the package's, such as a canvas drawing the
 * application's own page, and is skipped.
 */
const unslotted = (
  root: Html | undefined,
  options: { readonly inside?: ReadonlyArray<string> } = {},
): ReadonlyArray<string> => {
  const paths = pathsOf(root)
  return own(root, options.inside ?? [])
    .filter(node => Option.isNone(slotOf(node)))
    .map(node => paths.get(node) ?? node.sel ?? '')
}

/**
 * Every inline declaration that is not a custom property, by its element's
 * path, skipping what a Slot named in `inside` holds: a fixed value inline
 * outranks every rule, so a later layer could not override it. A value known
 * only per element belongs in a custom property that a rule reads.
 */
const fixedInline = (
  root: Html | undefined,
  options: { readonly inside?: ReadonlyArray<string> } = {},
): ReadonlyArray<string> => {
  const paths = pathsOf(root)
  return own(root, options.inside ?? []).flatMap(node =>
    Object.keys(style(node))
      .filter(property => !property.startsWith('--'))
      .map(property => `${paths.get(node) ?? node.sel ?? ''}: ${property}`),
  )
}

/** The compiled CSS behind the classes on `nodes`, after the standard layer order. */
const css = (nodes: ReadonlyArray<Html>): string => usedIn(nodes.flatMap(classes).join(' '))

const TOKEN_READ = /var\((--fk-[\w-]+)\)/g

/**
 * The `--fk-*` tokens the tree's Styles read with no fallback and that
 * nothing defines, in first-read order: not `stylesheet`, not a drawn rule,
 * not an inline style. Such a read makes its declaration invalid, so a test
 * asserts `toEqual([])`. A tree whose Styles read no token passes too; check
 * `css` for `var(--fk-` when that would be a mistake.
 */
const missingTokens = (root: Html, stylesheet: string): ReadonlyArray<string> => {
  const nodes = all(root)
  const drawn = css(nodes)
  const inline = nodes.flatMap(node => Object.entries(style(node)))
  const read = new Set([
    ...Array.from(drawn.matchAll(TOKEN_READ), ([, name]) => name ?? ''),
    ...inline.flatMap(([, value]) =>
      Array.from(value.matchAll(TOKEN_READ), ([, name]) => name ?? ''),
    ),
  ])
  const defined = new Set(inline.map(([property]) => property))
  return [...read].filter(
    name =>
      name !== '' &&
      !stylesheet.includes(`${name}:`) &&
      !drawn.includes(`${name}:`) &&
      !defined.has(name),
  )
}

export const Inert = {
  draw,
  css,
  missingTokens,
  bySlot,
  unslotted,
  fixedInline,
  all,
  children,
  byTag,
  text,
  value,
  classes,
  style,
  byRole,
  byLabel,
  pressed,
} as const
