/**
 * Compile-time: a mixin cannot name a slot the field lacks, and a key route or
 * a Message the view's own `Message` does not cover is refused. Type-checked,
 * not executed.
 */
import { Option } from 'effect'
import { Behavior, Behaviors } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import { SearchField, SearchFieldSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

Behavior.forSlots(SearchFieldSlots)<unknown, never>({
  // @ts-expect-error the field publishes no results slot
  results: Behavior.slot({}),
})

const field = {
  id: 'find',
  label: 'Search',
  value: '',
  onInput: () => message('Other'),
  clear: { onClear: message('Clicked') },
} as const

export const plain = SearchField.view(field, h)

export const routed = SearchField.view(
  {
    ...field,
    routes: [
      Behaviors.Keys.route('Open', {
        on: [Behaviors.Keys.chord('ArrowDown')],
        handle: () => Option.some(message('Clicked')),
      }),
    ],
  },
  h,
)

export const foreignRoute = SearchField.view(
  {
    ...field,
    routes: [
      // @ts-expect-error a route cannot send a Message the view does not
      Behaviors.Keys.route('Open', {
        on: [Behaviors.Keys.chord('ArrowDown')],
        handle: () => Option.some(Foreign.SentElsewhere()),
      }),
    ],
  },
  h,
)

export const foreignClear = SearchField.view(
  {
    ...field,
    // @ts-expect-error onClear cannot be a Message the view does not send
    clear: { onClear: Foreign.SentElsewhere() },
  },
  h,
)
