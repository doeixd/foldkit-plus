/**
 * What every widget's `configure` is made of. A widget writes its preset
 * type and its `configure` signature (with an explicit `<Outer>` on the view
 * it returns, since one generic `configure(view)` loses the Message type);
 * the merge is here, once.
 */

/** The call's `preset` option: absent from the type when no preset was declared. */
export type PresetOption<Names extends string> = [Names] extends [never]
  ? {}
  : { readonly preset?: Names }

/** What `configure` is given: options for every use, and named sets of them. */
export interface Presets<Preset, Names extends string> {
  /** Options every use starts from. */
  readonly base?: Preset
  /** Named options over `base`, chosen at a use with `preset`. */
  readonly presets?: Readonly<Record<Names, Preset>>
}

type Layer = Readonly<Record<string, unknown>>

/** The keys of `layer` that hold a value: an option given as `undefined` is not given. */
const given = (layer: Layer | undefined): Layer => {
  const out: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(layer ?? {})) {
    if (value !== undefined) out[key] = value
  }
  return out
}

const wordsOf = (layer: Layer): Layer =>
  typeof layer['words'] === 'object' && layer['words'] !== null
    ? given(layer['words'] as Layer)
    : {}

const mixinsOf = (layer: Layer): ReadonlyArray<unknown> =>
  Array.isArray(layer['mixins']) ? layer['mixins'] : []

/**
 * The options one use is drawn with: `base`, then the preset the call names,
 * then the call itself, later ones winning per option. Two options merge
 * instead: `mixins` concatenate in that order, and `words` merge key by key.
 * `preset` is taken off, since the widget's `view` does not know it.
 *
 * Throws for a preset name `config` lacks: the types refuse one, so it is a
 * name computed at run time, and drawing the base in its place would hide it.
 */
export const layered = <Options extends object>(
  config: Presets<object, string>,
  options: Options,
): Options => {
  const { preset, ...call } = given(options as Layer)
  const presets: Layer = config.presets ?? {}
  if (preset !== undefined && !(typeof preset === 'string' && Object.hasOwn(presets, preset))) {
    throw new Error(
      `configure: no preset named ${JSON.stringify(preset)}; declared: ${Object.keys(presets).join(', ') || 'none'}`,
    )
  }
  const layers = [
    given(config.base as Layer | undefined),
    given(preset === undefined ? undefined : (presets[preset as string] as Layer)),
    call,
  ]
  const words = Object.assign(Object.create(null), ...layers.map(wordsOf)) as Layer
  const mixins = layers.flatMap(mixinsOf)
  // The one seam: each layer is a subset of `Options` by the widget's own
  // preset type, which this helper cannot name.
  return {
    ...Object.assign(Object.create(null), ...layers),
    ...(Object.keys(words).length === 0 ? {} : { words }),
    ...(mixins.length === 0 ? {} : { mixins }),
  } as Options
}
