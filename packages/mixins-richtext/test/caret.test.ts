// @vitest-environment jsdom
/** The source editor's caret (§147): placed where the session opened it, then reported as it moves. */
import { Effect, Fiber, Option, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { caretMount, followCaret } from '../src/source.js'

describe('following a text area’s caret', () => {
  let field: HTMLTextAreaElement
  let reported: Array<number>
  beforeEach(() => {
    field = document.createElement('textarea')
    field.value = '# Title\n\nsome text\n'
    document.body.append(field)
    reported = []
  })
  afterEach(() => field.remove())

  it('puts the caret where the session opened it, with the field focused', () => {
    followCaret(field, 9, at => reported.push(at))()
    expect([field.selectionStart, field.selectionEnd]).toEqual([9, 9])
    expect(document.activeElement).toBe(field)
  })

  it.each(['selectionchange', 'select', 'input', 'keyup', 'mouseup'])(
    'reports a move announced by %s, once',
    event => {
      const release = followCaret(field, 0, at => reported.push(at))
      field.setSelectionRange(4, 4)
      field.dispatchEvent(new Event(event))
      field.dispatchEvent(new Event(event))
      expect(reported).toEqual([4])
      release()
    },
  )

  it('reports a selection’s focus, the end the writer moved', () => {
    const release = followCaret(field, 0, at => reported.push(at))
    field.setSelectionRange(2, 6, 'backward')
    field.dispatchEvent(new Event('keyup'))
    field.setSelectionRange(2, 7, 'forward')
    field.dispatchEvent(new Event('keyup'))
    expect(reported).toEqual([2, 7])
    release()
  })

  it('stops reporting once released', () => {
    followCaret(field, 0, at => reported.push(at))()
    field.setSelectionRange(4, 4)
    for (const event of ['selectionchange', 'select', 'input', 'keyup', 'mouseup']) {
      field.dispatchEvent(new Event(event))
    }
    expect(reported).toEqual([])
  })

  it('carries a move into the caller’s Message through the Mount', async () => {
    const action = caretMount(0, caret => ({ _tag: 'Moved', caret }) as const)
    const first = Effect.runFork(Stream.runHead(action.f(field, Mount.liveViewStateChanges)))
    // The fiber starts listening on its own turn; the move has to come after.
    await new Promise(resolve => setTimeout(resolve, 0))
    field.setSelectionRange(5, 5)
    field.dispatchEvent(new Event('keyup'))
    const head = await Effect.runPromise(Fiber.join(first))
    expect(head).toEqual(Option.some({ _tag: 'Moved', caret: 5 }))
  })
})
