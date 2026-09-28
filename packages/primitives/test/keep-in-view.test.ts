// @vitest-environment jsdom
/**
 * KeepInView: what newly matches is scrolled into view, once, and nothing is
 * after unmount.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { describe, expect, it } from 'vitest'
import { KeepInView } from '../src/dom/index.js'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('KeepInView', () => {
  it('scrolls a newly marked element into view, and stops when unmounted', async () => {
    const list = document.createElement('ul')
    const rows = ['a', 'b', 'c'].map(id => {
      const row = document.createElement('li')
      row.id = id
      list.appendChild(row)
      return row
    })
    document.body.appendChild(list)
    const scrolled: string[] = []
    // jsdom lays nothing out, so it has no scrollIntoView of its own.
    const scroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    const [a, b, c] = rows
    a?.setAttribute('aria-selected', 'true')
    try {
      const fiber = Effect.runFork(
        Stream.runDrain(
          KeepInView({ selector: '[aria-selected="true"]' }).f(list, Mount.liveViewStateChanges),
        ),
      )
      await settle()
      a?.setAttribute('aria-selected', 'false')
      c?.setAttribute('aria-selected', 'true')
      await settle()
      // The same one marked again, or another attribute changing, is not a new mark.
      c?.setAttribute('aria-selected', 'true')
      c?.setAttribute('data-hovered', '')
      await settle()
      expect(scrolled).toEqual(['c'])

      await Effect.runPromise(Fiber.interrupt(fiber))
      c?.setAttribute('aria-selected', 'false')
      b?.setAttribute('aria-selected', 'true')
      await settle()
      expect(scrolled).toEqual(['c'])
    } finally {
      list.remove()
      Element.prototype.scrollIntoView = scroll
    }
  })
})
