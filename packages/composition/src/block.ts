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
  /**
   * Checks the decoded props go through beyond their Schema, such as a rich-text
   * body against its Kit. Each finding has a path inside the props.
   */
  // Method syntax: a Block of specific props is still a Block of any props.
  check(props: Props['Type']): ReadonlyArray<PropsFinding>
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
    check: config.check ?? (() => []),
  })
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
