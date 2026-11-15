/**
 * Slot attribute tokens. Ported from `effect-atom-jsx/src/View.ts` `Attribute`,
 * plus ARIA names the Foldkit plan lists.
 */
import * as MetadataToken from './metadataToken.js'

export type AttrToken<Name extends string = string> = MetadataToken.MetadataToken<
  'view.attribute',
  Name
>

export const is = (value: unknown): value is AttrToken =>
  MetadataToken.is(value) && value.kind === 'view.attribute'

export const make = <const Name extends string>(name: Name): AttrToken<Name> =>
  MetadataToken.make('view.attribute', name)

export const equals = (left: AttrToken, right: AttrToken): boolean => left.name === right.name

export const describe = (attr: AttrToken): { readonly name: string } => ({
  name: attr.name,
})

// Each `make` is marked pure so a page that reads none of these drops it: an unmarked call
// runs at load and stays in every bundle (seven tokens cost the counter 144 bytes brotli).
export const Role = /* @__PURE__ */ make('role')
export const AriaLabel = /* @__PURE__ */ make('aria-label')
export const AriaDescribedby = /* @__PURE__ */ make('aria-describedby')
export const AriaExpanded = /* @__PURE__ */ make('aria-expanded')
export const AriaSort = /* @__PURE__ */ make('aria-sort')
export const AriaSelected = /* @__PURE__ */ make('aria-selected')
export const AriaInvalid = /* @__PURE__ */ make('aria-invalid')
export const AriaPressed = /* @__PURE__ */ make('aria-pressed')
export const AriaChecked = /* @__PURE__ */ make('aria-checked')
export const AriaDisabled = /* @__PURE__ */ make('aria-disabled')
export const Disabled = /* @__PURE__ */ make('disabled')
export const Value = /* @__PURE__ */ make('value')
export const AriaLabelledby = /* @__PURE__ */ make('aria-labelledby')
export const AriaControls = /* @__PURE__ */ make('aria-controls')
export const AriaReadonly = /* @__PURE__ */ make('aria-readonly')
export const AriaRequired = /* @__PURE__ */ make('aria-required')
export const AriaCurrent = /* @__PURE__ */ make('aria-current')
export const AriaValuenow = /* @__PURE__ */ make('aria-valuenow')
