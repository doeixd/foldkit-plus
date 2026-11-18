import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Message,
  Model,
  OutMessage,
  init,
  update,
  type Config,
  type Node,
} from '../cascadeSelect.js'

// A node's recursive Schema, so the options are the Bundle's args as data.
const NodeSchema: Schema.Codec<Node> = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  children: Schema.optionalKey(Schema.Array(Schema.suspend((): Schema.Codec<Node> => NodeSchema))),
  disabled: Schema.optionalKey(Schema.Boolean),
})

const ConfigSchema: Schema.Codec<Config> = Schema.Struct({
  nodes: Schema.Array(NodeSchema),
  parents: Schema.optionalKey(Schema.Boolean),
  loop: Schema.optionalKey(Schema.Boolean),
  closeOnSelect: Schema.optionalKey(Schema.Boolean),
  inline: Schema.optionalKey(Schema.Boolean),
})

// `update(config)` builds closures over the options: once for each, not at each Message.
const updaters = new WeakMap<Config, ReturnType<typeof update>>()
const updaterOf = (config: Config): ReturnType<typeof update> => {
  const kept = updaters.get(config)
  if (kept !== undefined) return kept
  const made = update(config)
  updaters.set(config, made)
  return made
}

/**
 * A CascadeSelect's state for `foldkit-bundle`: whether it is open, the path
 * the keys are on and the chosen path, with `CascadeSelect.init`'s options
 * and the `config` the view takes as the args (`nodes` and the rest, the
 * same object given to `CascadeSelect.view`). The chosen path is the widget's
 * own value, so the Bundle holds it and reports `Changed` when it moves; a
 * parent that only reads `model.<field>.value` answers with `Bundle.ignore`.
 * `helpers.set(path)` sets the path from the parent and reports nothing. It
 * holds no view: draw the placed Model with `CascadeSelect.view`.
 */
export const CascadeSelect = Bundle.make('CascadeSelect', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the select draws, unique on the page. */
    id: Schema.String,
    /** The chosen path of ids, root first, at the start. */
    value: Schema.optionalKey(Schema.Array(Schema.String)),
    config: ConfigSchema,
  }),
  init: ({ id, value, config }) => ({
    model: init({ id, value, inline: config.inline }),
  }),
  update: (model, message, { config }) => {
    const result = updaterOf(config)(model, message)
    const moved = !Option.makeEquivalence(Schema.toEquivalence(Schema.Array(Schema.String)))(
      model.value,
      result.model.value,
    )
    return {
      model: result.model,
      ...(result.commands === undefined ? {} : { commands: result.commands }),
      ...(moved ? { outMessage: OutMessage.Changed({ value: result.model.value }) } : {}),
    }
  },
  helpers: ({ config }) => ({
    /** Sets the chosen path from the parent (an empty path clears it); what cannot be chosen is ignored, and nothing is reported. */
    set: (model: Model, path: ReadonlyArray<string>) => ({
      model: updaterOf(config)(model, Message.Set({ path })).model,
    }),
  }),
})
