/**
 * On a touch screen each form control that sets its own height keeps the
 * 44px a finger needs: the ladder's rung alone would leave it at 36px.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, it, vi } from 'vitest'
import {
  InputCopy,
  InputCopySlots,
  NumberField,
  NumberFieldSlots,
  OtpField,
  OtpFieldSlots,
  PasswordInput,
  PasswordInputSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
  TagsInput,
  TagsInputSlots,
} from '../src/index.js'
import { Option } from 'effect'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const number = Style.forSlots(NumberFieldSlots)(Recipes.NumberField({}))
const otp = Style.forSlots(OtpFieldSlots)(Recipes.OtpField({}))
const copy = Style.forSlots(InputCopySlots)(Recipes.InputCopy({}))
const tags = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}))
const password = Style.forSlots(PasswordInputSlots)(Recipes.PasswordInput({}))
const segmented = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const FLOOR = 44
const Model = Schema.Struct({})
type Message = { readonly _tag: 'Other' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + [number, otp, copy, tags, password, segmented].map(each => each.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'form-touch'
  document.body.appendChild(container)
  const other: Message = { _tag: 'Other' }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('page')],
          [
            h.div(
              [h.Id('number')],
              [
                NumberField.view(
                  {
                    id: 'n',
                    label: 'Servings',
                    value: Option.some(2),
                    onChange: () => other,
                    style: number,
                  },
                  h,
                ),
              ],
            ),
            h.div(
              [h.Id('otp')],
              [OtpField.view({ label: 'Code', value: '12', onChange: () => other, style: otp }, h)],
            ),
            h.div(
              [h.Id('copy')],
              [
                InputCopy.view(
                  { id: 'k', label: 'Key', value: 'sk', copied: false, onCopy: other, style: copy },
                  h,
                ),
              ],
            ),
            h.div(
              [h.Id('tags')],
              [
                TagsInput.view(
                  {
                    model: TagsInput.init({ id: 't' }),
                    onMessage: () => other,
                    label: 'Tags',
                    style: tags,
                  },
                  h,
                ),
              ],
            ),
            h.div(
              [h.Id('password')],
              [
                PasswordInput.view(
                  {
                    id: 'p',
                    label: 'Password',
                    value: '',
                    onInput: () => other,
                    visible: false,
                    onToggle: other,
                    style: password,
                  },
                  h,
                ),
              ],
            ),
            h.div(
              [h.Id('segmented')],
              [
                Segmented.view(
                  {
                    label: 'View',
                    options: [
                      { value: 'a', label: 'A' },
                      { value: 'b', label: 'B' },
                    ],
                    pressed: ['a'],
                    onPress: () => other,
                    style: segmented,
                  },
                  h,
                ),
              ],
            ),
          ],
        ),
    }),
  )
}

const find = (selector: string) => document.querySelector<HTMLElement>(selector)!
// A field's box is the row holding its control, which sets the height; the control alone may sit inside it.
const boxes = {
  'number field': () => find('#number [role="spinbutton"]').parentElement!,
  'number field stepper': () => find('#number button'),
  'otp cell': () => find('#otp [data-filled]'),
  'input copy': () => find('#copy input').parentElement!,
  tags: () => find('#tags input').parentElement!,
  'password toggle': () => find('#password button'),
  // The tray is one rung tall, its options inset inside it.
  'segmented tray': () => find('#segmented button').parentElement!,
}

it.each(Object.keys(boxes) as ReadonlyArray<keyof typeof boxes>)(
  'keeps the %s at the touch floor',
  async name => {
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    const handle = mount()
    try {
      await vi.waitFor(() => expect(document.querySelector('#segmented button')).not.toBeNull())
      const box = boxes[name]().getBoundingClientRect()
      // A stepper stands inside its field's border, so its height is the field's less two borders.
      if (name !== 'number field stepper') {
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(FLOOR - 0.5)
      }
      // The square ones are as wide as they are tall.
      if (name === 'otp cell' || name === 'password toggle' || name === 'number field stepper') {
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(FLOOR - 0.5)
      }
    } finally {
      handle.dispose()
    }
  },
)
