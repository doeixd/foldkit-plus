/**
 * Displays: how one selected member shows in a list or a detail, described
 * without a renderer. It is `foldkit-form`'s `Input` from the reading side: the
 * member says what it is, a Display says how it reads, and which DOM draws it is
 * the application's.
 */
import { Schema } from 'effect'
import type { AnyEntity, EntityMember } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'

/**
 * How one selected member shows: the primitive every kind of Display is a value
 * of. `Display.text()` and `Display.flag()` are values of it, made by
 * `Display.kind`, which is what an application calls for a badge or a relative
 * date. The kinds here are a collection, not a special case.
 */
export interface Display<Data = unknown> {
  /** The name a renderer is found by. */
  readonly kind: string
  /** Whether a view draws it. A member read and not shown, usually the id, is `false`. */
  readonly shown: boolean
  /** What this kind needs: a format, a relation's target. */
  readonly data: Data
  /**
   * The value as text: what a cell says when nothing draws it specially. It is
   * never given `null` or `undefined`; `Display.show` says `nothing` for those.
   */
  readonly text: (value: unknown, words: DisplayWords) => string
}

/** A kind of Display: how its values are made, and how one is told from another. */
export interface DisplayKind<Data> {
  readonly kind: string
  readonly of: (data: Data) => Display<Data>
  readonly is: (display: Display) => display is Display<Data>
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
  summarize: display => display.kind,
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
  if (members.length === 1 && only?._tag === 'Number') return Number_.of({})
  if (members.length === 1 && only?._tag === 'Boolean') return Flag.of(nothing)
  return Text.of({})
}

/** A kind of Display. The kinds below are made with it, and so is an application's. */
const kind = <Data = Record<string, never>>(
  name: string,
  spec: {
    readonly shown?: boolean
    readonly text: (data: Data, value: unknown, words: DisplayWords) => string
  },
): DisplayKind<Data> => ({
  kind: name,
  of: data =>
    Object.freeze({
      kind: name,
      shown: spec.shown ?? true,
      data,
      text: (value: unknown, words: DisplayWords) => spec.text(data, value, words),
    }),
  is: (display): display is Display<Data> => display.kind === name,
})

const show = (display: Display, value: unknown, words: DisplayWords = {}): string =>
  value === null || value === undefined ? (words.nothing ?? '') : display.text(value, words)

const Text = kind<{ readonly format?: ((value: unknown) => string) | undefined }>('Text', {
  text: (data, value) => (data.format === undefined ? String(value) : data.format(value)),
})
const Number_ = kind<{ readonly format?: ((value: number) => string) | undefined }>('Number', {
  text: (data, value) =>
    typeof value === 'number' && data.format !== undefined ? data.format(value) : String(value),
})
const Flag = kind('Flag', {
  text: (_, value, words) => (value === true ? (words.yes ?? 'yes') : (words.no ?? 'no')),
})
const Hidden = kind('Hidden', { shown: false, text: () => '' })
/** A relation read as refs: which one, with nothing to say about it but its id. */
const Ref = kind<{ readonly target: AnyEntity; readonly many: boolean }>('Ref', {
  text: (_, value, words) => {
    const ids = (Array.isArray(value) ? value : [value]).map(ref =>
      typeof ref === 'object' && ref !== null && 'id' in ref ? String(ref.id) : String(ref),
    )
    return ids.length === 0 ? (words.nothing ?? '') : ids.join(words.separator ?? ', ')
  },
})
/**
 * A relation read through a Selection: the target's own members, each with a
 * Display. `shape` is how many there are: one, a list, or a page of a list.
 */
const Nested = kind<{
  readonly target: AnyEntity
  readonly shape: 'one' | 'many' | 'page'
  readonly columns: ReadonlyArray<DisplayColumn>
}>('Nested', {
  text: (data, value, words) => {
    const one = (item: unknown): string =>
      data.columns
        .filter(column => column.display.shown)
        .map(column =>
          show(
            column.display,
            (item as Readonly<Record<string, unknown>> | null)?.[column.key],
            words,
          ),
        )
        .filter(text => text !== '')
        .join(' ')
    const items =
      data.shape === 'one'
        ? [value]
        : data.shape === 'page'
          ? ((value as { readonly items?: ReadonlyArray<unknown> }).items ?? [])
          : (value as ReadonlyArray<unknown>)
    return items.length === 0 ? (words.nothing ?? '') : items.map(one).join(words.separator ?? ', ')
  },
})

const nothing: Record<string, never> = Object.freeze({})

export const Display = {
  /**
   * A kind of Display. `Display.kind<{ tone: string }>('Badge', { text: (_, value) => String(value) })`
   * gives `.of(data)` to make one and `.is(display)` to tell one, exactly as the
   * kinds below were made. `text` is the floor; a view draws it specially once
   * it is given a renderer for `Badge`.
   */
  kind,

  // The kinds this package resolves to. A view finds its renderer by `kind`.
  Text,
  Number: Number_,
  Flag,
  Hidden,
  Ref,
  Nested,

  text: (format?: (value: unknown) => string): Display => Text.of({ format }),
  number: (format?: (value: number) => string): Display => Number_.of({ format }),
  flag: (): Display => Flag.of(nothing),
  /** Read, so a row can be opened or keyed by it, and not shown: usually the id. */
  hidden: (): Display => Hidden.of(nothing),

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
      ? Ref.of({ target, many: member.cardinality === 'many' })
      : Nested.of({ target, shape: nested.shape, columns: nested.columns })
  },

  /**
   * A value as the text its Display calls for: what a cell says when nothing
   * draws it specially. A view that wants a link or a badge reads the Display
   * and the value itself; this is the floor every view can stand on.
   */
  show,
}
