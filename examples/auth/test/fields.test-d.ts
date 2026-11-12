/**
 * Compile-time: the sign-in fields take the resumable builder's `OnInput`
 * with the page's own Message members, inferred from `rh` alone.
 * Type-checked, not executed.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Input, PasswordInput } from 'foldkit-mixins-ui'
import { Resume } from 'foldkit-ssr/client'
import { Message } from '../src/app.js'

declare const h: HtmlBuilder<Message>
const rh = Resume.builder(h)

const Foreign = defineMessageUnion({ Typed: { value: Schema.String } })
const field = { id: 'password', label: 'Password', value: '', visible: false } as const

export const password = PasswordInput.view(
  {
    ...field,
    onInput: rh.OnInput(Message.ChangedPassword),
    onToggle: Message.ToggledPassword(),
    attributes: { input: [rh.KeepTyped()] },
  },
  rh,
)

export const foreign = PasswordInput.view(
  {
    ...field,
    // @ts-expect-error a member of another Message union is not this page's.
    onInput: rh.OnInput(Foreign.Typed),
    onToggle: Message.ToggledPassword(),
  },
  rh,
)

export const toggle = PasswordInput.view(
  {
    ...field,
    // @ts-expect-error a member with no string field leaves nothing for the text to fill.
    onInput: rh.OnInput(Message.ToggledPassword),
    onToggle: Message.ToggledPassword(),
  },
  rh,
)

export const email = Input.view(
  {
    id: 'email',
    onInput: rh.OnInput(Message.ChangedEmail),
    draw: ({ input }) => rh.input([...input, rh.KeepTyped()]),
  },
  rh,
)
