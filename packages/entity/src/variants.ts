/**
 * Variants of an Entity (#357): rows that are one of several shapes, told
 * apart by `_tag`. The row is Effect's tagged union of the cases; the stored
 * row is one record holding every field of every case, null where the row is
 * of another case. Every interpreter that does not read variants sees that
 * stored row, an Entity with a `_tag` field and nullable fields, and keeps
 * working; the ones that do read the union through its own `match`.
 */
import { Option, Schema, SchemaAST, SchemaTransformation } from 'effect'
import { put } from './record.js'

/** What `Entity.defineVariants` takes: each case's fields, by its tag. */
export type VariantCases = Readonly<Record<string, Schema.Struct.Fields>>

/** The cases as Effect's tagged union, with its own `match`, `guards`, `cases` and `isAnyOf`. */
export type VariantUnion<Cases extends VariantCases> = Schema.TaggedUnion<{
  readonly [T in keyof Cases & string]: Schema.TaggedStruct<T, Cases[T]>
}>

/**
 * Any Entity's variants, as generic code holds them: a union keyed by `_tag`
 * with its cases' fields. Its `match` is typed only on a union of known cases.
 */
export type AnyVariantUnion = Schema.Top & {
  readonly tag: '_tag'
  readonly cases: Readonly<Record<string, { readonly fields: Schema.Struct.Fields }>>
}

/** The keys every case has: `keyof` a union of records is the keys they share. */
type SharedKeys<Cases extends VariantCases> = keyof Cases[keyof Cases] & string

type AllKeys<Cases extends VariantCases> = Cases[keyof Cases] extends infer Fields
  ? Fields extends unknown
    ? keyof Fields & string
    : never
  : never

/** The schema the cases holding `K` declare for it: one schema, or a union of those that differ. */
type SchemaAt<Cases extends VariantCases, K> = {
  [T in keyof Cases]: K extends keyof Cases[T] ? Cases[T][K] : never
}[keyof Cases]

/** A case's own field as the stored row holds it: null on a row of another case. */
type Absent<S> = S extends Schema.Top ? (null extends S['Encoded'] ? S : Schema.NullOr<S>) : never

/**
 * The stored row's fields: `_tag`, every shared field as declared, and every
 * field only some cases have as nullable, since the row of another case holds
 * null there.
 */
export type StoredFields<Cases extends VariantCases> = {
  readonly [K in AllKeys<Cases> | '_tag']: K extends '_tag'
    ? Schema.Literals<ReadonlyArray<keyof Cases & string>>
    : K extends SharedKeys<Cases>
      ? SchemaAt<Cases, K>
      : Absent<SchemaAt<Cases, K>>
}

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never

/**
 * Unsatisfiable, naming the mistake, for cases that cannot be one stored row:
 * fewer than two, a case declaring `_tag` itself, or one key declared with two
 * different schemas (one column cannot hold both).
 */
export type CheckCases<Cases extends VariantCases> =
  true extends IsUnion<keyof Cases>
    ? '_tag' extends AllKeys<Cases>
      ? { readonly '~invalid': 'foldkit-entity: a case cannot declare _tag; it is the case name' }
      : {
            [K in AllKeys<Cases>]: true extends IsUnion<SchemaAt<Cases, K>> ? K : never
          }[AllKeys<Cases>] extends infer Clash
        ? [Clash] extends [never]
          ? unknown
          : {
              readonly '~invalid': `foldkit-entity: "${Clash & string}" is declared with different schemas; declare it once and spread it into each case`
            }
        : never
    : {
        readonly '~invalid': 'foldkit-entity: variants need two cases or more; one shape is Entity.define'
      }

/** Each case's fields, `_tag` aside, by tag: the case's own schemas, never the stored null. */
export type CaseSchemas = Readonly<Record<string, Schema.Struct.Fields>>

/** What an interpreter reads of an Entity's variants (`Entity.variantsOf`). */
export interface EntityVariants {
  /** Effect's tagged union of the cases: what `entity.variants` is. */
  readonly union: AnyVariantUnion
  /** The case names, in the order declared. */
  readonly tags: ReadonlyArray<string>
  readonly cases: CaseSchemas
  /**
   * A stored row, encoded as the store holds it (every field, null where the
   * row is of another case), decoded to its case; and back.
   */
  readonly stored: Schema.Codec<unknown, unknown>
}

const registry = new WeakMap<object, EntityVariants>()

