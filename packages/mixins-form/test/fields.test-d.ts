import { Style } from 'foldkit-mixins'
import { FieldSlots, FormView } from '../src/index.js'
import { Edit } from './fixture.js'

// Unknown keys in overrides and styles are refused.
FormView.fields(Edit, {
  overrides: {
    // @ts-expect-error no key "headline"
    headline: (input, h) => h.div([], []),
  },
})
FormView.fields(Edit, {
  styles: {
    // @ts-expect-error no key "headline"
    headline: Style.forSlots(FieldSlots)({ root: Style.class('titled') }),
  },
})
FormView.fields(Edit, {
  attrs: {
    // @ts-expect-error no key "headline"
    headline: { type: 'email' },
  },
})
