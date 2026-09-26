/**
 * `foldkit-mixins/testing`: queries over a view drawn with the inert builder
 * (`SlotView.inertBuilder()`), for tests that check what a view draws without
 * a DOM. They read an element as the browser would: an attribute or a
 * property, whichever the builder wrote, so a test need not know that `title`
 * and `value` are properties while `aria-label` is an attribute.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'

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

export const Inert = {
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
