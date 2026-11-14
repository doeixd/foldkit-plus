/**
 * `Scenario`: plain data run by runners, judged against what the laws report
 * decided, with `Scenario` evidence issued for a run with no mismatch.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Mutation } from '../src/index.js'
import {
  Scenario,
  type ScenarioRunner,
  type ScenarioStep,
  type WriteScenario,
} from '../src/testing.js'

const NoteFields = Entity.define(
  'Note',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    title: Schema.String,
  }),
)
const staysPublished = Entity.invariant<typeof NoteFields>(
  'staysPublished',
  ({ before, after }) =>
    Expr.or(
      Expr.not(Expr.eq(before.status, 'published')),
      Expr.not(Expr.eq(after.status, 'draft')),
    ),
  { message: 'A published note does not go back to draft', path: ['status'] },
)
const Note = NoteFields.pipe(staysPublished)
const Draft = Entity.refine(Note, 'Draft', { status: 'draft' })
const Published = Entity.refine(Note, 'Published', { status: 'published' })

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(Note, Schema.Struct({ id: Schema.String, status: Schema.Literal('published') })),
    { id: 'id', from: Draft, becomes: Published },
  ),
)
const Revert = Mutation.write(
  'Revert',
  Write.update(
    Entity.input(Note, Schema.Struct({ id: Schema.String, status: Schema.Literal('draft') })),
    { id: 'id' },
  ),
)
const Retitle = Mutation.write(
  'Retitle',
  Write.update(Entity.input(Note, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const report = Laws.check({ writes: [Publish, Revert, Retitle] })

type Principal = { readonly id: string }
const ada = Option.some<Principal>({ id: 'ada' })
const draft = { id: 'n1', status: 'draft', title: 'T' }
const published = { id: 'n2', status: 'published', title: 'T' }

/** A runner that answers what it is told to: one step, with the sides given. */
const runnerSaying = (
  name: string,
  actual: (scenario: WriteScenario<Principal>) => unknown,
): ScenarioRunner<Principal> => ({
  name,
  run: scenario =>
    Effect.succeed<ReadonlyArray<ScenarioStep>>([
      {
        backend: name,
        step: 'decision',
        expected: Scenario.expectedDecision(scenario),
        actual: actual(scenario),
      },
    ]),
})
const agreeing = (name: string) =>
  runnerSaying(name, scenario => Scenario.expectedDecision(scenario))
const disagreeing = (name: string) => runnerSaying(name, () => ({ _tag: 'Forbidden' }))

const publish = Scenario.write<Principal>({
  name: 'a draft is published',
  given: [{ entity: Note, row: draft }],
  principal: ada,
  now: 0,
  when: [Publish, { id: 'n1', status: 'published' }],
  operation: 'op-1',
  expect: Scenario.accepted({ status: 'published' }),
})
const revert = Scenario.write<Principal>({
  name: 'a published note does not go back',
  given: [{ entity: Note, row: published }],
  principal: ada,
  now: 0,
  when: [Revert, { id: 'n2', status: 'draft' }],
  operation: 'op-2',
  expect: Scenario.refused({ entity: 'Note', id: 'staysPublished' }),
})

const run = (
  scenario: WriteScenario<Principal>,
  runners: ReadonlyArray<ScenarioRunner<Principal>>,
  withReport = true,
) => Effect.runPromise(Scenario.run(scenario, runners, withReport ? { report } : {}))

describe('Scenario.run', () => {
  it('issues one Scenario record per runner with no mismatch, naming it, and none for a runner with one', async () => {
    const result = await run(publish, [
      agreeing('remote'),
      disagreeing('sqlite'),
      agreeing('memory'),
    ])
    expect(result.mismatches.map(({ backend, step }) => ({ backend, step }))).toEqual([
      { backend: 'sqlite', step: 'decision' },
    ])
    expect(result.evidence.map(record => ({ ...record }))).toEqual(
      ['remote', 'memory'].map(runner => ({
        _tag: 'Scenario',
        transition: 'write:Publish',
        law: 'Note.staysPublished',
        name: 'a draft is published',
        runner,
      })),
    )
    expect(
      result.evidence.every(record =>
        Option.contains(Evidence.issuedBy(record), 'foldkit-remote/scenario'),
      ),
    ).toBe(true)
  })

  it('issues evidence for a write only against the laws it could break, and none without a report or for a refusal', async () => {
    const retitle = Scenario.write<Principal>({
      ...publish,
      when: [Retitle, { id: 'n1', title: 'U' }],
      expect: Scenario.accepted({ title: 'U' }),
    })
    expect((await run(retitle, [agreeing('remote')])).evidence).toEqual([])
    expect((await run(publish, [agreeing('remote')], false)).evidence).toEqual([])
    expect((await run(revert, [agreeing('remote')])).evidence).toEqual([])
  })

  it('a runner that reports no step issues nothing', async () => {
    const silent: ScenarioRunner<Principal> = { name: 'silent', run: () => Effect.succeed([]) }
    expect((await run(publish, [silent])).evidence).toEqual([])
  })

  it('a mismatch is described by its backend, step and both sides', async () => {
    const [mismatch] = (await run(publish, [disagreeing('sqlite')])).mismatches
    expect(Scenario.describeMismatch(mismatch!)).toBe(
      'sqlite / decision: expected {"_tag":"Accepted"}, got {"_tag":"Forbidden"}',
    )
  })

  it('throws before running when the scenario expects a write the report refused, naming the invariant', () => {
    let ran = false
    const spy: ScenarioRunner<Principal> = {
      name: 'spy',
      run: () => ((ran = true), Effect.succeed([])),
    }
    const lands = Scenario.write<Principal>({
      ...revert,
      expect: Scenario.accepted({ status: 'draft' }),
    })
    expect(() => Scenario.run(lands, [spy], { report })).toThrow(/staysPublished/)
    expect(ran).toBe(false)
  })

  it('does not refuse a write that lands from a row the refused steps do not start from', () => {
    const fromDraft = Scenario.write<Principal>({
      ...revert,
      given: [{ entity: Note, row: draft }],
      when: [Revert, { id: 'n1', status: 'draft' }],
      expect: Scenario.accepted({ status: 'draft' }),
    })
    expect(() => Scenario.run(fromDraft, [], { report })).not.toThrow()
  })

  it('throws when it expects a refusal by an invariant the report kept the write from breaking', () => {
    const wrong = Scenario.write<Principal>({
      ...publish,
      when: [Retitle, { id: 'n1', title: 'U' }],
      expect: Scenario.refused({ entity: 'Note', id: 'staysPublished' }),
    })
    expect(() => Scenario.run(wrong, [], { report })).toThrow(/kept it/)
  })
})

