import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import range from '../src/examples/pagination/range.js'

describe('the pagination examples', () => {
  it('keep the first row shown in view when a page holds more rows', () => {
    const state = Option.getOrThrow(range.state)
    // Page 3 of tens starts at row 21, which is on page 2 of twenties.
    const start = { page: 3, perPage: 10 }
    const larger = state.update(start, { _tag: 'Sized', perPage: 20 })
    expect(larger.model).toEqual({ page: 2, perPage: 20 })
  })
})
