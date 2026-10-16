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
  /**
   * An element the nested blocks go inside, where HTML's parser would insert one anyway: a
   * `table`'s rows go in a `tbody`. Without it, markup sent from a server parses to a tree
   * the renderer did not write, and Foldkit refuses to serialize it.
   */
  readonly inner?: string | undefined
  /**
   * Elements drawn inside the block before its content that are not content: a task's
   * checkbox, an image's picture and caption, a callout's icon. They hold no position, are
   * never edited as text, and an HTML import skips them, so a block's text stays its runs'.
   */
  readonly adornments?: ReadonlyArray<Adornment> | undefined
}

/**
 * One element of a block's adornments. `toggles` names a boolean prop of the block that a click
 * on the element flips, through the editor's own Message (a task's `checked`, a toggle's
 * `open`), so the document stays the one place that state lives. `action` names something a
 * click on it asks the application for that is not an edit, a code block's Copy or its language
 * menu: the editor reports it, with the block, and changes nothing.
 */
export interface Adornment {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
  readonly text?: string | undefined
  readonly toggles?: string | undefined
  readonly action?: string | undefined
}

/** The attribute that marks an element as an adornment, which every interpreter skips as content. */
export const ADORNMENT_ATTRIBUTE = 'data-adornment'
/** The attribute naming the prop an adornment's click flips. */
export const TOGGLES_ATTRIBUTE = 'data-toggles'
/** The attribute naming what an adornment's click asks the application for. */
export const ACTION_ATTRIBUTE = 'data-action'

/** An adornment's attributes as every interpreter writes them: its own, then the markers. */
export const adornmentAttributes = (
  adornment: Adornment,
): ReadonlyArray<readonly [string, string]> => [
  ...Object.entries(adornment.attributes).filter(
    ([name]) =>
      name !== ADORNMENT_ATTRIBUTE && name !== TOGGLES_ATTRIBUTE && name !== ACTION_ATTRIBUTE,
  ),
  [ADORNMENT_ATTRIBUTE, ''],
  ...(adornment.toggles === undefined ? [] : [[TOGGLES_ATTRIBUTE, adornment.toggles] as const]),
  ...(adornment.action === undefined ? [] : [[ACTION_ATTRIBUTE, adornment.action] as const]),
]

/** Whether two renderings draw the same element: tag, attributes, holder and adornments. */
export const sameElementRendering = (left: ElementRendering, right: ElementRendering): boolean =>
  left.tag === right.tag &&
  left.inner === right.inner &&
  sameRecord(left.attributes, right.attributes) &&
  (left.adornments ?? []).length === (right.adornments ?? []).length &&
  (left.adornments ?? []).every((adornment, at) => {
    const other = right.adornments![at]!
    return (
      adornment.tag === other.tag &&
      adornment.text === other.text &&
      adornment.toggles === other.toggles &&
      adornment.action === other.action &&
      sameRecord(adornment.attributes, other.attributes)
    )
  })

const sameRecord = (
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean => {
  const names = Object.keys(left)
  return (
    names.length === Object.keys(right).length &&
    names.every(name => Object.hasOwn(right, name) && left[name] === right[name])
  )
}

/**
 * A rendering entry: fixed data, or computed from the value being rendered, which
 * is how a mark's attributes reach its props. `undefined` means the entry does not
 * apply, so the name falls back the way an entry-less name does.
 */
export type RenderingEntry<Value> =
  | ElementRendering
  | ((value: Value) => ElementRendering | undefined)

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
