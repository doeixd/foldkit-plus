/**
 * Export Matrix B: re-exports every metakit builder from Matrix A inside a
 * plain object without explicit annotations — any TS2883 / TS4023 fails `tsc -b`.
 */
import {
  Item,
  Tier,
  Usd,
  aggregateDef,
  exprDef,
  langDef,
  machineDef,
  opDef,
  policyDef,
  relationDef,
  transitionDef,
} from './exportMatrixA.js'

export const everything = {
  Usd,
  Tier,
  Item,
  exprDef,
  transitionDef,
  machineDef,
  policyDef,
  relationDef,
  aggregateDef,
  opDef,
  langDef,
}
