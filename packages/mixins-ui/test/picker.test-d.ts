/**
 * The Picker's view: `Value` is inferred from the options and holds the
 * value passed beside them, so a value no option has is refused, and
 * `onMessage` maps into the builder's Messages. Type-checked, not executed.
 */
import { Option } from 'effect'
import { Picker } from '../src/index.js'
import { h, message } from './fixture.js'

const model = Picker.init({ id: 'sort' })
const options = [
  { value: 'price', label: 'Lowest price' },
  { value: 'name', label: 'Name', description: 'A to Z' },
]

/** As an application's Model holds it. */
const sort: Option.Option<'price' | 'name'> = Option.some('price')

export const drawn = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    options: [
      { value: 'price', label: 'Lowest price' },
      { value: 'name', label: 'Name' },
    ],
    value: sort,
    placeholder: 'Sort by',
  },
  h,
)

export const widened = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    options,
    value: Option.some('anything'),
    placeholder: 'Sort by',
  },
  h,
)

export const unknownValue = Picker.view(
  {
    model,
    onMessage: () => message('Other'),
    label: 'Sort',
    options: [
      { value: 'price', label: 'Lowest price' },
      { value: 'name', label: 'Name' },
    ],
    // @ts-expect-error No option has the value 'rating'.
    value: Option.some('rating'),
    placeholder: 'Sort by',
  },
  h,
)

export const foreignMessage = Picker.view(
  {
    model,
    // @ts-expect-error The picker's Messages map into the builder's, not into another type.
    onMessage: () => 'Clicked',
    label: 'Sort',
    options,
    value: Option.none(),
    placeholder: 'Sort by',
  },
  h,
)

export const missingLabel = Picker.view(
  // @ts-expect-error A picker is named.
  {
    model,
    onMessage: () => message('Other'),
    options,
    value: Option.none(),
    placeholder: 'Sort by',
  },
  h,
)
