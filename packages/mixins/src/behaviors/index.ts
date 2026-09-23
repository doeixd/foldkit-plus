/**
 * Ready-made Behaviors that own no state: each is a function of the view's
 * input and item context to attributes. Stateful ones (a roving tab stop, a
 * press, a dismiss layer) live in `foldkit-primitives` as a Bundle plus its
 * Behavior, because they need a Model slice.
 */
export * as Collection from './collection.js'
export * as Disclosure from './disclosure.js'
export * as FieldAssociation from './field-association.js'
export * as SpinValue from './spin-value.js'
export * as ToggleState from './toggle-state.js'
