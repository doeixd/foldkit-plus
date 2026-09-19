import { Schema } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Sort } from '../src/index.js'

const PostSort = Sort.make(['title', 'created'])

describe('Sort', () => {
  it('turns a click on a header into the next state: up, down, then the server’s own order', () => {
    const up = PostSort.toggle(PostSort.none, 'title')
    expect(up).toEqual({ by: 'title', direction: 'asc' })
    const down = PostSort.toggle(up, 'title')
    expect(down).toEqual({ by: 'title', direction: 'desc' })
    expect(PostSort.toggle(down, 'title')).toBeNull()
    // Another column starts over.
    expect(PostSort.toggle(down, 'created')).toEqual({ by: 'created', direction: 'asc' })
  })

  it('is a schema for the Model and for the query’s input', () => {
    const decode = Schema.decodeUnknownSync(PostSort.Schema)
    expect(decode({ by: 'created', direction: 'desc' })).toEqual({
      by: 'created',
      direction: 'desc',
    })
    expect(decode(null)).toBeNull()
    expect(() => decode({ by: 'slug', direction: 'asc' })).toThrow()
    expectTypeOf<typeof PostSort.Schema.Type>().toEqualTypeOf<{
      readonly by: 'title' | 'created'
      readonly direction: 'asc' | 'desc'
    } | null>()
  })

  it('gives a drawn table every order, with its state and the Message a click sends', () => {
    const sort = PostSort.inputs({ by: 'title', direction: 'asc' }, next => ({
      _tag: 'Sorted',
      next,
    }))
    expect(sort.title).toEqual({
      direction: 'asc',
      message: { _tag: 'Sorted', next: { by: 'title', direction: 'desc' } },
    })
    expect(sort.created).toEqual({
      direction: undefined,
      message: { _tag: 'Sorted', next: { by: 'created', direction: 'asc' } },
    })
  })
})
