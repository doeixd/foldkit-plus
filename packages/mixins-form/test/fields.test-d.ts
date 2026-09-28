import { Style } from 'foldkit-mixins'
import { FieldSlots, FormView } from '../src/index.js'
import { Edit } from './fixture.js'

// Unknown keys in drawers and styles are refused.
FormView.fields(Edit, {
  drawers: {
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
