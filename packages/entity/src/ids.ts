/** The brands an Entity, a Selection and a Selection page carry, apart so each module can read them. */
export const EntityTypeId: unique symbol = Symbol.for('foldkit-entity/Entity')
export type EntityTypeId = typeof EntityTypeId

export const SelectionTypeId: unique symbol = Symbol.for('foldkit-entity/Selection')
export type SelectionTypeId = typeof SelectionTypeId

export const SelectionPageTypeId: unique symbol = Symbol.for('foldkit-entity/SelectionPage')
export type SelectionPageTypeId = typeof SelectionPageTypeId
