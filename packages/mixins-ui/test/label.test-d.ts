/**
 * A field is required or optional, never both. Type-checked, not executed.
 */
import { Label } from '../src/index.js'
import { h } from './fixture.js'

export const required = Label.view({ for: 'a', text: 'Email', required: true }, h)
export const optional = Label.view({ for: 'a', text: 'Email', optional: true }, h)

// @ts-expect-error a field is not both required and optional.
export const both = Label.view({ for: 'a', text: 'Email', required: true, optional: true }, h)

// @ts-expect-error the marker's words are text, not a function.
export const word = Label.view({ for: 'a', text: 'Email', words: { required: () => '*' } }, h)

// @ts-expect-error `loading` is no state of a label.
export const unknown = Label.view({ for: 'a', text: 'Email', loading: true }, h)