describe('Scenario.fromReport', () => {
  const options = {
    writes: [Publish, Revert, Retitle],
    starts: [
      { entity: Note, row: draft },
      { entity: Note, row: published },
    ],
    principal: ada,
    now: 5,
  }

  it('gives an acceptance for each arrow that holds and a rejection for each refused pair, over a start that fits', () => {
    const [accepted, rejected, ...rest] = Scenario.fromReport(report, options)
    expect(rest).toEqual([])
    expect(accepted).toMatchObject({
      given: [{ row: draft }],
      now: 5,
      expect: { _tag: 'Accepted', row: { status: 'published' } },
    })
    expect(accepted!.when[0].name).toBe('Publish')
    expect(rejected).toMatchObject({
      given: [{ row: published }],
      expect: { _tag: 'Refused', refusal: { entity: 'Note', id: 'staysPublished' } },
    })
    expect(rejected!.when).toEqual([Revert, { id: 'n2', status: 'draft' }])
  })

  it('names each operation distinctly', () => {
    const operations = Scenario.fromReport(report, options).map(scenario => scenario.operation)
    expect(new Set(operations).size).toBe(operations.length)
  })

  it('throws, naming the arrow, when no start is in its from state', () => {
    expect(() =>
      Scenario.fromReport(report, { ...options, starts: [{ entity: Note, row: published }] }),
    ).toThrow(/Publish: Draft -> Published/)
  })

  it('throws, naming the pair, when no start fits a refused step', () => {
    expect(() =>
      Scenario.fromReport(report, { ...options, starts: [{ entity: Note, row: draft }] }),
    ).toThrow(/Revert x staysPublished/)
  })

  it('throws for a write the report names and `writes` lacks', () => {
    expect(() => Scenario.fromReport(report, { ...options, writes: [Publish] })).toThrow(
      /no Revert/,
    )
  })
})

describe('Scenario.runMessages', () => {
  type Model = { readonly todos: ReadonlyArray<string> }
  type Message = { readonly add: string }
  const app = {
    initial: { todos: [] } as Model,
    update: (model: Model, message: Message) => ({
      model: { todos: [...model.todos, message.add] },
    }),
  }
  const readers = { count: (model: Model) => model.todos.length }
  const capped = (limit: number) => (_: Model, after: Model) =>
    after.todos.length > limit ? Option.some({ id: 'atMost' }) : Option.none()
  const scenario = (expect: ReturnType<typeof Scenario.reads>) =>
    Scenario.messages<Message>({
      name: 'a third todo',
      given: [{ add: 'a' }, { add: 'b' }],
      when: { add: 'c' },
      expect,
    })
  const options = {
    app,
    readers,
    judge: capped(3),
    evidence: { transition: 'durable:Add', laws: ['sync.atMost'] },
  }

  it('applies the history from initial and judges the reading, issuing a record when nothing is broken', () => {
    const result = Scenario.runMessages(scenario(Scenario.reads('count', 3)), options)
    expect(result.mismatches).toEqual([])
    expect(result.evidence.map(record => ({ ...record }))).toEqual([
      {
        _tag: 'Scenario',
        transition: 'durable:Add',
        law: 'sync.atMost',
        name: 'a third todo',
        runner: 'messages',
      },
    ])
  })

  it('a wrong reading is a mismatch, and issues nothing', () => {
    const result = Scenario.runMessages(scenario(Scenario.reads('count', 2)), options)
    expect(result.mismatches).toEqual([
      { backend: 'messages', step: 'reads count', expected: 2, actual: 3 },
    ])
    expect(result.evidence).toEqual([])
  })

  it('a law the step breaks makes a reading scenario a mismatch, and a Breaks scenario passes', () => {
    const tight = { ...options, judge: capped(2) }
    expect(Scenario.runMessages(scenario(Scenario.reads('count', 3)), tight).mismatches).toEqual([
      { backend: 'messages', step: 'law', expected: 'none', actual: 'atMost' },
    ])
    expect(Scenario.runMessages(scenario(Scenario.breaks('atMost')), tight).mismatches).toEqual([])
    expect(Scenario.runMessages(scenario(Scenario.breaks('atMost')), options).mismatches).toEqual([
      { backend: 'messages', step: 'law', expected: 'atMost', actual: 'none' },
    ])
  })

  it('names a reader it was not given, even one on the prototype', () => {
    expect(() => Scenario.runMessages(scenario(Scenario.reads('nope', 1)), options)).toThrow(
      /no "nope"/,
    )
    expect(() => Scenario.runMessages(scenario(Scenario.reads('constructor', 1)), options)).toThrow(
      /no "constructor"/,
    )
  })
})
