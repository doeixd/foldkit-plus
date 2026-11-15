/// <reference types="@vitest/browser-playwright" />
/**
 * Where focus goes when an overlay closes and its opener is gone, on
 * hand-built DOM in a real browser (jsdom moves no focus): `FocusReturn` on an
 * overlay whose own restoring is elsewhere, and `FocusScope`, which restores
 * itself, by the same rules.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, describe, expect, it } from 'vitest'
import { FocusRecovery, FocusReturn, FocusScope } from '../src/dom/index.js'

const fibers: Array<Fiber.Fiber<unknown>> = []
afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => Effect.runPromise(Fiber.interrupt(fiber))))
  document.body.replaceChildren()
})

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 30))

/** Runs a Mount on an element; the returned function releases it. */
const run = async (stream: Stream.Stream<never>) => {
  const fiber = Effect.runFork(Stream.runDrain(stream))
  fibers.push(fiber)
  await settle()
  return async () => {
    await Effect.runPromise(Fiber.interrupt(fiber))
    await settle()
  }
}

const returning = (element: Element) =>
  run(FocusReturn().f(element, Mount.liveViewStateChanges) as Stream.Stream<never>)
const scoped = (element: Element) =>
  run(
    FocusScope({ contain: false, restore: true, initialFocus: null }).f(
      element,
      Mount.liveViewStateChanges,
    ) as Stream.Stream<never>,
  )
const recovering = (element: Element, fallback: Record<string, ReadonlyArray<string>>) =>
  run(
    FocusRecovery({ fallback: fallback as never }).f(
      element,
      Mount.liveViewStateChanges,
    ) as Stream.Stream<never>,
  )

const page = (html: string) => {
  document.body.innerHTML = html
  return (id: string) => document.getElementById(id) as HTMLElement
}

const rows = `<div id="list" data-fk-focus-owner>
  ${['a', 'b', 'c']
    .map(
      key =>
        `<button id="row-${key}" data-fk-focus-part="row" data-fk-focus-key="${key}">${key}</button>`,
    )
    .join('')}
</div>`

/**
 * The overlay opens from `opener`: focus is on the opener, and with `early`
 * moves inside before the Mount runs, as a Command that shows a dialog does;
 * a `FocusScope` moves it itself.
 */
const open = (by: (id: string) => HTMLElement, opener: string, early = true) => {
  by(opener).focus()
  const overlay = document.createElement('div')
  overlay.id = 'overlay'
  overlay.innerHTML = '<button id="inside">inside</button>'
  document.body.append(overlay)
  if (early) by('inside').focus()
  return overlay
}

describe.each([
  ['FocusReturn', returning, true],
  ['FocusScope', scoped, false],
] as const)('%s', (_name, mountOn, early) => {
  const closeAfter = async (
    by: (id: string) => HTMLElement,
    opener: string,
    change: () => void,
  ) => {
    const overlay = open(by, opener, early)
    const release = await mountOn(overlay)
    by('inside').focus()
    change()
    overlay.remove()
    await release()
  }

  it('returns to the opener when it is still there', async () => {
    const by = page('<button id="before">before</button><button id="opener">open</button>')
    await closeAfter(by, 'opener', () => {})
    expect(document.activeElement).toBe(by('opener'))
  })

  it('goes to the element drawn again with the opener id', async () => {
    const by = page('<button id="before">before</button><button id="opener">open</button>')
    await closeAfter(by, 'opener', () => {
      by('opener').remove()
      document.body.insertAdjacentHTML('beforeend', '<button id="opener">open again</button>')
    })
    expect(document.activeElement).toBe(by('opener'))
    expect(by('opener').textContent).toBe('open again')
  })

  it("goes to the opener's next neighbour by its owner's fallback", async () => {
    const by = page(rows + '<button id="top">top</button>')
    const stop = await recovering(by('list'), { row: ['next', 'previous'] })
    await closeAfter(by, 'row-b', () => by('row-b').remove())
    expect(document.activeElement).toBe(by('row-c'))
    await stop()
  })

  it("goes to the previous neighbour when the next is gone too, in its owner's order", async () => {
    const by = page(rows + '<button id="top">top</button>')
    const stop = await recovering(by('list'), { row: ['next', 'previous'] })
    await closeAfter(by, 'row-b', () => {
      by('row-b').remove()
      by('row-c').remove()
    })
    expect(document.activeElement).toBe(by('row-a'))
    await stop()
  })

  it('uses the steps of its owner, not a default order', async () => {
    const by = page(rows + '<button id="top">top</button>')
    const stop = await recovering(by('list'), { row: ['previous', 'next'] })
    await closeAfter(by, 'row-b', () => by('row-b').remove())
    expect(document.activeElement).toBe(by('row-a'))
    await stop()
  })

  it('goes to the first element of the page when nothing else is left of the opener', async () => {
    const by = page('<button id="top">top</button><button id="opener">open</button>')
    await closeAfter(by, 'opener', () => by('opener').remove())
    expect(document.activeElement).toBe(by('top'))
  })

  it('goes to the layer below when the opener is gone, before the page', async () => {
    const by = page('<button id="top">top</button>')
    const lower = document.createElement('div')
    lower.innerHTML = '<button id="lower-first">lower</button><button id="lower-opener">o</button>'
    document.body.append(lower)
    by('top').focus()
    const releaseLower = await scoped(lower)
    by('lower-opener').focus()
    const upper = document.createElement('div')
    upper.innerHTML = '<button id="inside">inside</button>'
    document.body.append(upper)
    const release = await mountOn(upper)
    by('inside').focus()
    by('lower-opener').remove()
    upper.remove()
    await release()
    expect(document.activeElement).toBe(by('lower-first'))
    await releaseLower()
  })
})

