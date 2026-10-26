/**
 * The recipes' renderers under `foldkit-mixins-ui`'s Input Slot: each kind's
 * native input takes the Input style's class and keeps what the plain one
 * carries.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView, Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { InputSlots } from 'foldkit-mixins-ui'
import { Inert } from 'foldkit-mixins/testing'
import { CalendarDate } from 'foldkit/calendar'
import { expect, it } from 'vitest'
import { FieldRecipes } from '../src/index.js'
import { renderers } from '../src/ui.js'

const Filled = Schema.String.check(Schema.isMinLength(1))
const Profile = Form.make(
  'Profile',
  Form.input(
    Schema.Struct({
      born: CalendarDate,
      at: Filled,
      email: Filled,
      site: Filled,
      phone: Filled,
      password: Filled,
      title: Filled,
      slug: Filled,
    }),
  ),
  {
    inputs: {
      born: FieldRecipes.date().control,
      at: FieldRecipes.dateTime({ stored: 'local' }).control,
      email: FieldRecipes.email().control,
      site: FieldRecipes.url().control,
      phone: FieldRecipes.tel().control,
      password: FieldRecipes.password({ purpose: 'new' }).control,
      slug: FieldRecipes.slug('title').control,
    },
  },
)

it("draws every recipe's input with the Input style, keeping its name, type and state", () => {
  const View = FormView.define(Profile, {
    renderers: renderers({ input: Style.forSlots(InputSlots)({ input: Style.class('ui-input') }) }),
  })
  const root = View(
    { model: Profile.initial, errors: [], canSubmit: false },
    SlotView.inertBuilder(),
  )
  const drawn = Inert.byTag(root, 'input')
    .filter(input => Inert.value(input, 'name') !== 'title')
    .map(input => [Inert.value(input, 'name'), Inert.value(input, 'type'), Inert.classes(input)])
  expect(drawn).toEqual([
    ['born', 'date', ['ui-input']],
    ['at', 'datetime-local', ['ui-input']],
    ['email', 'email', ['ui-input']],
    ['site', 'url', ['ui-input']],
    ['phone', 'tel', ['ui-input']],
    ['password', 'password', ['ui-input']],
    ['slug', 'text', ['ui-input']],
  ])
  const email = Inert.byTag(root, 'input').find(input => Inert.value(input, 'name') === 'email')
  expect(['id', 'aria-required', 'autocomplete'].map(key => Inert.value(email, key))).toEqual([
    'Profile-email',
    'true',
    'email',
  ])
})
