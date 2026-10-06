/**
 * Shipped recipes for the slot contracts this package publishes. Each is a
 * `Style.recipeFor` over those slots, so an application selects variants,
 * hands the pieces to `Style.forSlots`, and adjusts a recipe with `extend`
 * instead of forking it. Bases are in the `components` layer and variants in
 * `variants`, of `Layers.standard`.
 */
export { Badge, type BadgeOptions, type BadgeTone } from './badge.js'
export { Button } from './button.js'
export { Segmented } from './segmented.js'
export { Dialog } from './dialog.js'
export { Input, InputGroup, Textarea } from './field.js'
export { Tabs } from './tabs.js'
export { Checkbox, Switch } from './toggle.js'
