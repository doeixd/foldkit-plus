import { describe, expect, test } from 'vitest'

import { subscriptions } from '../src/main.js'

describe('subscriptions', () => {
  test('keeps both calls\u2019 reads and one retain entry, losing no key to the merge', () => {
    // Retention is the domain's, so the second call's `retain` is left out in
    // `main.ts`; any other shared key would silently overwrite here instead.
    expect(Object.keys(subscriptions).sort()).toEqual(
      [
        'posts.read',
        'posts.live',
        'post.read',
        'post.live',
        'retain',
        'stats.read',
        'stats.live',
      ].sort(),
    )
  })
})
