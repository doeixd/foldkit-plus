// @vitest-environment node
/**
 * The language page's Model: its inputs become the declared bodies' questions,
 * its readers are the trace's, and SQLite's answer is accepted only for the
 * question it was asked.
 */
import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Message,
  SqlState,
  agreement,
  authorIds,
  bodyNames,
  initial,
  questionOf,
  readout,
  summary,
  update,
  viewers,
  type Inputs,
  type Model,
} from '../src/languageApp.js'
import { runLanguage } from '../src/language.js'
import { questions, world } from '../src/questions.js'

const start = (): Model => {
  const { model } = initial()
  return model
}

/** The variant a SQL state is in, by name. */
const stateOf = (state: SqlState): string =>
  SqlState.match(state, {
    Asking: () => 'Asking',
    Answered: () => 'Answered',
    Failed: () => 'Failed',
  })

const list = (ids: ReadonlyArray<string>) => (ids.length === 0 ? 'none' : ids.join(', '))

describe('the page holds the declared bodies', () => {
  it('names every body and author of questions.ts, and only those', () => {
    expect([...bodyNames]).toEqual(questions.map(({ name }) => name))
    expect([...authorIds]).toEqual(world.authors.map(({ id }) => id))
    expect(viewers).toEqual(['visitor', ...authorIds])
  })

  it('reads each body as the trace does: the same expression, evaluate and Judge', async () => {
    const lines = await runLanguage()
    for (const [index, question] of questions.entries()) {
      const body = bodyNames[index]
      if (body === undefined) throw new Error('a body without a name')
      const inputs: Inputs = {
        body,
        search: 'COMP',
        name: 'ada',
        editor: 'a2',
        viewer: Option.isSome(question.viewer) ? 'a1' : 'visitor',
      }
      const read = readout(inputs)
      const start = lines.findIndex(line => line.startsWith(`${question.name}:`))
      const block = lines.slice(start, start + 12)
      expect(read.question.input).toEqual(question.input)
      expect(block).toContain(
        `  evaluate, every post: ${Result.match(read.evaluate, { onSuccess: list, onFailure: why => `refused, ${why}` })}`,
      )
      expect(block).toContain(`  Judge, every row held: ${list(read.judgeAll)}`)
      expect(block).toContain(`  ${read.expression.split('\n').join('\n  ')}`.split('\n')[0]!)
    }
  })
})

describe('update', () => {
  it('asks SQLite at start, and again for each changed input', () => {
    const first = initial()
    expect(first.commands).toHaveLength(1)
    const next = update(first.model, Message.ChoseBody({ body: 'ByAuthorName' }))
    expect(next.model.body).toBe('ByAuthorName')
    expect(next.commands).toHaveLength(1)
    expect(stateOf(next.model.sql)).toBe('Asking')
  })

  it('returns the Model it was given when the input does not change', () => {
    const model = start()
    for (const message of [
      Message.ChoseBody({ body: model.body }),
      Message.TypedSearch({ text: model.search }),
      Message.TypedName({ text: model.name }),
      Message.ChoseEditor({ editor: model.editor }),
      Message.ChoseViewer({ viewer: model.viewer }),
    ]) {
      const next = update(model, message)
      expect(next.model).toBe(model)
      expect(next.commands ?? []).toEqual([])
    }
  })

  it('a body is given only the inputs it reads, and the viewer asks it', () => {
    const base = start()
    const discussed = questionOf({ ...base, body: 'Discussed', viewer: 'a2' })
    expect(discussed.input).toEqual({})
    expect(discussed.viewer).toEqual(Option.some({ entity: 'Author', id: 'a2' }))
    expect(questionOf({ ...base, body: 'ByAuthorName', name: 'x' }).input).toEqual({ name: 'x' })
    expect(questionOf({ ...base, viewer: 'visitor' }).viewer).toEqual(Option.none())
  })

  it('takes SQLite’s answer for the question asked and drops one for an earlier question', () => {
    const asked = update(start(), Message.ChoseBody({ body: 'NotEditedBy' })).model
    const key = SqlState.match(asked.sql, {
      Asking: ({ key }) => key,
      Answered: () => '',
      Failed: () => '',
    })
    const stale = update(asked, Message.SqlAnswered({ key: 'other', ids: ['p1'], statements: [] }))
    expect(stale.model).toBe(asked)
    const fresh = update(asked, Message.SqlAnswered({ key, ids: ['p3'], statements: [] }))
    expect(stateOf(fresh.model.sql)).toBe('Answered')
    const failed = update(asked, Message.SqlFailed({ key, message: 'no wasm' }))
    expect(stateOf(failed.model.sql)).toBe('Failed')
  })
})

describe('the readers against an answer', () => {
  it('compares by ids in order, and says none where evaluate refuses', () => {
    const base = start()
    const search = readout({ ...base, body: 'NotEditedBy' })
    expect(agreement(search, ['p3']).evaluate).toEqual(Option.some(true))
    expect(agreement(search, ['p3', 'p1']).evaluate).toEqual(Option.some(false))
    expect(agreement(search, ['p3']).judgeAll).toBe(true)
    const path = readout({ ...base, body: 'ByAuthorName' })
    expect(agreement(path, ['p2', 'p1']).evaluate).toEqual(Option.none())
    expect(agreement(path, ['p1', 'p2']).judgeAll).toBe(false)
  })

  it('a page holding part of the rows is right where it knows and unsure elsewhere', () => {
    const path = readout({ ...start(), body: 'ByAuthorName' })
    const verdict = agreement(path, ['p2', 'p1'])
    expect(verdict.partWrong).toBe(0)
    expect(verdict.partKnown).toBe(2)
    expect(path.judgePart.filter(({ known }) => Option.isNone(known))).toHaveLength(2)
    expect(agreement(path, ['p3']).partWrong).toBeGreaterThan(0)
  })

  it('says the rows and who agrees, or what refuses', () => {
    const base = start()
    const answered = (body: Model['body'], ids: ReadonlyArray<string>): Model => ({
      ...base,
      body,
      sql: SqlState.Answered({ key: '', ids, statements: [] }),
    })
    expect(summary(answered('NotEditedBy', ['p3']))).toBe(
      'NotEditedBy: 1 row. SQLite, evaluate and Judge agree.',
    )
    expect(summary(answered('ByAuthorName', ['p2', 'p1']))).toBe(
      'ByAuthorName: 2 rows. SQLite and Judge agree. evaluate refuses: it does not run path.',
    )
    expect(summary(answered('NotEditedBy', ['p1']))).toContain('The readers disagree.')
  })
})