/** The variants registered for an identity, or none for an Entity of one shape. */
export const variantsOf = (identity: object): Option.Option<EntityVariants> =>
  Option.fromUndefinedOr(registry.get(identity))

const acceptsNull = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNull(ast) ||
  SchemaAST.isUnknown(ast) ||
  SchemaAST.isAny(ast) ||
  (SchemaAST.isUnion(ast) && ast.types.some(acceptsNull))

/** Whether a field's stored form holds null already, so the stored row needs no second null. */
export const storesNull = (schema: Schema.Constraint): boolean =>
  acceptsNull(SchemaAST.toEncoded(schema.ast))

/**
 * The stored row's fields, and the variants, for `cases`; refused where a
 * stored row could not hold them.
 */
export const declareVariants = (
  name: string,
  cases: VariantCases,
): { readonly fields: Schema.Struct.Fields; readonly variants: Omit<EntityVariants, 'stored'> } => {
  const fail = (message: string): never => {
    throw new Error(`Entity "${name}": ${message}`)
  }
  const tags = Object.keys(cases)
  if (tags.length < 2) fail('variants need two cases or more; one shape is Entity.define')
  const declared = new Map<
    string,
    { readonly schema: Schema.Constraint; readonly holders: Set<string> }
  >()
  for (const tag of tags) {
    for (const [key, schema] of Object.entries(cases[tag]!)) {
      if (key === '_tag') fail(`case "${tag}" declares _tag; it is the case name`)
      if (SchemaAST.isOptional(schema.ast))
        fail(`"${key}" of case "${tag}" is an optional key; a stored row holds every field`)
      const earlier = declared.get(key)
      if (earlier === undefined) declared.set(key, { schema, holders: new Set([tag]) })
      else if (earlier.schema !== schema)
        fail(
          `"${key}" is declared with different schemas; declare it once and spread it into each case`,
        )
      else earlier.holders.add(tag)
    }
  }
  const fields: Record<string, Schema.Constraint> = {}
  put(fields, '_tag', Schema.Literals(tags))
  for (const [key, { schema, holders }] of declared)
    put(
      fields,
      key,
      holders.size === tags.length || storesNull(schema)
        ? schema
        : Schema.NullOr(schema as Schema.Top),
    )
  const caseSchemas: Record<string, Schema.Struct.Fields> = {}
  for (const tag of tags) put(caseSchemas, tag, Object.freeze({ ...cases[tag] }))
  return {
    fields,
    variants: {
      union: Schema.TaggedUnion(cases) as unknown as AnyVariantUnion,
      tags: Object.freeze(tags),
      cases: Object.freeze(caseSchemas),
    },
  }
}

/** Registers an identity's variants, with the codec between its stored row and its case. */
export const registerVariants = (
  identity: object,
  stored: Schema.Struct<Schema.Struct.Fields>,
  variants: Omit<EntityVariants, 'stored'>,
): void => {
  const keys = Object.keys(stored.fields)
  const keysOf = new Map(
    variants.tags.map(tag => [tag, ['_tag', ...Object.keys(variants.cases[tag]!)]] as const),
  )
  const ownOf = new Map([...keysOf].map(([tag, keys]) => [tag, new Set(keys)] as const))
  // The stored row's own `_tag` check runs first, so the tag is one of the cases.
  const caseKeys = (tag: unknown): ReadonlyArray<string> => keysOf.get(tag as string)!
  type Encoded = Readonly<Record<string, unknown>>
  // A field of another case holding a value is a row no case describes: refused, never dropped.
  const foreignNull = Schema.makeFilter<Encoded>(row => {
    const own = ownOf.get(row._tag as string)!
    const held = keys.filter(key => !own.has(key) && row[key] !== null)
    return held.length === 0
      ? undefined
      : `a row that is ${String(row._tag)} holds ${held.join(', ')}, which only another case has`
  })
  const codec = (Schema.toEncoded(stored) as unknown as Schema.Codec<Encoded>)
    .check(foreignNull)
    .pipe(
      Schema.decodeTo(
        variants.union as unknown as Schema.Codec<unknown, Encoded>,
        SchemaTransformation.transform<Encoded, Encoded>({
          decode: row => Object.fromEntries(caseKeys(row._tag).map(key => [key, row[key]])),
          encode: row =>
            Object.fromEntries(keys.map(key => [key, Object.hasOwn(row, key) ? row[key] : null])),
        }),
      ),
    )
  registry.set(
    identity,
    Object.freeze({ ...variants, stored: codec as Schema.Codec<unknown, unknown> }),
  )
}
