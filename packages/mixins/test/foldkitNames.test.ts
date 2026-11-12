import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { inertHtml } from 'foldkit/html'
import { EVENT_OF_TAG, eventNameOf, isUnknownHandler } from '../src/foldkitNames.js'

// Each builder takes its own arguments, but a handler only registers a closure:
// one stand-in that is a function, a message and a text at once fills any of them.
const anything = Object.assign(() => Option.none(), { _tag: 'Any' })

const builders = inertHtml as unknown as Record<
  string,
  (...args: ReadonlyArray<unknown>) => unknown
>

/** The DOM events Foldkit itself registers for `tag`, read from the vnode it draws. */
const registered = (tag: string): ReadonlyArray<string> => {
  const builder = builders[tag]
  if (builder === undefined) throw new Error(`foldkit/html has no ${tag}`)
  const vnode = inertHtml.div([builder(anything, anything) as never], []) as {
    readonly data?: { readonly on?: Record<string, unknown> }
  }
  return Object.keys(vnode.data?.on ?? {})
}

describe('EVENT_OF_TAG', () => {
  it.each(Object.entries(EVENT_OF_TAG))(
    '%s listens to the event Foldkit registers for it',
    (tag, event) => {
      expect(registered(tag)).toEqual([event])
    },
  )

  it('lists every handler builder Foldkit has but the Mount hooks', () => {
    const handlers = Object.keys(inertHtml).filter(name => /^On[A-Z]/.test(name))
    expect(handlers.filter(isUnknownHandler)).toEqual([])
    expect(new Set([...handlers, 'AllowDrop'])).toEqual(
      new Set([...Object.keys(EVENT_OF_TAG), 'OnMount', 'OnUnmount']),
    )
  })
})

describe('eventNameOf', () => {
  it('reads a custom event by its name and the Mount hooks as no event', () => {
    expect(eventNameOf('OnCustomEvent', { name: 'Grid-Select' })).toEqual(Option.some('gridselect'))
    expect(eventNameOf('OnMount', {})).toEqual(Option.none())
    expect(eventNameOf('OnUnmount', {})).toEqual(Option.none())
    expect(eventNameOf('Role', {})).toEqual(Option.none())
  })
})