describe('FocusReturn', () => {
  it('leaves focus where the user put it', async () => {
    const by = page('<button id="top">top</button><button id="opener">open</button>')
    const overlay = open(by, 'opener')
    const release = await returning(overlay)
    by('inside').focus()
    by('top').focus()
    overlay.remove()
    await release()
    expect(document.activeElement).toBe(by('top'))
  })

  it("follows focus in a frame's document too, from its first overlay on", async () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const doc = frame.contentDocument!
    doc.body.innerHTML =
      '<button id="top">top</button><button id="opener">open</button><div id="first"></div>'
    // The frame's document is followed from its first overlay.
    await (
      await returning(doc.getElementById('first')!)
    )()
    const by = (id: string) => doc.getElementById(id) as HTMLElement
    by('opener').focus()
    const overlay = doc.createElement('div')
    overlay.innerHTML = '<button id="inside">inside</button>'
    doc.body.append(overlay)
    by('inside').focus()
    const release = await returning(overlay)
    overlay.remove()
    await release()
    expect(doc.activeElement).toBe(by('opener'))
  })

  it.each([
    ['plaintext-only editable text', '<div id="opener" contenteditable="plaintext-only">x</div>'],
    ['editable text with an empty value', '<div id="opener" contenteditable="">x</div>'],
    ["a details' summary", '<details><summary id="opener">more</summary></details>'],
  ])('returns to an opener of %s', async (_kind, opener) => {
    const by = page('<button id="top">top</button>' + opener)
    const overlay = open(by, 'opener')
    const release = await returning(overlay)
    overlay.remove()
    await release()
    expect(document.activeElement).toBe(by('opener'))
  })

  it('moves no focus on mount', async () => {
    const by = page('<button id="opener">open</button>')
    const overlay = open(by, 'opener')
    by('inside').focus()
    await returning(overlay)
    expect(document.activeElement).toBe(by('inside'))
  })
})

describe('FocusScope', () => {
  it('leaves focus the user moved on when its opener is gone', async () => {
    const by = page(
      '<button id="top">top</button><button id="opener">open</button><input id="search" />',
    )
    const overlay = open(by, 'opener', false)
    const release = await scoped(overlay)
    expect(document.activeElement).toBe(by('inside'))
    by('opener').remove()
    by('search').focus()
    overlay.remove()
    await release()
    expect(document.activeElement).toBe(by('search'))
  })

  it('opened with focus on nothing, gives back nothing an earlier focus left behind', async () => {
    const by = page('<button id="top">top</button><input id="earlier" />')
    by('earlier').focus()
    by('earlier').blur()
    expect(document.activeElement).toBe(document.body)
    const overlay = document.createElement('div')
    overlay.innerHTML = '<button id="inside">inside</button>'
    document.body.append(overlay)
    const release = await scoped(overlay)
    expect(document.activeElement).toBe(by('inside'))
    overlay.remove()
    await release()
    expect(document.activeElement).toBe(document.body)
  })
})
