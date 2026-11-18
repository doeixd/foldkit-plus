/**
 * The Picker's view: `Value` is inferred from the `choice`, so a value no
 * item has is refused, a choice of several is refused (the Sheet closes at a
 * pick), and `onMessage` and `clear` map into the builder's Messages.
 * Type-checked, not executed.
 */
import { Option } from 'effect'
import { Listbox, Picker } from '../src/index.js'
import { h, message } from './fixture.js'

const model = Picker.init({ id: 'sort' })
const Sort = Picker.one(['price', 'name'])

/** As an application's Model holds it. */
const sort: Option.Option<'price' | 'name'> = Option.some('price')

export const drawn = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    choice: Sort,
    option: item => ({ label: item === 'price' ? 'Lowest price' : 'Name' }),
    value: sort,
    placeholder: 'Sort by',
  },
  h,
)

export const clearable = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    choice: Sort,
    value: sort,
    clear: { onClear: message('Other') },
  },
  h,
)

export const unknownValue = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    choice: Sort,
    // @ts-expect-error No item of the choice is 'rating'.
    value: Option.some('rating'),
  },
  h,
)

export const unknownItem = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    choice: Sort,
    value: sort,
    // @ts-expect-error The choice has no item 'rating'.
    items: ['price', 'rating'],
  },
  h,
)

export const several = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    // @ts-expect-error The Sheet closes at a pick: a choice of several is the Listbox's.
    choice: Listbox.many(['price', 'name']),
    value: [],
  },
  h,
)

export const foreignMessage = Picker.view(
  {
    model,
    // @ts-expect-error The picker's Messages map into the builder's, not into another type.
    onMessage: () => 'Clicked',
    label: 'Sort',
    choice: Sort,
    value: sort,
  },
  h,
)

export const foreignClear = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    choice: Sort,
    value: sort,
    // @ts-expect-error The clear button sends a Message of the builder's, not a string.
    clear: { onClear: 'Cleared' },
  },
  h,
)

export const missingLabel = Picker.view(
  // @ts-expect-error A picker is named.
  {
    model,
    onMessage: () => message('Other'),
    choice: Sort,
    value: sort,
  },
  h,
)
