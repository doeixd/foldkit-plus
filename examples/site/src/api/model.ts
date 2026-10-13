/**
 * The API reference's data: per package, its entry points and what each
 * exports, read at build time by `extract.ts` from each package's source.
 */
import { Schema } from 'effect'

const Tag = Schema.Struct({ name: Schema.String, text: Schema.String })

const Param = Schema.Struct({ name: Schema.String, summary: Schema.String })

const Source = Schema.Struct({
  /** Repository-relative, with forward slashes. */
  file: Schema.String,
  /** 1-based. */
  line: Schema.Number,
})

export const ApiMember = Schema.Struct({
  name: Schema.String,
  /**
   * `function`/`const` for a namespace object's members, `property`/`method`
   * for a class's or interface's; a module namespace (`export * as X`) also
   * holds types, which keep their declaration kind.
   */
  kind: Schema.Literals([
    'function',
    'const',
    'property',
    'method',
    'class',
    'interface',
    'type',
    'enum',
  ]),
  summary: Schema.String,
  signature: Schema.String,
  tags: Schema.Array(Tag),
  params: Schema.Array(Param),
  source: Source,
})
export type ApiMember = typeof ApiMember.Type

const Field = Schema.Struct({ name: Schema.String, type: Schema.String })

/** One variant of a Message union: its tag, or the whole type when it has none. */
const Variant = Schema.Struct({ name: Schema.String, fields: Schema.Array(Field) })

/** What placing a Bundle involves, read from its `update`. */
export const ApiBundle = Schema.Struct({
  /** Empty when the Bundle takes none. */
  args: Schema.Array(Field),
  model: Schema.Array(Field),
  messages: Schema.Array(Variant),
  /** What it hands its parent; empty when it hands nothing. */
  out: Schema.Array(Variant),
})
export type ApiBundle = typeof ApiBundle.Type

export const ApiExport = Schema.Struct({
  name: Schema.String,
  /** Unique within the module. */
  slug: Schema.String,
  kind: Schema.Literals(['function', 'const', 'namespace', 'class', 'interface', 'type', 'enum']),
  /** Markdown. */
  summary: Schema.String,
  signature: Schema.String,
  /** The type's declaration when a type shares this value's name. */
  typeSignature: Schema.OptionFromNullOr(Schema.String),
  /** Its parts, when it is a Bundle. */
  bundle: Schema.OptionFromNullOr(ApiBundle),
  tags: Schema.Array(Tag),
  params: Schema.Array(Param),
  members: Schema.Array(ApiMember),
  source: Source,
})
export type ApiExport = typeof ApiExport.Type

export const ApiModule = Schema.Struct({
  /** `foldkit-remote`, `foldkit-remote/port`. */
  specifier: Schema.String,
  /** `index` for the package's root, else the subpath with `/` as `-`. */
  slug: Schema.String,
  /** The entry file, from the repository root, with forward slashes. */
  file: Schema.String,
  /** The entry file's own doc comment, as Markdown. */
  summary: Schema.String,
  /** Sorted by name, ignoring case. */
  exports: Schema.Array(ApiExport),
})
export type ApiModule = typeof ApiModule.Type

export const ApiPackage = Schema.Struct({
  name: Schema.String,
  /** The directory under `packages/`. */
  dir: Schema.String,
  version: Schema.String,
  modules: Schema.Array(ApiModule),
})
export type ApiPackage = typeof ApiPackage.Type
