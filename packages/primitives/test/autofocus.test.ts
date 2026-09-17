// @vitest-environment jsdom
/**
 * Autofocus Mount: the element is focused on insert and Focused is emitted.
 */
import { Effect } from 'effect'
import * as Mount from 'foldkit/mount'
import { describe, expect, it } from 'vitest'
import { Autofocus, Focused } from '../src/dom/index.js'
import { takeMessages } from './support.js'

describe('Autofocus', () => {
  it('focuses the element and emits Focused', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      // take(1): the one-shot stream stays open until unmount.
      const values = await Effect.runPromise(
        takeMessages(Autofocus().f(input, Mount.liveViewStateChanges), 1),
      )
      expect(values).toEqual([Focused.make({})])
      expect(document.activeElement).toBe(input)
    } finally {
      input.remove()
    }
  })
})
