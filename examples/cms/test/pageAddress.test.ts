import { describe, expect, it } from 'vitest'
import { addressFor } from '../src/pageApp.js'

describe('the page editor’s address', () => {
  it('names the open page and its selection, keeping who is looking', () => {
    expect(addressFor('/pages?as=edda', 'e1', 'n1')).toBe('/pages?as=edda&page=e1&block=n1')
    expect(addressFor('/pages?as=edda&page=e1&block=n1#top', 'e2', null)).toBe(
      '/pages?as=edda&page=e2#top',
    )
    expect(addressFor('/pages?as=edda&page=e1&block=n1', null, null)).toBe('/pages?as=edda')
  })
})
