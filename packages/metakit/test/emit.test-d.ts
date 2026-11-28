import { Transition } from '@doeixd/metakit'

// @ts-expect-error an emitted record's _tag is its tag argument, not a payload field
Transition.emit('Saved', { _tag: 'Draft' })

// A nested _tag is an ordinary payload value.
Transition.emit('Saved', { nested: { _tag: 'Draft' } })
