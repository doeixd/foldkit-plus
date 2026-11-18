import { Button, Recipes, Steps, StepsSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Vertical, each step's `content` under it beside the line to the next. A
// horizontal stepper has no room under its steps and draws none.
export default example({
  title: 'Vertical, with content',
  slots: StepsSlots,
  recipe: Recipes.Steps,
  pins: { orientation: 'vertical' },
  view: ({ style, h }) =>
    Steps.view(
      {
        label: 'Set up the workspace',
        steps: [
          {
            title: 'Create the workspace',
            content: h.p([], ['Named Northwind, at northwind.example.com.']),
          },
          {
            title: 'Invite the team',
            description: 'Three of ten seats',
            content: h.div(
              [h.Style({ display: 'grid', gap: '0.5rem', justifyItems: 'start' })],
              [
                h.p([], ['Ada and Grace have joined. Alan has not answered yet.']),
                Button.view({ label: 'Send a reminder' }, h),
              ],
            ),
          },
          { title: 'Connect a domain', content: h.p([], ['Point a CNAME at the workspace.']) },
        ],
        current: 1,
        style,
      },
      h,
    ),
})
