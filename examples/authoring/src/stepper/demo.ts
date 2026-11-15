/** A text trace of a hold on each button: the value, and the command that stops it at a bound. */
import { Repeat } from 'foldkit-primitives/interaction'
import { MAX, More, initial, update, type Model } from './app.js'

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model: Model = initial().model
  lines.push(`stepper: value=${model.value}`)

  let step = update(
    model,
    More.wrapper.make(
      Repeat.Message.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
    ),
  )
  model = step.model
  lines.push(`more pressed: value=${model.value} holding=${model.more.holding}`)
  for (let count = 2; count <= 7; count += 1) {
    step = update(
      model,
      More.wrapper.make(Repeat.Message.Elapsed({ generation: model.more.generation })),
    )
    model = step.model
    lines.push(`more step ${count}: value=${model.value}`)
  }
  model = update(
    model,
    More.wrapper.make(
      Repeat.Message.PointerUp({
        pointerId: 1,
        pointerType: 'mouse',
        modifiers: { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false },
      }),
    ),
  ).model
  lines.push(`more released: holding=${model.more.holding}`)

  const nearMax: Model = { ...model, value: MAX - 1 }
  step = update(
    nearMax,
    More.wrapper.make(
      Repeat.Message.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
    ),
  )
  lines.push(
    `at the bound: value=${step.model.value} commands=${(step.commands ?? []).map(command => command.name).join(', ')}`,
  )
  lines.push(`less is still idle: holding=${step.model.less.holding}`)
  return lines
}
