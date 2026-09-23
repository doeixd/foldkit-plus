/**
 * Compile-time contract of Press: a placement must handle `Pressed`, so a
 * press cannot be dropped by omission. Type-checked, not executed.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Press } from '../src/interaction/index.js'

const Button = Bundle.declare(Press.bundle, 'button')
const Model = Schema.Struct({ ...Button.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Button.cases })
const Page = Bundle.parent({ Model, Message })

// @ts-expect-error `onOut` is required: the placement says what a press does.
Page.at(Button, { args: { clickSuppressionMs: 50 } })

Page.at(Button, {
  args: { clickSuppressionMs: 50 },
  onOut: (out: Press.Pressed) => (model: Model) => {
    const kind: Press.PointerType = out.pointerType
    void kind
    return { model }
  },
})
