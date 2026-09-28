import { describe, expect, test } from 'vitest'

import { subscriptions } from '../src/subscription.js'

describe('subscriptions', () => {
  test('keeps the drag-and-drop entries and the mirror entry under distinct keys', () => {
    // Merged with `aggregate`, so a key collision throws instead of one entry
    // silently overwriting the other.
    expect(Object.keys(subscriptions).sort()).toEqual(
      ['autoScroll', 'dragEscape', 'dragKeyboard', 'dragPointer', 'kanban-board.mirror'].sort(),
    )
  })
})
