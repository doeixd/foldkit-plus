/**
 * The reference interpreter against the shared conformance suite. The same
 * cases run against `foldkit-remote-drizzle` compiled to SQL; a body that means
 * two things fails in whichever of the two is wrong.
 */
import { describe, expect, it } from 'vitest'
import { cases, rows } from 'foldkit-entity/conformance'
import { evaluate } from '../src/index.js'

describe('foldkit-remote-server conforms to the query semantics', () => {
  it.each(cases.map(c => ({ ...c, name: c.what })))('$name', ({ body, input, expected }) => {
    const got = evaluate(body, input, rows).map(row => row.id)

    expect(got).toEqual(expected)
  })
})
