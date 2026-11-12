import { Capability, Event, Layers, Slot, Slots, Style } from 'foldkit-mixins'

/** A capability of the application's own, so a frozen contract registers it again. */
const Pressable = Capability.make('FrozenPressable', { extends: [Capability.Focusable] })

const Contract = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Pressable, events: [Event.Click], attributes: ['type'] }),
})

/** A Style with a rule, a named class and an inline declaration on one slot. */
export const Card = Style.forSlots(Contract)(
  {
    root: Style.compose(
      Style.class('card'),
      Style.self({ color: 'rgb(10, 20, 30)' }),
      Style.inline({ '--card-gap': '4px' }),
    ),
    button: Style.self({ cursor: 'pointer' }),
  },
  { name: 'Card', layer: Layers.standard.layer('app') },
)

/** Slots declared by their style, one with options of its own. */
export const Page = Style.slots(
  {
    shell: Style.self({ display: 'grid' }),
    form: Style.slot({ capability: Pressable, events: [Event.Submit] }, Style.self({ gap: '8px' })),
  },
  { layer: Layers.standard.layer('app') },
)

export const NARROW = '(max-width: 700px)'

export const tokens = { brand: { ink: 'var(--fk-brand-ink)' } }
