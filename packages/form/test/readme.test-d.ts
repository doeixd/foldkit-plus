// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Form, Input } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
  }),
)

const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })

const Rename = Form.make('Rename', Entity.input(Post, RenameInput))

const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(RenameInput) })
const Message = defineMessageUnion({ ...Slot.cases })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  onOut: submitted => model => ({
    model: { ...model, saved: [...model.saved, submitted.value] },
  }),
})

expectTypeOf(Rename.controls[0]!.key).toEqualTypeOf<'id' | 'title'>()
Rename.Message.Changed({ key: 'title', value: 'Hello' })
// @ts-expect-error "slug" is not a key of the form
Rename.Message.Changed({ key: 'slug', value: 'Hello' })

const Cms = Post.pipe(Entity.annotateMembers({ title: Input.of(Input.multiline()) }))
Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { id: Input.text() } })
// @ts-expect-error "slug" is not a key of the input
Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { slug: Input.text() } })

const load = RenameForm.helpers.fill({ id: 'p1', title: 'Hello' })
expectTypeOf(load).toExtend<Update.Step<typeof Model.Type, typeof Message.Type>>()
