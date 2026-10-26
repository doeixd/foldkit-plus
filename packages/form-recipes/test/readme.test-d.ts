// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { FieldRecipes } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'
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

const Task = Entity.define('Task', Schema.Struct({ id: Schema.String, due: CalendarDate }))
void Task.pipe(Entity.annotateMembers({ due: Display.of(due.display) }))

// @ts-expect-error an instant names its zone
FieldRecipes.dateTime({ stored: 'instant' })
