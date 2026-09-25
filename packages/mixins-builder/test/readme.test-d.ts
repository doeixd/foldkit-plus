// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import type { Message, Model } from 'foldkit-builder'
import { Bundle } from 'foldkit-bundle'
import { Block, Composition, Content } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Style } from 'foldkit-mixins'
import type * as Submodel from 'foldkit/submodel'
import { expectTypeOf } from 'vitest'
import { BuilderSlots, BuilderView, type BuilderViewInputs } from '../src/index.js'
import { PageBuilder, Site } from './fixture.js'

{
  const PageEditing = BuilderView.define(PageBuilder)
  const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageEditing)))
  expectTypeOf(Drawn.view).toExtend<Submodel.View<Model, Message, BuilderViewInputs> | undefined>()
}

const PageEditing = BuilderView.define(PageBuilder).pipe(
  Style.attach(
    Style.forSlots(BuilderSlots)({
      root: Style.class('builder'),
      row: Style.class('builder-row'),
      canvas: Style.class('builder-canvas'),
    }),
  ),
)

const Page = Entity.define(
  'Page',
  Schema.Struct({ id: Schema.String, title: Schema.String, document: Composition.Document }),
)
const PageInput = Entity.input(
  Page,
  Schema.Struct({
    title: Page.fields.title.schema,
    document: Composition.Document.check(Composition.valid(Site)),
  }),
)

const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.inputWith(BuilderView.submodel(PageEditing)) },
})
expectTypeOf(PageForm.control('document').field(PageForm.initial).value).toEqualTypeOf<Model>()

const Quote = Block.define('Quote', {
  Props: Schema.Struct({
    text: Schema.String.annotate({ title: 'Quotation' }),
    ref: Schema.String,
  }),
  provides: [Content.Flow],
}).pipe(Block.annotate(BuilderView.controls({ text: Input.multiline(), ref: Input.hidden() })))
expectTypeOf(Quote.name).toEqualTypeOf<'Quote'>()
