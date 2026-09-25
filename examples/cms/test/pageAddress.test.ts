import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { addressFor } from '../src/pageApp.js'

describe('the page editor’s address', () => {
  it('names the open page and its selection, keeping who is looking', () => {
    expect(addressFor('/pages?as=edda', Option.some('e1'), Option.some('n1'))).toBe(
      '/pages?as=edda&page=e1&block=n1',
    )
    expect(
      addressFor('/pages?as=edda&page=e1&block=n1#top', Option.some('e2'), Option.none()),
    ).toBe('/pages?as=edda&page=e2#top')
    expect(addressFor('/pages?as=edda&page=e1&block=n1', Option.none(), Option.none())).toBe(
      '/pages?as=edda',
    )
  })
})
