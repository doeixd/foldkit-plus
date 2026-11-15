/**
 * `FollowTabStop` in a real browser: focus inside a roving container follows
 * its stop when an edit it did not see moves or removes it, and focus the
 * user took elsewhere stays there.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FollowTabStop } from '../src/dom/follow-tab-stop.js'
import { boot } from './treeToolbar.fixture.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Settles the Mount's microtasks and the observer's records. */
const settled = () => new Promise(resolve => setTimeout(resolve, 10))

it('moves focus to the stop as it moves or its row goes, and only while focus is inside', async () => {
  const container = document.createElement('ul')
  const make = (name: string, stop: boolean) => {
    const row = document.createElement('li')
    row.textContent = name
    row.tabIndex = stop ? 0 : -1
    container.append(row)
    return row
  }
  const a = make('a', true)
  const b = make('b', false)
  const c = make('c', false)
  const rows = [a, b, c]
  const outside = document.createElement('button')
  document.body.append(container, outside)
  const fiber = Effect.runFork(Stream.runDrain(FollowTabStop().f(container, liveViewStateChanges)))
  const stopAt = (row: HTMLElement) => {
    for (const each of rows) each.tabIndex = each === row ? 0 : -1
  }
  try {
    await settled()
    a.focus()
    // The stop moves by an edit elsewhere: focus goes with it.
    stopAt(b)
    await settled()
    expect(document.activeElement).toBe(b)
    // The focused row is removed and the stop goes to another: focus follows.
    b.remove()
    stopAt(c)
    await settled()
    expect(document.activeElement).toBe(c)
    // Focus taken outside, or left on nothing, stays where it went.
    outside.focus()
    stopAt(a)
    await settled()
    expect(document.activeElement).toBe(outside)
    a.focus()
    a.blur()
    await settled()
    stopAt(c)
    await settled()
    expect(document.activeElement).toBe(document.body)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

describe('in a tree whose row holds a toolbar, each a real roving primitive', () => {
  let handle: ReturnType<typeof boot> | undefined
  afterEach(() => {
    handle?.dispose()
    handle = undefined
  })

  it('takes the stop of the tree when the focused row goes, not the one the toolbar holds (B2c)', async () => {
    handle = boot(['a', 'b', 'c'], { recovery: false })
    await expect.poll(() => document.getElementById('c')).not.toBeNull()
    // The toolbar in row `a` has a stop of its own, before the tree's next stop in document order.
    expect(document.querySelector('[data-tool="x"]')!.getAttribute('tabindex')).toBe('0')
    await userEvent.click(document.getElementById('c')!)
    await expect.poll(() => document.activeElement).toBe(document.getElementById('c'))
    handle.ports.remove.send('c')
    await expect.poll(() => document.getElementById('c')).toBeNull()
    await expect.poll(() => document.activeElement).toBe(document.getElementById('b'))
  })
})
