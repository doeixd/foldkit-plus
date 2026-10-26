// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { FieldRecipes } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { image } from 'foldkit-form-recipes/image'
import { renderers as uiRecipes } from 'foldkit-form-recipes/ui'
import { Style } from 'foldkit-mixins'
import * as UiForm from 'foldkit-mixins-form/ui'
import { InputSlots, Recipes } from 'foldkit-mixins-ui'
import { FormView } from 'foldkit-mixins-form'
import { HashedAsset } from 'foldkit-media'
import { CalendarDate } from 'foldkit/calendar'

const due = FieldRecipes.date()
const startsAt = FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })

const Meeting = Form.make(
  'Meeting',
  Form.input(Schema.Struct({ due: CalendarDate, startsAt: Schema.String })),
  { inputs: { due: due.control, startsAt: startsAt.control } },
)

const View = FormView.define(Meeting, { renderers: renderers() })
void View

const input = Style.forSlots(InputSlots)(Recipes.Input())
const UiView = FormView.define(Meeting, {
  renderers: { ...UiForm.renderers({ input }), ...uiRecipes({ input }) },
})
void UiView

const Task = Entity.define('Task', Schema.Struct({ id: Schema.String, due: CalendarDate }))
void Task.pipe(Entity.annotateMembers({ due: Display.of(due.display) }))

const price = FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' })
const weight = FieldRecipes.decimal({ scale: 3 })
const discount = FieldRecipes.percent({ unit: 'fraction' })
void [price, weight, discount]

// @ts-expect-error money names how it is stored
FieldRecipes.money({ currency: 'EUR' })

// @ts-expect-error an instant names its zone
FieldRecipes.dateTime({ stored: 'instant' })

// An image, uploaded where it is chosen.
const cover = image({ id: 'cover' })
const Post = Form.make('Post', Form.input(Schema.Struct({ cover: HashedAsset })), {
  inputs: { cover: cover.control },
})
const PostView = FormView.define(Post)
void PostView

// An image key names its drop zone: two keys sharing a default would share ids.
// @ts-expect-error `id` is required
void image({})
