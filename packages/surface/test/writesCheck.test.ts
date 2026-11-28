/**
 * `WritesCheck.verify`: what `update` changed, held against the writes the
 * Message's transition declares and against the closed Surfaces.
 */
import { Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Writes, WritesCheck, type WriteDiagnostic } from '../src/writes.js'
import {
  App,
  Declared,
  Header,
  initial,
  Message,
  type Model,
  Tally,
  update,
} from './writesFixture.js'

afterEach(() => vi.restoreAllMocks())

const writes = Writes.of(App, Declared)

/** The findings of one Message through `step`, checked against the fixture's Surfaces. */
const findings = (
  message: Message,
  step: (model: Model, message: Message) => { readonly model: Model } = update,
): ReadonlyArray<WriteDiagnostic> => {
  const reported: Array<WriteDiagnostic> = []
  WritesCheck.verify(writes, step, {
    surfaces: [Header, Tally],
    report: finding => reported.push(finding),
  })(initial, message)
  return reported
}

/** `update`, with `more` applied to the Model `tag` made. */
const also =
  (tag: Message['_tag'], more: (model: Model) => Model) =>
  (model: Model, message: Message): { readonly model: Model } => {
    const result = update(model, message)
    if (message._tag !== tag) return result
    return { model: more(result.model) }
  }

describe('against the declared writes', () => {
  it.each([
    ['a write to a field', Message.Renamed({ title: 'New' })],
    [
      'a write to a field of a struct, whose other fields are as they were',
      Message.Deposited({ amount: 2 }),
    ],
    ['a write to a struct whole', Message.Moved({ account: { balance: 9, owner: 'grace' } })],
    ['a transition that writes nothing and changes nothing', Message.Pinged()],
  ])('finds nothing for %s', (_, message) => {
    expect(findings(message)).toEqual([])
  })

  it('names the path a Message changed and did not declare', () => {
    expect(findings(Message.Sneaked())).toMatchObject([
      { _tag: 'UndeclaredWrite', tag: 'Sneaked', paths: [['title']], declared: [['count']] },
      { _tag: 'OutsideWrite' },
    ])
  })

  it('names the field of a struct that changed beside the declared one', () => {
    const step = also('Deposited', model =>
      modifyFields(model, {
        account: account => modifyFields(account, { owner: () => 'mallory' }),
      }),
    )
    expect(findings(Message.Deposited({ amount: 2 }), step)).toMatchObject([
      {
        _tag: 'UndeclaredWrite',
        tag: 'Deposited',
        paths: [['account', 'owner']],
        declared: [['account', 'balance']],
      },
    ])
  })

  it('takes a struct rebuilt with the fields it had as no change', () => {
    const step = also('Counted', model =>
      modifyFields(model, {
        account: account => ({ balance: account.balance, owner: account.owner }),
      }),
    )
    expect(findings(Message.Counted(), step)).toEqual([])
  })

  it('checks no declared writes for a Message with no transition', () => {
    expect(findings(Message.Noted({ note: 'n' }))).toEqual([])
  })

  it('says what changed and what was declared', () => {
    expect(findings(Message.Sneaked())[0]?.message).toBe(
      '"Sneaked" changed title, and its transition declares it writes count. A view kept on the declared writes would show its last drawing: declare the write, or stop making it.',
    )
    const step = also('Pinged', model => modifyFields(model, { note: () => 'pinged' }))
    expect(findings(Message.Pinged(), step)[0]?.message).toContain(
      '"Pinged" changed note, and its transition declares it writes nothing.',
    )
  })
})

/** Values a path walk meets, through declared writes given directly. */
describe('what counts as a change', () => {
  const Shape = Schema.Struct({
    rows: Schema.Array(Schema.Struct({ id: Schema.String, done: Schema.Boolean })),
    picked: Schema.Option(Schema.String),
    at: Schema.Date,
    count: Schema.Number,
  })
  type Shape = typeof Shape.Type
  const start: Shape = {
    rows: [
      { id: 'a', done: false },
      { id: 'b', done: false },
    ],
    picked: Option.some('a'),
    at: new Date(0),
    count: 0,
  }
  const changed = (next: Shape, declared: ReadonlyArray<ReadonlyArray<string>> = [['count']]) => {
    const reported: Array<WriteDiagnostic> = []
    WritesCheck.verify(
      { declared: () => Option.some(declared) },
      (_model: Shape, _message: { readonly _tag: 'Stepped' }) => ({ model: next }),
      { report: finding => reported.push(finding) },
    )(start, { _tag: 'Stepped' })
    return reported
      .filter(finding => finding._tag === 'UndeclaredWrite')
      .flatMap(finding => finding.paths)
  }
  const withRows = (rows: Shape['rows']): Shape => modifyFields(start, { rows: () => rows })

  it.each<[string, Shape, ReadonlyArray<ReadonlyArray<string>>]>([
    [
      'an item of an array, by its index',
      withRows([start.rows[0]!, { id: 'b', done: true }]),
      [['rows', '1', 'done']],
    ],
    [
      'an array that grew, as the array',
      withRows([...start.rows, { id: 'c', done: false }]),
      [['rows']],
    ],
    [
      'an array rebuilt of equal items: none',
      withRows(start.rows.map(row => ({ id: row.id, done: row.done }))),
      [],
    ],
    [
      'an Option holding another value',
      modifyFields(start, { picked: () => Option.some('b') }),
      [['picked']],
    ],
    [
      'an Option rebuilt around the same value: none',
      modifyFields(start, { picked: () => Option.some('a') }),
      [],
    ],
    ['a Date at another time', modifyFields(start, { at: () => new Date(5) }), [['at']]],
    ['a declared field: none', modifyFields(start, { count: () => 1 }), []],
  ])('reports %s', (_, next, paths) => {
    expect(changed(next)).toEqual(paths)
  })

  it('takes a write declared above a change, and not one declared beside it', () => {
    const next = withRows([start.rows[0]!, { id: 'b', done: true }])
    expect(changed(next, [['rows']])).toEqual([])
    expect(changed(next, [['rows', '1']])).toEqual([])
    expect(changed(next, [['rows', '0']])).toEqual([['rows', '1', 'done']])
  })
})

