import type { HtmlBuilder } from 'foldkit/html'
import type { ReactNode } from 'react'
import { expectTypeOf } from 'vitest'
import { ReactComponent } from '../src/index.js'

type Message = { readonly _tag: 'Picked'; readonly value: string } | { readonly _tag: 'Closed' }
declare const h: HtmlBuilder<Message>
declare const Closed: () => Message
declare const Picked: (fields: { readonly value: string }) => Message

interface Props {
  readonly value: string
  readonly onPick?: (value: string, index: number) => void
  readonly shouldClose?: () => boolean
  readonly renderItem?: (item: string) => ReactNode
}
declare const Picker: (props: Props) => ReactNode

const Island = ReactComponent.define(Picker, { events: ['onPick'] })

Island.view(
  {
    props: { value: 'a', renderItem: item => item, shouldClose: () => true },
    messages: {
      onPick: (value, index) => {
        expectTypeOf(value).toEqualTypeOf<string>()
        expectTypeOf(index).toEqualTypeOf<number>()
        return Picked({ value })
      },
    },
    errorBoundary: { fallback: () => null, toMessage: Closed },
  },
  h,
)

// A callback that returns a value is a computation prop, not an event.
// @ts-expect-error
ReactComponent.define(Picker, { events: ['shouldClose'] })

// Non-function props cannot be events.
// @ts-expect-error
ReactComponent.define(Picker, { events: ['value'] })

// Required props stay required.
// @ts-expect-error
Island.view({ props: {} }, h)

// A declared event is configured through `messages`, not `props`.
Island.view(
  {
    props: {
      value: 'a',
      // @ts-expect-error
      onPick: () => {},
    },
  },
  h,
)

Island.view(
  {
    props: { value: 'a' },
    messages: {
      // @ts-expect-error
      onPick: () => ({ _tag: 'Unknown' }),
    },
  },
  h,
)

// An undeclared prop has no message mapper.
Island.view(
  {
    props: { value: 'a' },
    messages: {
      // @ts-expect-error
      renderItem: Closed,
    },
  },
  h,
)

// A component whose props are all optional needs no `props`.
declare const Plain: (props: { readonly onClose?: () => void }) => ReactNode
ReactComponent.define(Plain, { events: ['onClose'] }).view({ messages: { onClose: Closed } }, h)
