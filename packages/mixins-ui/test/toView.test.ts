import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { view as inputView } from '@foldkit/ui/input'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import { view as textareaView } from '@foldkit/ui/textarea'
import { Behavior, Style } from 'foldkit-mixins'
import {
  Input,
  InputSlots,
  RadioGroup,
  RadioGroupSlots,
  Textarea,
  TextareaSlots,
  type ResolvedInput,
} from '../src/index.js'
import {
  attributeOf,
  classValue,
  diagnosticFrom,
  h,
  type Mixins,
  type TestMessage,
} from './fixture.js'

const drawn = h.div([], [])

/** Draws an Input through `Input.toView`, returning what `draw` received. */
const drawInput = (mixins: Mixins, input?: unknown): ResolvedInput<TestMessage> => {
  let received: Option.Option<ResolvedInput<TestMessage>> = Option.none()
  const html = inputView(
    {
      id: 'email',
      value: 'a',
      toView: Input.toView(mixins, { h, input }, resolved => {
        received = Option.some(resolved)
        return drawn
      }),
    },
    h,
  )
  expect(html).toBe(drawn)
  return Option.getOrThrow(received)
}

describe('toView', () => {
  it('hands draw the component bundles with the Mixins applied', () => {
    const FieldStyle = Style.forSlots(InputSlots)({ input: Style.class('field') })
    const resolved = drawInput([FieldStyle.mixin])
    expect(classValue(resolved.input)).toBe('field')
    expect(attributeOf(resolved.input, 'Value')?.value).toBe('a')
    expect(attributeOf(resolved.label, 'For')?.value).toBe('email')
  })

  it('gives an input-driven Mixin the input, and nothing when it is left out', () => {
    const Flagged = Style.forSlots(InputSlots)({
      input: Style.whenInput<unknown>(input => input === 'flagged', Style.class('flagged')),
    })
    expect(classValue(drawInput([Flagged.mixin], 'flagged').input)).toBe('flagged')
    expect(classValue(drawInput([Flagged.mixin]).input)).toBeUndefined()
  })

  it('fits a Submodel component, drawing every item through its slot', () => {
    const Plans = RadioGroupUi.create<'free' | 'pro'>()
    const OptionStyle = Style.forSlots(RadioGroupSlots)({ option: Style.class('plan') })
    let classes: ReadonlyArray<string | undefined> = []
    Scene.scene(
      {
        update: Plans.update,
        view: (model, h) =>
          Plans.view(
            model,
            {
              options: ['free', 'pro'],
              selectedValue: Option.none(),
              ariaLabel: 'Plan',
              toView: RadioGroup.toView([OptionStyle.mixin], { h }, ({ group, options }) => {
                classes = options.map(option => classValue(option.option))
                return h.div(group, [])
              }),
            },
            h,
          ),
      },
      Scene.given(RadioGroupUi.init({ id: 'plan' })),
    )
    expect(classes).toEqual(['plan', 'plan'])
  })
})

describe('Textarea bundle', () => {
  // `ResolvedTextarea` types the bundle for `h.textarea`, which takes no
  // `InnerHTML`; this is the refusal that keeps that type true.
  it('refuses InnerHTML from a Mixin', () => {
    const Inject = Behavior.forSlots(TextareaSlots)<undefined, TestMessage>({
      textarea: Behavior.slot({ attributes: () => [h.InnerHTML('<b>x</b>')] }),
    })
    const diagnostic = diagnosticFrom(() =>
      textareaView(
        {
          id: 'bio',
          toView: Textarea.toView([Inject.mixin], { h }, ({ textarea }) => h.textarea(textarea)),
        },
        h,
      ),
    )
    expect(diagnostic?.code).toBe('mixins:structural-override')
  })
})
