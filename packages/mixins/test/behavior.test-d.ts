/**
 * Compile-time Behavior contract. Type-checked, not executed.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Behavior, SlotView } from '../src/index.js'
import { FieldSlots } from './fixture.js'
import type { TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly invalid: boolean
}

// `input` and `h` are contextually typed from the explicit forSlots generics.
const _validation = Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
  input: Behavior.slot({
    attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
  }),
})
void _validation

const FieldView = SlotView.forMessages<TestMessage>().define(
  FieldSlots,
  (input: FieldInput & { readonly label: string }, slots, h) =>
    h.div(slots.root.attrs([h.Value(input.label)])),
)

// @ts-expect-error `attach` fixes Input from the behavior, so a subset of the view's input is rejected.
FieldView.pipe(Behavior.attach(_validation))

Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
  // @ts-expect-error unknown slot key.
  missing: Behavior.slot({}),
})

Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
  // @ts-expect-error a hidden slot is internal, not publicly targetable.
  internals: Behavior.slot({}),
})

Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
  input: Behavior.slot({
    // @ts-expect-error unknown requires field.
    requires: { cap: 'x' },
  }),
})

// `item` is optional and typed as SlotItem in both attributes and mount.
Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
  input: Behavior.slot({
    attributes: ({ h, item }) => {
      const index: number | undefined = item?.index
      const id: string | undefined = item?.id
      void index
      void id
      // @ts-expect-error SlotItem has no `key` field.
      void item?.key
      return [h.Tabindex(item?.index ?? -1)]
    },
    mount: (_input, item) => {
      const count: number | undefined = item?.count
      void count
      return { name: 'm', f: () => null as never }
    },
  }),
})