describe('against the closed Surfaces', () => {
  it('names the closed Surface a Message outside its messages changed', () => {
    const step = also('Noted', model => modifyFields(model, { title: () => 'noted' }))
    const [finding, ...rest] = findings(Message.Noted({ note: 'n' }), step)
    expect(rest).toEqual([])
    expect(finding).toMatchObject({ _tag: 'OutsideWrite', tag: 'Noted', surface: 'Header' })
    expect(finding?.message).toBe(
      '"Noted" changed what the closed Surface "Header" projects, and is not one of its messages. Add it to the Surface\'s messages, or move the write to one that is.',
    )
  })

  it('finds nothing for a Message in the closed Surface own messages', () => {
    expect(findings(Message.Renamed({ title: 'New' }))).toEqual([])
  })

  it('never tests a Surface not declared closed', () => {
    // Tally lists Counted and Sneaked; `Noted` here moves its count.
    const step = also('Noted', model => modifyFields(model, { count: () => 7 }))
    expect(findings(Message.Noted({ note: 'n' }), step)).toEqual([])
  })
})

describe('what it does with a finding', () => {
  it('throws by default, so a test that runs the Message fails', () => {
    expect(() => WritesCheck.verify(writes, update)(initial, Message.Sneaked())).toThrow(
      '[foldkit-surface] "Sneaked" changed title',
    )
  })

  it('logs a warning with WritesCheck.warn, and returns what update returned', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const result = WritesCheck.verify(writes, update, { report: WritesCheck.warn })(
      initial,
      Message.Sneaked(),
    )
    expect(result.model.title).toBe('sneaked')
    await vi.waitFor(() =>
      expect(log.mock.calls.flat().join(' ')).toContain(
        '[foldkit-surface] "Sneaked" changed title',
      ),
    )
  })

  it('returns the result of update itself, and reports nothing for a no-op', () => {
    const made = { model: initial, commands: ['kept'] }
    const report = vi.fn()
    const checked = WritesCheck.verify(writes, () => made, { report })
    expect(checked(initial, Message.Counted())).toBe(made)
    expect(report).not.toHaveBeenCalled()
  })
})

describe('against owning contracts (Sync / Remote ownership)', () => {
  const syncDoc = {
    kind: 'sync',
    name: 'ledger',
    owns: [['account']],
    messages: ['Deposited'],
  }

  it('reports OwnerWrite when a Message outside the contract mutates an owned path', () => {
    const reported: Array<WriteDiagnostic> = []
    const checked = WritesCheck.verify(writes, update, {
      contracts: [syncDoc],
      report: finding => reported.push(finding),
    })
    // Deposited is declared by sync:ledger -> allowed.
    checked(initial, Message.Deposited({ amount: 5 }))
    expect(reported).toEqual([])
    // Moved is NOT in sync:ledger.messages, and writes ['account'] -> OwnerWrite.
    checked(initial, Message.Moved({ account: { balance: 1, owner: 'grace' } }))
    expect(reported).toMatchObject([
      {
        _tag: 'OwnerWrite',
        tag: 'Moved',
        owner: 'sync:ledger',
        paths: [
          ['account', 'balance'],
          ['account', 'owner'],
        ],
      },
    ])
  })

  it('reports nothing when a foreign Message changes an unrelated path', () => {
    const reported: Array<WriteDiagnostic> = []
    WritesCheck.verify(writes, update, {
      contracts: [syncDoc],
      report: finding => reported.push(finding),
    })(initial, Message.Renamed({ title: 'Next' }))
    expect(reported).toEqual([])
  })
})
