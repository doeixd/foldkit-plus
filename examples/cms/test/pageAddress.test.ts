import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { addressFor } from '../src/routing/address.js'

describe('the page editor’s address', () => {
  it('names the open page and its selection, keeping who is looking', () => {
    expect(
      addressFor('/pages?as=edda', { page: Option.some('e1'), block: Option.some('n1') }),
    ).toBe('/pages?as=edda&page=e1&block=n1')
    expect(
      addressFor('/pages?as=edda&page=e1&block=n1#top', {
        page: Option.some('e2'),
        block: Option.none(),
      }),
    ).toBe('/pages?as=edda&page=e2#top')
    expect(
      addressFor('/pages?as=edda&page=e1&block=n1', { page: Option.none(), block: Option.none() }),
    ).toBe('/pages?as=edda')
  })
})
