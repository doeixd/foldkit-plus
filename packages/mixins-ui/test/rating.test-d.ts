/**
 * A read-only Rating takes no `onChange`, which it would never send; one that
 * takes a choice needs it. Type-checked, not executed.
 */
import { Option } from 'effect'
import { Rating } from '../src/index.js'
import { h, message } from './fixture.js'

export const shown = Rating.view(
  { id: 'average', label: 'Average', value: Option.some(4.3), readOnly: true },
  h,
)

export const taken = Rating.view(
  { id: 'stay', label: 'Your stay', value: Option.none(), onChange: () => message('Clicked') },
  h,
)

export const shownWithChange = Rating.view(
  // @ts-expect-error A read-only rating sends nothing, so it takes no onChange.
  {
    id: 'average',
    label: 'Average',
    value: Option.some(4),
    readOnly: true,
    onChange: () => message('Clicked'),
  },
  h,
)

export const takenWithoutChange = Rating.view(
  // @ts-expect-error A rating that takes a choice needs its onChange.
  { id: 'stay', label: 'Stay', value: Option.none() },
  h,
)
