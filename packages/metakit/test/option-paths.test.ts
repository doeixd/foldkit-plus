/**
 * A path to an Effect `Option` field reads as its value or null, and a write
 * of the value or null stores `Option.some` or `Option.none()`.
 */
import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Null, Ord, Path, Transition, Verdict } from '@doeixd/metakit'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({
  editingId: Schema.OptionFromNullOr(Schema.String),
  undo: Schema.Option(Todo),
  count: Schema.Int,
})
type Model = typeof Model.Type
const $ = Path.forSchema(Model)

const idle: Model = { editingId: Option.none(), undo: Option.none(), count: 0 }
const busy: Model = {
  editingId: Option.some('t1'),
  undo: Option.some({ id: 't2', title: 'milk' }),
  count: 1,
}

describe('reading', () => {
  it('reads the value of a some and null of a none', () => {
    expect(Expr.evaluate($.editingId, busy)).toBe('t1')
    expect(Expr.evaluate($.editingId, idle)).toBe(null)
    expect(Expr.evaluate(Null.isNull($.editingId), idle)).toBe(true)
  })

  it('reads a field of the value inside, or null through a none', () => {
    expect(Expr.evaluate($.undo.title, busy)).toBe('milk')
    expect(Expr.evaluate($.undo.title, idle)).toBe(null)
    expect(Expr.evaluate(Eq.equals($.undo.id, 't2'), busy)).toBe(true)
  })

  it('is folded by partial evaluation, a none included', () => {
    expect(Expr.residualize($.undo.id, { undo: Option.none() }).node).toEqual({
      _tag: 'Lit',
      value: null,
    })
    expect(Expr.judge(Eq.is($.editingId, 't1'), { editingId: Option.some('t1') })._tag).toBe('True')
  })

  it('is a nullable field to the checker', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Model, Null.isNotNull($.editingId)))).toBe(false)
    const known = Expr.implies(Null.isNotNull($.undo.id), Eq.is($.undo.id, $.undo.id))
    expect(Abstract.checkInvariant(Model, Ord.gte($.count, $.count))._tag).toBe('True')
    expect(Verdict.isFalse(Abstract.checkInvariant(Model, known))).toBe(false)
  })

  it('refuses an Option of a value that may be null when the path is made', () => {
    const Ambiguous = Schema.Struct({ x: Schema.Option(Schema.NullOr(Schema.String)) })
    expect(() => Path.forSchema(Ambiguous).x).toThrow(/Option of a value that may be null/)
  })
})

describe('Path.get and Path.set read and write the logical value', () => {
  it('reads a some as its value and a none as null', () => {
    expect(Path.get($.editingId, busy)).toEqual(Option.some('t1'))
    expect(Path.get($.editingId, idle)).toEqual(Option.some(null))
  })

  it('reads through an Option to a field inside it', () => {
    expect(Path.get($.undo.title, busy)).toEqual(Option.some('milk'))
    expect(Path.get($.undo.title, idle)).toEqual(Option.some(null))
  })

  it('writes a value as a some and null as a none', () => {
    const renamed = Path.set($.editingId, busy, 't2')
    expect(renamed.editingId).toEqual(Option.some('t2'))
    expect(Schema.is(Model)(renamed)).toBe(true)

    const cleared = Path.set($.editingId, busy, null)
    expect(cleared.editingId).toEqual(Option.none())
    expect(Schema.is(Model)(cleared)).toBe(true)
  })

  it('keeps the model it was given where the field already reads as the value', () => {
    expect(Path.set($.editingId, busy, 't1')).toBe(busy)
    expect(Path.set($.editingId, idle, null)).toBe(idle)
  })

  it('writes a whole Option field', () => {
    expect(Path.set($.undo, idle, { id: 'x', title: 'y' }).undo).toEqual(
      Option.some({ id: 'x', title: 'y' }),
    )
    expect(Path.set($.undo, busy, null).undo).toEqual(Option.none())
  })

  it('refuses a write inside an Option', () => {
    expect(() => Path.set($.undo.title, busy, 'x')).toThrow(/inside the Option at "undo"/)
  })

  it('leaves a raw path on storage, an Option included', () => {
    expect(Path.get(Path.make<Model, unknown>(['editingId']), busy)).toEqual(
      Option.some(Option.some('t1')),
    )
  })
})

describe('writing', () => {
  const Edit = Transition.make({
    state: Model,
    input: Schema.Struct({ id: Schema.NullOr(Schema.String) }),
    apply: ({ state, input }) => [Transition.set(state.editingId, input.id)],
  })
  const Clear = Transition.make({
    state: Model,
    input: Schema.Struct({}),
    when: ({ state }) => Eq.isNot(state.undo.id, null),
    apply: ({ state }) => [Transition.set(state.undo, null), Transition.add(state.count, 1)],
  })

  it('stores a value as a some and null as a none', () => {
    const editing = Result.getOrThrow(Transition.run(Edit, idle, { id: 'a' }))
    expect(editing.editingId).toEqual(Option.some('a'))
    expect(Schema.is(Model)(editing)).toBe(true)
    const stopped = Result.getOrThrow(Transition.run(Edit, busy, { id: null }))
    expect(stopped.editingId).toEqual(Option.none())
  })

  it('leaves the state it was given where the field already reads as the value', () => {
    expect(Result.getOrThrow(Transition.run(Edit, busy, { id: 't1' }))).toBe(busy)
    expect(Result.getOrThrow(Transition.run(Edit, idle, { id: null }))).toBe(idle)
  })

  it('guards on a field inside an Option', () => {
    expect(Result.getOrThrow(Transition.run(Clear, busy, {})).undo).toEqual(Option.none())
    expect(Result.isFailure(Transition.run(Clear, idle, {}))).toBe(true)
  })

  it('refuses a write inside an Option', () => {
    const Rename = Transition.make({
      state: Model,
      input: Schema.Struct({ title: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.undo.title, input.title)],
    })
    const renamed = Transition.run(Rename, busy, { title: 'x' })
    expect(Result.isFailure(renamed) && renamed.failure.reason).toContain('inside the Option')
  })

  it('is checked against the field as nullable: null fits a none', () => {
    expect(Verdict.isTrue(Abstract.checkTransition(Model, Edit))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkTransition(Model, Clear))).toBe(true)
  })
})
