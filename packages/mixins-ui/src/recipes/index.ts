/**
 * Shipped recipes for the slot contracts this package publishes. Each is a
 * `Style.recipeFor` over those slots, so an application selects variants,
 * hands the pieces to `Style.forSlots`, and adjusts a recipe with `extend`
 * instead of forking it. Bases are in the `components` layer and variants in
 * `variants`, of `Layers.standard`.
 */
export { Button } from './button.js'
export { Dialog } from './dialog.js'
export { Input, Textarea } from './field.js'
export { Tabs } from './tabs.js'
export { Checkbox, Switch } from './toggle.js'
