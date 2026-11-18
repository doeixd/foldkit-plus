import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Chart } from 'foldkit-mixins-ui'

export const visitors = {
  categories: ['January', 'February', 'March', 'April', 'May', 'June'],
  series: [
    { name: 'Desktop', values: [186, 305, 237, 73, 209, 214] },
    { name: 'Mobile', values: [80, 200, 120, 190, 130, 140] },
  ],
}

export const Model = Schema.Struct({ chart: Chart.Model })
export const Message = defineMessageUnion({ GotChart: { message: Chart.Message } })

/** The state every chart example runs on: which point is lit, folded with `Chart.update`. */
export const state = {
  Model,
  Message,
  init: () => ({ model: { chart: Chart.init() } }),
  update: (model: typeof Model.Type, { message }: { readonly message: Chart.Message }) => ({
    model: modifyFields(model, { chart: chart => Chart.update(chart, message).model }),
  }),
}
