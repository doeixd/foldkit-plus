/**
 * The toolbar's declaration: its state and Messages, and what shows until its
 * code arrives. The widgets themselves (`SearchField`, `Segmented`) and their
 * recipes live in `toolbarBody.ts`, a chunk of its own, so the page's first
 * load does not carry them (`test/bundle.test.ts` holds that).
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { Bundle } from 'foldkit-bundle'

export const Density = Schema.Literals(['compact', 'comfortable', 'spacious'])
export type Density = typeof Density.Type

/** The row heights a density draws, in pixels. */
export const rowHeights: Readonly<Record<Density, number>> = {
  compact: 28,
  comfortable: 32,
  spacious: 44,
}

export const ToolbarModel = Schema.Struct({
  /** Text any of a product's description, line or UPC must contain. */
  search: Schema.String,
  density: Density,
})
export type ToolbarModel = typeof ToolbarModel.Type

export const ToolbarMessage = defineMessageUnion({
  Typed: { text: Schema.String },
  Cleared: {},
  Picked: { density: Density },
  /** The chunk has arrived, so the toolbar is drawn by its widgets. */
  Loaded: {},
  CompletedFocus: {},
})
export type ToolbarMessage = typeof ToolbarMessage.Type

export const Toolbar = Bundle.lazy(
  {
    name: 'Toolbar',
    Model: ToolbarModel,
    Message: ToolbarMessage,
    init: () => ({ model: { search: '', density: 'comfortable' as const } }),
    // A plain field until the widgets load; typing in it asks for them, and the text is kept.
    while: Submodel.defineView<ToolbarModel, ToolbarMessage>((model, h) =>
      h.input([
        h.Type('search'),
        h.AriaLabel('Search products'),
        h.Value(model.search),
        h.OnInput(text => ToolbarMessage.Typed({ text })),
      ]),
    ),
  },
  () => import('./toolbarBody.js').then(chunk => chunk.body),
)
