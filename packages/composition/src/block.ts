/**
 * Blocks: what may exist on a page.
 *
 * A Block is a stable name, a props Schema, its Regions, and the Content it
 * provides. It holds no view: a Renderer draws it, and a Document stores only
 * its name, its encoded props and its children. The name is the persisted
 * identity, so renaming a Block is a content migration, not a refactor.
 */
import { Pipeable, type Result, Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import type { Content } from './content.js'
import type { Region } from './region.js'

export interface Block<
  Name extends string = string,
  Props extends Schema.Top = Schema.Top,
  Regions extends Readonly<Record<string, Region>> = Readonly<Record<string, Region>>,
>
  extends Pipeable.Pipeable {
  readonly _tag: 'Block'
  readonly name: Name
  /** The props, as an Effect Schema. A Document stores them encoded, as JSON. */
  readonly Props: Props
  readonly regions: Regions
  /** The Content this Block is, which decides the Regions and roots that accept it. */
  readonly provides: ReadonlyArray<Content>
  /** What interpreters attached: a palette category, an agent description. */
  readonly metadata: Metadata
  /** The appearance choices a node may store, by axis: none unless a look is attached. */
  readonly appearance: AppearanceAxes
  /**
   * Whether each node of this Block has state of its own, a Bundle the page's
   * parent places once per node (`Composition.statefulNodes`). Most Blocks are
   * pure rendering and are not.
   */
  readonly stateful: boolean
  /**
   * Checks the decoded props go through beyond their Schema, such as a rich-text
   * body against its Kit. Each finding has a path inside the props.
   */
  // Method syntax: a Block of specific props is still a Block of any props.
  check(props: Props['Type']): ReadonlyArray<PropsFinding>
}

/**
 * One appearance choice a node may store: the names it takes. A `variant` is
 * one of a recipe's values; a `token` is the name of a theme token, and a name
 * the theme lacks is its own finding, `composition:unknown-token`.
 */
export interface AppearanceAxis {
  readonly values: ReadonlyArray<string>
  readonly kind: 'variant' | 'token'
  /**
   * The breakpoints a choice may change at, by name: a node may then store
   * `{ base: 's', md: 'lg' }` for this axis as well as one name.
   */
  readonly breakpoints?: ReadonlyArray<string>
}

/** A stored choice: one name, or for a responsive axis a name per breakpoint and `base`. */
export type AppearanceChoice = string | Readonly<Record<string, string>>

export type AppearanceAxes = Readonly<Record<string, AppearanceAxis>>

/** Something wrong with a node's stored appearance, at a path inside the node. */
export interface AppearanceFinding {
  readonly code: 'composition:invalid-appearance' | 'composition:unknown-token'
  readonly path: ReadonlyArray<string>
  readonly message: string
}

/** Something a Block's own check found in its props, at a path inside them. */
export interface PropsFinding {
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

export type AnyBlock = Block<string, Schema.Top, Readonly<Record<string, Region>>>

/** The decoded props of a Block. */
export type PropsOf<B> = B extends Block<any, infer Props, any> ? Props['Type'] : never

const make = <
  Name extends string,
  Props extends Schema.Top,
  Regions extends Readonly<Record<string, Region>>,
>(
  fields: Omit<Block<Name, Props, Regions>, 'pipe'>,
): Block<Name, Props, Regions> =>
  Object.freeze({
    ...fields,
    pipe() {
      return Pipeable.pipeArguments(this, arguments)
    },
  })

const define = <
  const Name extends string,
  Props extends Schema.Top,
  const Regions extends Readonly<Record<string, Region>> = {},
>(
  name: Name,
  config: {
    readonly Props: Props
    readonly regions?: Regions
    readonly provides: ReadonlyArray<Content>
    /** Checks beyond the Schema, run on decoded props: a nested document against its vocabulary. */
    readonly check?: (props: Props['Type']) => ReadonlyArray<PropsFinding>
    /** The appearance choices a node may store. Usually attached by a look instead. */
    readonly appearance?: AppearanceAxes
    /** Each node has state of its own: a carousel, an accordion, a configurator. */
    readonly stateful?: boolean
  },
): Block<Name, Props, Regions> => {
  if (name.length === 0) throw new Error('Block.define: a Block needs a name')
  if (config.provides.length === 0)
    throw new Error(
      `Block "${name}": \`provides\` names no Content, so no Region or root could hold it`,
    )
  const regions = config.regions ?? ({} as Regions)
  for (const region of Object.keys(regions))
    if (region.length === 0) throw new Error(`Block "${name}": a Region needs a name`)
  return make({
    _tag: 'Block',
    name,
    Props: config.Props,
    regions: Object.freeze({ ...regions }),
    provides: Object.freeze([...config.provides]),
    metadata: Metadata.empty,
    appearance: Object.freeze({ ...config.appearance }),
    stateful: config.stateful ?? false,
    check: config.check ?? (() => []),
  })
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What is wrong with a node's stored appearance, against the Block's axes. */
/** Why one stored name is not a choice of an axis, or nothing when it is. */
const checkName = (
  name: string,
  axis: AppearanceAxis,
  value: unknown,
  path: ReadonlyArray<string>,
): ReadonlyArray<AppearanceFinding> => {
  if (typeof value === 'string' && axis.values.includes(value)) return []
  const shown = typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
  return [
    axis.kind === 'token' && typeof value === 'string'
      ? {
          code: 'composition:unknown-token',
          path,
          message: `${shown} is not a token the theme has for ${name}`,
        }
      : {
          code: 'composition:invalid-appearance',
          path,
          message: `${shown} is not one of ${name}'s: ${axis.values.join(', ')}`,
        },
  ]
}

/** What is wrong with a node's stored appearance, against the Block's axes. */
const checkAppearance = (
  block: AnyBlock,
  appearance: unknown,
): ReadonlyArray<AppearanceFinding> => {
  if (appearance === undefined) return []
  if (!isRecord(appearance))
    return [
      {
        code: 'composition:invalid-appearance',
        path: ['appearance'],
        message: 'is not a record of choices by axis',
      },
    ]
  return Object.entries(appearance).flatMap(([name, choice]): ReadonlyArray<AppearanceFinding> => {
    const axis = block.appearance[name]
    const path = ['appearance', name]
    if (axis === undefined)
      return [
        {
          code: 'composition:invalid-appearance',
          path,
          message: `a ${block.name} has no appearance "${name}"`,
        },
      ]
    if (!isRecord(choice) || axis.breakpoints === undefined)
      return checkName(name, axis, choice, path)
    // A responsive choice: a name for `base` and for each breakpoint it changes at.
    const allowed = ['base', ...axis.breakpoints]
    const entries = Object.entries(choice)
    if (entries.length === 0)
      return [{ code: 'composition:invalid-appearance', path, message: 'chooses nothing' }]
    return entries.flatMap(([at, value]) =>
      allowed.includes(at)
        ? checkName(name, axis, value, [...path, at])
        : [
            {
              code: 'composition:invalid-appearance' as const,
              path: [...path, at],
              message: `"${at}" is not one of ${name}'s breakpoints: ${allowed.join(', ')}`,
            },
          ],
    )
  })
}

/**
 * The stored choices a Block offers, for its view: an axis it has, a name on
 * that axis's list, and for a responsive axis each breakpoint's name that is.
 * Anything else is left out, not drawn.
 */
const offeredAppearance = (
  block: AnyBlock,
  appearance: unknown,
): Readonly<Record<string, AppearanceChoice>> => {
  if (!isRecord(appearance)) return {}
  const offered: Record<string, AppearanceChoice> = {}
  for (const [name, choice] of Object.entries(appearance)) {
    const axis = block.appearance[name]
    if (axis === undefined) continue
    if (typeof choice === 'string') {
      if (axis.values.includes(choice)) offered[name] = choice
      continue
    }
    if (!isRecord(choice) || axis.breakpoints === undefined) continue
    const allowed = ['base', ...axis.breakpoints]
    const kept = Object.fromEntries(
      Object.entries(choice).filter(
        (entry): entry is [string, string] =>
          allowed.includes(entry[0]) &&
          typeof entry[1] === 'string' &&
          axis.values.includes(entry[1]),
      ),
    )
    if (Object.keys(kept).length > 0) offered[name] = kept
  }
  return offered
}

// Props are decoded strictly: a key the Block's schema does not name is an
// error, so a prop left behind by an old version is found, not silently kept.
const strict = { onExcessProperty: 'error' } as const

export const Block = {
  define,

  /** Pipe step: attaches an interpreter's metadata, beside what the Block already has. */
  annotate:
    (metadata: Metadata) =>
    <B extends AnyBlock>(block: B): B =>
      make({ ...block, metadata: Metadata.combine([block.metadata, metadata]) }) as B,

  /**
   * Pipe step: the appearance choices a node of this Block may store, in place
   * of any it had. A look from `foldkit-composition/appearance` attaches them.
   */
  withAppearance:
    (axes: AppearanceAxes) =>
    <B extends AnyBlock>(block: B): B =>
      make({ ...block, appearance: Object.freeze({ ...axes }) }) as B,

  /** What is wrong with a node's stored appearance: an axis it lacks, a value off the list. */
  checkAppearance,
  /** The stored choices the Block offers, as a view receives them; the rest left out. */
  offeredAppearance,

  /** Decodes stored props against the Block's schema. An excess key fails. */
  decode: <B extends AnyBlock>(
    block: B,
    props: unknown,
  ): Result.Result<PropsOf<B>, Schema.SchemaError> =>
    Schema.decodeUnknownResult(block.Props as Schema.Codec<PropsOf<B>, unknown>, strict)(props),

  /** Encodes props for storage. */
  encode: <B extends AnyBlock>(
    block: B,
    props: PropsOf<B>,
  ): Result.Result<unknown, Schema.SchemaError> =>
    Schema.encodeUnknownResult(block.Props as Schema.Codec<PropsOf<B>, unknown>)(props),
}
