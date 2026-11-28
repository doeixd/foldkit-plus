// @vitest-environment node
/**
 * `may` crosses the wire as JSON and is read in memory as a `Verdict`: the JSON
 * is the bytes it was before `May.answer` returned a `Verdict`, and the
 * `Verdict` is made where the answer is read.
 */
import { Option, Schema } from 'effect'
import { Verdict } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Condition, May, MaySchema, type RowRule } from '../src/index.js'
import { answerOf } from '../src/may.js'

const unsaid: Condition = { _tag: 'Inherit', relation: 'author' }
const decide = (condition: Condition): Option.Option<boolean> =>
  Option.liftPredicate(condition, each => each !== unsaid).pipe(
    Option.map(each => each === Condition.always),
  )
const rule = (condition: Condition, deny: RowRule['deny'] = { _tag: 'Forbidden' }): RowRule => ({
  condition,
  deny,
})

/** What the server sent for these rules before `May.answer` returned a `Verdict`. */
const sent =
  '{"row":{"Update":true,"Delete":false},"reasons":{"Delete":"No way"},"members":{"title":false},"relations":{"owner":{"Link":true,"Unlink":true}}}'

const answered = answerOf(
  {
    rows: [
      ['Update', rule(Condition.always)],
      ['Delete', rule(Condition.never, { _tag: 'Explain', reason: 'No way' })],
      ['Archive', rule(unsaid)],
    ],
    members: [{ member: 'title', condition: Condition.never, deny: { _tag: 'Omit' } }],
    relations: [
      {
        relation: 'owner',
        link: Option.some(rule(Condition.always)),
        unlink: Option.none(),
      },
    ],
  },
  decide,
)

describe('may on the wire', () => {
  it('encodes the bytes it always did, a row the rules cannot decide left out', () => {
    expect(JSON.stringify(Schema.encodeSync(MaySchema)(answered))).toBe(sent)
  })

  it('is read as a Verdict once decoded, the key left out being Unknown', () => {
    const may = Schema.decodeUnknownSync(MaySchema)(JSON.parse(sent))
    expect(May.answer(may, 'Update')).toEqual(Verdict.True())
    expect(May.answer(may, 'Delete')).toEqual(Verdict.False())
    expect(Schema.encodeSync(MaySchema)(may)).toEqual(JSON.parse(sent))
    const silent = { ...may, row: { Update: true } }
    expect(Verdict.isUnknown(May.answer(silent, 'Delete'))).toBe(true)
  })
})
