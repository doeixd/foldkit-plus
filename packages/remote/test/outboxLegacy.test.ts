/**
 * A write stored by v0.43.0 still reads: its computed fields carried the
 * collation their text compared under, which a write now says as a call of
 * `text.lowerAscii` over the text. One that cannot be said is kept and shown
 * as unreadable with its reason, never dropped.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { readEntries } from '../src/outboxStore.js'

/** An entry as v0.43.0 wrote it: `collation` on every call, `null` when it declared none. */
const entryWith = (computation: unknown) => ({
  operation: 'op-1',
  mutation: 'Rename',
  input: { id: 'i1' },
  optimistic: [{ entity: 'Item', id: 'i1', values: {}, computes: { flag: computation } }],
  shown: [],
  revision: 3,
  state: { _tag: 'Waiting' },
})

const startsWith = (collation: unknown, operator = 'text.startsWith') => ({
  _tag: 'Call',
  operator,
  args: [
    { _tag: 'Field', key: 'title' },
    { _tag: 'Value', value: 'AB' },
  ],
  collation,
})

const read = (computation: unknown) =>
  readEntries({ entries: [entryWith(computation)], done: [], owner: Option.none() }, () =>
    Option.some(input => Option.some({ decoded: input })),
  )[0]!

const computed = (entry: ReturnType<typeof read>) => {
  if (entry._tag !== 'Readable') throw new Error(`unreadable: ${entry.reason}`)
  const [operation] = entry.write.optimistic
  return operation && 'computes' in operation ? operation.computes?.flag : undefined
}

const fold = (arg: unknown) => ({ _tag: 'Call', operator: 'text.lowerAscii', args: [arg] })

describe('a write stored by v0.43.0', () => {
  it('replays an ASCII-folding comparison with its text folded', () => {
    expect(computed(read(startsWith({ _tag: 'AsciiFold' })))).toEqual({
      _tag: 'Call',
      operator: 'text.startsWith',
      args: [fold({ _tag: 'Field', key: 'title' }), fold({ _tag: 'Value', value: 'AB' })],
    })
  })

  it('replays a binary or absent collation unchanged', () => {
    const plain = {
      _tag: 'Call',
      operator: 'text.startsWith',
      args: [
        { _tag: 'Field', key: 'title' },
        { _tag: 'Value', value: 'AB' },
      ],
    }
    expect(computed(read(startsWith({ _tag: 'Binary' })))).toEqual(plain)
    expect(computed(read(startsWith(null)))).toEqual(plain)
  })

  it('upgrades a call nested in another', () => {
    const outer = {
      _tag: 'Call',
      operator: 'text.startsWith',
      args: [startsWith({ _tag: 'AsciiFold' }), { _tag: 'Value', value: 'x' }],
      collation: null,
    }
    expect(computed(read(outer))).toEqual({
      _tag: 'Call',
      operator: 'text.startsWith',
      args: [
        {
          _tag: 'Call',
          operator: 'text.startsWith',
          args: [fold({ _tag: 'Field', key: 'title' }), fold({ _tag: 'Value', value: 'AB' })],
        },
        { _tag: 'Value', value: 'x' },
      ],
    })
  })

  it('keeps a backend-locale comparison as unreadable, with the locale named', () => {
    const entry = read(startsWith({ _tag: 'Locale', locale: 'de_DE' }))
    expect(entry._tag).toBe('Unreadable')
    expect(entry._tag === 'Unreadable' && entry.reason).toContain('"de_DE"')
    expect(entry._tag === 'Unreadable' && entry.operation).toBe('op-1')
  })

  it('keeps a fold it cannot place as unreadable', () => {
    const entry = read(startsWith({ _tag: 'AsciiFold' }, 'text.somethingElse'))
    expect(entry._tag).toBe('Unreadable')
    expect(entry._tag === 'Unreadable' && entry.reason).toContain('text.somethingElse')
  })
})
