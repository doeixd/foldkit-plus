/**
 * Displays: how one selected member shows in a list or a detail, described
 * without a renderer. It is `foldkit-form`'s `Input` from the reading side: the
 * member says what it is, a Display says how it reads, and which DOM draws it is
 * the application's.
 */
import { Schema } from 'effect'
import type { AnyEntity, EntityMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'

export type Display =
  /** Text as it is, or through `format`: a date, a price, a status in words. */
  | { readonly _tag: 'Text'; readonly format?: ((value: unknown) => string) | undefined }
  | { readonly _tag: 'Number'; readonly format?: ((value: number) => string) | undefined }
  | { readonly _tag: 'Flag' }
  /** Read, so a row can be opened or keyed by it, and not shown: usually the id. */
  | { readonly _tag: 'Hidden' }
  /** A relation read as refs: which one, with nothing to say about it but its id. */
  | { readonly _tag: 'Ref'; readonly target: AnyEntity; readonly many: boolean }
  /**
   * A relation read through a Selection: the target's own members, each with a
   * Display. `shape` is how many there are: one, a list, or a page of a list.
   */
  | {
      readonly _tag: 'Nested'
      readonly target: AnyEntity
      readonly shape: 'one' | 'many' | 'page'
      readonly columns: ReadonlyArray<DisplayColumn>
    }

/** A selected member with its words and its Display. A list's column, a detail's line. */
export interface DisplayColumn<Key extends string = string> {
  readonly key: Key
  readonly label: string
  readonly member: EntityMember
  readonly display: Display
}

/** The words a Display needs that are not the value's own. */
export interface DisplayWords {
  /** Default `yes`. */
  readonly yes?: string
  /** Default `no`. */
  readonly no?: string
  /** What stands for nothing: `null`, `undefined`, an empty list. Default the empty string. */
  readonly nothing?: string
  /** Between the items of a list, and between the members of a nested value. Default `, `. */
  readonly separator?: string
}

const key = Metadata.key<Display>('foldkit-crud/display', {
  // The last Display attached wins: a later annotation refines an earlier one.
  merge: displays => displays.slice(-1),
  summarize: display => display._tag,
})

interface AstLike {
  readonly _tag: string
  readonly types?: ReadonlyArray<AstLike>
}

const fromSchema = (schema: Schema.Top): Display => {
  const ast = Schema.toType(schema).ast as unknown as AstLike
  const members =
    ast._tag === 'Union'
      ? (ast.types ?? []).filter(member => member._tag !== 'Null' && member._tag !== 'Undefined')
      : [ast]
  const [only] = members
  if (members.length === 1 && only?._tag === 'Number') return { _tag: 'Number' }
  if (members.length === 1 && only?._tag === 'Boolean') return { _tag: 'Flag' }
  return { _tag: 'Text' }
}

export const Display = {
  text: (format?: (value: unknown) => string): Display => ({ _tag: 'Text', format }),
  number: (format?: (value: number) => string): Display => ({ _tag: 'Number', format }),
  flag: (): Display => ({ _tag: 'Flag' }),
  hidden: (): Display => ({ _tag: 'Hidden' }),

  /**
   * Entity metadata: how a member shows wherever it is listed, e.g.
   * `Entity.annotateMembers({ price: Display.of(Display.number(cents => ...)) })`.
   */
  of: (display: Display) => key.of(display),

  /**
   * The Display of one selected member, from the most to the least explicit
   * source: the member's `Display.of` metadata, how the relation was selected,
   * then the shape of its schema. `nested` is the columns of a nested Selection,
   * with `shape` saying how many the relation yields.
   */
  resolve: (
    member: EntityMember,
    nested?: {
      readonly shape: 'one' | 'many' | 'page'
      readonly columns: ReadonlyArray<DisplayColumn>
    },
  ): Display => {
    const [explicit] = key.get(member.metadata)
    if (explicit !== undefined) return explicit
    if (member._tag !== 'Relation') return fromSchema(member.schema as Schema.Top)
    const target = member.target()
    return nested === undefined
      ? { _tag: 'Ref', target, many: member.cardinality === 'many' }
      : { _tag: 'Nested', target, shape: nested.shape, columns: nested.columns }
  },

  /**
   * A value as the text its Display calls for: what a cell says when nothing
   * draws it specially. A view that wants a link or a badge reads `display` and
   * the value itself; this is the floor every view can stand on.
   */
  show: (display: Display, value: unknown, words: DisplayWords = {}): string => {
    const nothing = words.nothing ?? ''
    const separator = words.separator ?? ', '
    if (value === null || value === undefined) return nothing
    switch (display._tag) {
      case 'Hidden':
        return ''
      case 'Flag':
        return value === true ? (words.yes ?? 'yes') : (words.no ?? 'no')
      case 'Number':
        return typeof value === 'number' && display.format !== undefined
          ? display.format(value)
          : String(value)
      case 'Text':
        return display.format === undefined ? String(value) : display.format(value)
      case 'Ref': {
        const ids = (Array.isArray(value) ? value : [value]).map(ref =>
          typeof ref === 'object' && ref !== null && 'id' in ref ? String(ref.id) : String(ref),
        )
        return ids.length === 0 ? nothing : ids.join(separator)
      }
      case 'Nested': {
        const one = (item: unknown): string =>
          display.columns
            .filter(column => column.display._tag !== 'Hidden')
            .map(column =>
              Display.show(
                column.display,
                (item as Readonly<Record<string, unknown>> | null)?.[column.key],
                words,
              ),
            )
            .filter(text => text !== '')
            .join(' ')
        const items =
          display.shape === 'one'
            ? [value]
            : display.shape === 'page'
              ? ((value as { readonly items?: ReadonlyArray<unknown> }).items ?? [])
              : (value as ReadonlyArray<unknown>)
        return items.length === 0 ? nothing : items.map(one).join(separator)
      }
    }
  },
}
