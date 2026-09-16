/**
 * Placed views through the real `h.submodel`: a click in one placement's
 * view reaches only that placement, and an absent child renders nothing.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, it } from 'vitest'
import { Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotFirst = Link.wrapper('GotFirstMessage', CounterMessage)
const GotSecond = Link.wrapper('GotSecondMessage', CounterMessage)

const Model = Schema.Struct({ first: CounterModel, second: Schema.Option(CounterModel) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotFirst.cases, ...GotSecond.cases })
type Message = typeof Message.Type

const config = { args: { limit: 100, start: 0 }, onOut: () => (model: Model) => ({ model }) }
const First = Counter.at(Link.field<Model>()('first', GotFirst), config)
const Second = Counter.at(Link.optional<Model>()('second', GotSecond), config)

const update = (model: Model, message: Message) =>
  Option.getOrElse(
    Option.orElse(First.update(model, message), () => Second.update(model, message)),
    () => ({
      model,
    }),
  )

const scene = (model: Model, ...steps: Parameters<typeof Scene.scene<Model, Message>>[1][]) =>
  Scene.scene(
    {
      update,
      view: (model, h) =>
        h.main(
          [],
          [
            h.section([h.Id('first')], [First.view(model, h)]),
            h.section([h.Id('second')], [Second.view(model, h)]),
          ],
        ),
    },
    Scene.given(model),
    ...steps,
  )

describe('placed view', () => {
  it('routes a click in one placement to that placement only', () => {
    scene(
      { first: { count: 3, running: false }, second: Option.some({ count: 7, running: false }) },
      Scene.click('#first .counter'),
      Scene.expect(Scene.selector('#first .counter')).toHaveText('4'),
      Scene.expect(Scene.selector('#second .counter')).toHaveText('7'),
      Scene.click('#second .counter'),
      Scene.expect(Scene.selector('#second .counter')).toHaveText('8'),
    )
  })

  it('renders nothing while the child is absent', () => {
    scene(
      { first: { count: 0, running: false }, second: Option.none() },
      Scene.expect(Scene.selector('#second .counter')).toBeAbsent(),
      Scene.expect(Scene.selector('#first .counter')).toHaveText('0'),
    )
  })
})
