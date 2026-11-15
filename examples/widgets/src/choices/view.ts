/**
 * A single-choice Segmented (a radio group: one tab stop, the arrows move the
 * choice and focus together) beside one with `multiple` (pressed buttons, each
 * a tab stop), and a Slider that sends `onChange` for every step and `onCommit`
 * once the reader lets go; the readout draws the two values apart.
 */
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Recipes, Segmented, SegmentedSlots, Slider, SliderSlots } from 'foldkit-mixins-ui'
import { choicesStyle } from './style.js'
import { Message, SIZES, STYLES, type Model } from './app.js'

export const ChoicesSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  readout: Slot.make({ capability: Capability.Container }),
  line: Slot.make({ capability: Capability.Container }),
})

export const SegmentedStyle = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
export const SliderStyle = Style.forSlots(SliderSlots)(Recipes.Slider({}))
const layout = choicesStyle(ChoicesSlots)

/** The styles the section draws with, for the page's sheet. */
export const choicesStyles = [layout, SegmentedStyle, SliderStyle] as const

export const Choices = SlotView.forMessages<Message>()
  .define(ChoicesSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      Segmented.view(
        {
          id: 'size',
          label: 'Size',
          options: SIZES,
          pressed: [model.size],
          onPress: value => Message.PickedSize({ value }),
          style: SegmentedStyle,
        },
        h,
      ),
      Segmented.view(
        {
          multiple: true,
          label: 'Text style',
          options: STYLES,
          pressed: model.styles,
          onPress: value => Message.ToggledStyle({ value }),
          style: SegmentedStyle,
        },
        h,
      ),
      Slider.view(
        {
          id: 'volume',
          label: 'Volume',
          value: model.live,
          onChange: value => Message.Slid({ value }),
          onCommit: value => Message.Committed({ value }),
          description: 'Committed when you let go, or on each key press.',
          style: SliderStyle,
        },
        h,
      ),
      h.div(slots.readout.attrs([h.Role('status'), h.AriaLabel('Choices')]), [
        h.p(slots.line.attrs(), [`Size: ${model.size}`]),
        h.p(slots.line.attrs(), [
          `Styles: ${model.styles.length === 0 ? 'none' : model.styles.join(', ')}`,
        ]),
        h.p(slots.line.attrs(), [`Live: ${model.live} (steps ${model.moves})`]),
        h.p(slots.line.attrs(), [`Committed: ${model.committed} (commits ${model.commits})`]),
      ]),
    ]),
  )
  .pipe(Style.attach(layout))
