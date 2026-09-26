import { Equal, Schema } from 'effect'
import {
  markName,
  type Document,
  type MarkValue,
  type Position,
  type PropsSchema,
  type RunMark,
} from './document.js'

export { markName }

/** Which edges a mark continues across when typing at a run boundary. */
export type MarkExpansion = 'before' | 'after' | 'both' | 'none'

const decodeJsonProps = Schema.decodeUnknownSync(Schema.JsonObject)

/**
 * A mark definition: its name, where it continues across a boundary, and the
 * schema its props must satisfy when it has any. A Kit declares the vocabulary
 * an editor accepts, so an application can say that its own mark behaves like a
 * link (nothing expands, an `href` prop) or like bold (it continues).
 */
export interface MarkDef<Props extends PropsSchema | undefined = PropsSchema | undefined> {
  readonly name: string
  readonly expand: MarkExpansion
  /** Validates a mark value's props at the Kit boundary, not in the codec. */
  readonly Props: Props
  /** Encodes decoded props into the JSON value stored on a text run. */
  readonly of: Props extends Schema.Codec<infer A, any, any>
    ? (props: A) => MarkValue
    : () => MarkValue
}

/**
 * Declares a mark. Expansion defaults to `both`: the conservative choice for a
 * name no policy knows. A definition with `Props` gets an `of` that builds the
 * value; a definition without props builds a value that carries only its name.
 */
export const mark = <Props extends PropsSchema | undefined = undefined>(
  name: string,
  options: { readonly Props?: Props; readonly expand?: MarkExpansion } = {},
): MarkDef<Props> => {
  if (name.length === 0) throw new Error('RichText.mark: a mark needs a name')
  const encodeProps =
    options.Props === undefined
      ? undefined
      : Schema.encodeUnknownSync(options.Props, { onExcessProperty: 'error' })
  return {
    name,
    expand: options.expand ?? 'both',
    Props: options.Props as Props,
    of: ((props?: unknown): MarkValue => {
      if (encodeProps === undefined) return { name }
      // The stored value is the schema's *encoded* form: a transforming codec
      // (`NumberFromString`) must persist `'42'`, which is what Kit validation
      // decodes. Decoding the result against JSON keeps the boundary honest.
      return { name, props: decodeJsonProps(encodeProps(props)) }
    }) as MarkDef<Props>['of'],
  }
}

export const Bold: MarkDef = mark('Bold', { expand: 'after' })
export const Italic: MarkDef = mark('Italic', { expand: 'after' })
export const Code: MarkDef = mark('Code', { expand: 'none' })

/** The marks this vocabulary defines, and the policy a document without a Kit gets. */
export const shippedMarks: ReadonlyArray<MarkDef> = [Bold, Italic, Code]

/**
 * Whether props fail to decode against a node's or a mark's declared schema. The
 * diagnostic is deliberately stable: a schema's own message can name internals
 * an API boundary should not leak, so only the verdict travels.
 */
export const propsFailure = (props: PropsSchema | undefined, value: unknown): boolean => {
  if (props === undefined) return false
  try {
    // Strict, like the persisted-content boundary: a field the schema does not
    // declare is a failure, not something silently kept beside the props.
    Schema.decodeUnknownSync(props, { onExcessProperty: 'error' })(value)
    return false
  } catch {
    return true
  }
}

/**
 * The expansion policy of a set of definitions, and which names it declares. A
 * mark the registry does not declare expands both ways: preservation never
 * retargets it away. Declared names are what an edit may add.
 */
export interface MarkRegistry {
  readonly expansionOf: (name: string) => MarkExpansion
  readonly declares: (name: string) => boolean
  /** Whether an edit may add this mark: its name is declared and its props decode. */
  readonly accepts: (mark: RunMark) => boolean
}

export const markRegistry = (definitions: ReadonlyArray<MarkDef>): MarkRegistry => {
  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return {
    expansionOf: name => byName.get(name)?.expand ?? 'both',
    declares: name => byName.has(name),
    accepts: mark => {
      const definition = byName.get(markName(mark))
      return definition !== undefined && !propsFailure(definition.Props, markProps(mark))
    },
  }
}

/** The policy of the shipped vocabulary. */
export const shippedRegistry: MarkRegistry = markRegistry(shippedMarks)

/** A mark's props, or undefined when it carries none. */
export const markProps = (mark: RunMark): MarkValue['props'] | undefined =>
  typeof mark === 'string' ? undefined : mark.props

/**
 * Whether two marks are the same mark with the same props. This is the
 * equivalence normalization merges on, so props compare structurally and key
 * order does not matter.
 */
export const sameMark = (left: RunMark, right: RunMark): boolean =>
  markName(left) === markName(right) && Equal.equals(markProps(left), markProps(right))

/** Order-insensitive mark-set equality; a run carries a name at most once. */
export const sameMarkSet = (left: ReadonlyArray<RunMark>, right: ReadonlyArray<RunMark>): boolean =>
  left.length === right.length && left.every(mark => right.some(other => sameMark(mark, other)))

/**
 * Retargets a boundary insertion to the neighboring run when the current run
 * carries marks that forbid the edge and the neighbor carries exactly the
 * marks that remain. Interior positions, missing neighbors, and mismatched
 * neighbors return the input reference unchanged; unknown node ids are left
 * for `apply` to diagnose. Never invents runs: mixed-mark edges stay put.
 */
export const resolveInsertion = (
  document: Document,
  position: Position,
  registry: MarkRegistry = shippedRegistry,
): Position => {
  for (const block of document.children) {
    const index = block.children.findIndex(run => run.id === position.node)
    const run = block.children[index]
    if (run === undefined) continue
    const leavingLeft = position.affinity === 'before' && position.offset === 0
    const leavingRight = position.affinity === 'after' && position.offset === run.text.length
    if (!leavingLeft && !leavingRight) return position
    const neighbor = leavingLeft ? block.children[index - 1] : block.children[index + 1]
    if (neighbor === undefined) return position
    const direction = leavingLeft ? 'before' : 'after'
    const desired = run.marks.filter(mark => {
      const expand = registry.expansionOf(markName(mark))
      return expand === 'both' || expand === direction
    })
    if (!sameMarkSet(desired, neighbor.marks)) return position
    return {
      node: neighbor.id,
      offset: leavingLeft ? neighbor.text.length : 0,
      affinity: position.affinity,
    }
  }
  return position
}
