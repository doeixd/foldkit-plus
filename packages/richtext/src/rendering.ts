import type { NodeBlock, RunMark, Text } from './document.js'
import { markName } from './marks.js'

/**
 * How an element is rendered: a tag and its attributes. Data, not a view (§121),
 * so the DOM-free serializer writes it and the DOM interpreters build it without
 * the core learning about Foldkit or the DOM.
 */
export interface ElementRendering {
  readonly tag: string
  /** Values are escaped when written; a name that would end the markup is refused. */
  readonly attributes: Readonly<Record<string, string>>
}

/**
 * A rendering entry: fixed data, or computed from the value being rendered, which
 * is how a mark's attributes reach its props. `undefined` means the entry does not
 * apply, so the name falls back the way an entry-less name does.
 */
export type RenderingEntry<Value> =
  ElementRendering | ((value: Value) => ElementRendering | undefined)

/**
 * A vocabulary of renderings built *over* a Kit, never inside it (§34, §121). A
 * name with no entry renders the shipped way: its mark nests in `strong`, `em`, or
 * `code`, an application node keeps its default element, and any other name rides
 * on `data-marks` — which is what keeps the slice format and an HTML round trip
 * lossless rather than lossy.
 */
export interface Rendering {
  readonly marks: Readonly<Record<string, RenderingEntry<RunMark>>>
  readonly nodes: Readonly<Record<string, RenderingEntry<NodeBlock>>>
}

/** The nesting the shipped marks get, innermost first. */
const BUILT_IN_MARK_TAGS: ReadonlyArray<readonly [string, string]> = [
  ['Bold', 'strong'],
  ['Italic', 'em'],
  ['Code', 'code'],
]

/**
 * Own-property lookup: a mark or node name is document content, so a plain or
 * hand-built `Rendering` must not let `__proto__` resolve to a prototype.
 */
const entryFor = <Value>(
  entries: Readonly<Record<string, RenderingEntry<Value>>>,
  name: string,
): RenderingEntry<Value> | undefined => (Object.hasOwn(entries, name) ? entries[name] : undefined)

const resolve = <Value>(
  entry: RenderingEntry<Value>,
  value: Value,
): ElementRendering | undefined => (typeof entry === 'function' ? entry(value) : entry)

/** A name's own entry map, with no prototype for a content-chosen name to reach. */
const entryMap = <Value>(
  entries: Readonly<Record<string, RenderingEntry<Value>>> | undefined,
): Readonly<Record<string, RenderingEntry<Value>>> => {
  const map: Record<string, RenderingEntry<Value>> = Object.create(null)
  for (const [name, entry] of Object.entries(entries ?? {})) map[name] = entry
  return Object.freeze(map)
}

export const rendering = (
  definition: {
    readonly marks?: Readonly<Record<string, RenderingEntry<RunMark>>>
    readonly nodes?: Readonly<Record<string, RenderingEntry<NodeBlock>>>
  } = {},
): Rendering =>
  Object.freeze({ marks: entryMap(definition.marks), nodes: entryMap(definition.nodes) })

/** The behaviour without a renderer: shipped tags for shipped marks, names otherwise. */
export const noRendering: Rendering = rendering()

/**
 * A registry built over another: an entry named here wins, and every name the base
 * renders keeps its entry, so an application extends a vocabulary like the standard one
 * without restating it.
 */
export const renderingOver = (
  base: Rendering,
  definition: {
    readonly marks?: Readonly<Record<string, RenderingEntry<RunMark>>>
    readonly nodes?: Readonly<Record<string, RenderingEntry<NodeBlock>>>
  } = {},
): Rendering =>
  rendering({
    marks: { ...base.marks, ...definition.marks },
    nodes: { ...base.nodes, ...definition.nodes },
  })

/** What a run's marks nest in, and which names nest nowhere. */
export interface RunRendering {
  /** Elements to wrap the run's text in, innermost first. */
  readonly nest: ReadonlyArray<ElementRendering>
  /** Names with neither an entry nor a shipped tag, sorted so output is stable. */
  readonly unrendered: ReadonlyArray<string>
}

const byName = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/**
 * Resolves a run's marks to elements. Order is the vocabulary's, then names
 * alphabetically, never the order marks happen to be stored in — the same set of
 * marks must serialize the same way however it was assembled. An entry for a
 * shipped name replaces that name's tag but keeps its place in the nesting.
 */
export const runRendering = (definition: Rendering, run: Text): RunRendering => {
  const nest: Array<ElementRendering> = []
  const unrendered: Array<string> = []
  for (const [name, tag] of BUILT_IN_MARK_TAGS) {
    const mark = run.marks.find(candidate => markName(candidate) === name)
    if (mark === undefined) continue
    const entry = entryFor(definition.marks, name)
    nest.push(
      entry === undefined
        ? { tag, attributes: {} }
        : (resolve(entry, mark) ?? { tag, attributes: {} }),
    )
  }
  const others = run.marks
    .filter(mark => !BUILT_IN_MARK_TAGS.some(([name]) => name === markName(mark)))
    .sort((left, right) => byName(markName(left), markName(right)))
  for (const mark of others) {
    const name = markName(mark)
    const entry = entryFor(definition.marks, name)
    const element = entry === undefined ? undefined : resolve(entry, mark)
    if (element === undefined) unrendered.push(name)
    else nest.push(element)
  }
  return { nest, unrendered }
}

/** The element a node kind renders as, or undefined when no entry applies. */
export const nodeRendering = (
  definition: Rendering,
  block: NodeBlock,
): ElementRendering | undefined => {
  const entry = entryFor(definition.nodes, block.kind)
  return entry === undefined ? undefined : resolve(entry, block)
}
