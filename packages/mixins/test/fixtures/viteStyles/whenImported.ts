import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { isOn, isLarge as big } from './predicate.js'
import type { ToggleInput } from './predicate.js'

const Contract = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
})

/** A rule, a named class and an inline declaration, each behind a predicate, one nested in another. */
export const Toggle = Style.forSlots(Contract)(
  {
    root: Style.compose(
      Style.self({ display: 'block' }),
      Style.whenInput<ToggleInput>(
        isOn,
        Style.compose(
          Style.self({ color: 'rgb(1, 2, 3)' }),
          Style.inline({ '--toggle-on': '1' }),
          Style.whenInput<ToggleInput>(
            big,
            Style.compose(Style.class('big'), Style.self({ fontSize: '2rem' })),
          ),
        ),
      ),
    ),
    label: Style.self({ cursor: 'pointer' }),
  },
  { name: 'Toggle' },
)

/** The same through a declaration that makes its own Slots. */
export const Declared = Style.slots({
  shell: Style.whenInput<ToggleInput>(big, Style.self({ gap: '8px' })),
})
