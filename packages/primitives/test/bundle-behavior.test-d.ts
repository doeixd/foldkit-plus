/**
 * Compile-time contract of `BundleBehavior.fromBundle`: the view input must
 * hold the Bundle's Model at the declared field, and `send` only takes the
 * Bundle's own Messages. Type-checked, not executed.
 */
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Capability, Slot, Slots } from 'foldkit-mixins'
import { BundleBehavior } from '../src/interaction/bundle-behavior.js'
import { Press } from '../src/interaction/index.js'

const Button = Bundle.declare(Press.bundle, 'button')
const Message = defineMessageUnion({ ...Button.cases })
type Message = typeof Message.Type
const CardSlots = Slots.define({
  action: Slot.make({ capability: Capability.Interactive }),
})

interface CardInput {
  readonly button: Press.Model
}

const Activate = BundleBehavior.fromBundle(Button)(CardSlots)<CardInput, Message>({
  action: {
    requires: { capability: Capability.Interactive },
    attributes: ({ send }) => {
      const message: Message = send(Press.Message.Clicked({ detail: 1, shiftKey: false }))
      void message
      return []
    },
    events: Press.events(),
  },
})
void Activate

// @ts-expect-error the input must hold the placed slice at `declared.field`
BundleBehavior.fromBundle(Button)(CardSlots)<{}, Message>({ action: {} })
