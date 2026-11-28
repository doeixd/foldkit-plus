/**
 * Example 2 (module 2 of 3): Cross-list & nested-fold rules exported across modules (#638, #640)
 */
import { Arr, Bool, Eq, Expr, Null, Num } from '@doeixd/metakit'
import { CatalogBase } from './catalog.js'

/** Every research node belongs to an era present in `eras`. */
export const researchInKnownEra = Expr.in({ catalog: CatalogBase }, ({ catalog }) =>
  Arr.every(catalog.research, row => Arr.any(catalog.eras, era => Eq.is(row.era, era.ordinal))),
)

/** Every research node has a unique `id`. */
export const uniqueResearchIds = Expr.in({ catalog: CatalogBase }, ({ catalog }) =>
  Arr.every(catalog.research, row =>
    Eq.is(
      Arr.count(catalog.research, other => Eq.is(other.id, row.id)),
      1,
    ),
  ),
)

/** Every non-null `prereqId` references an existing research node and never itself. */
export const validPrerequisites = Expr.in({ catalog: CatalogBase }, ({ catalog }) =>
  Arr.every(catalog.research, row =>
    Bool.or(
      Null.isNull(row.prereqId),
      Bool.and(
        Eq.isNot(row.prereqId, row.id),
        Arr.any(catalog.research, dep => Eq.is(dep.id, row.prereqId)),
      ),
    ),
  ),
)

/** Every building's upgrade tiers have strictly positive costs (nested array-of-arrays). */
export const positiveBuildingTiers = Expr.in({ catalog: CatalogBase }, ({ catalog }) =>
  Arr.every(catalog.buildings, building => Arr.every(building.tiers, tier => Num.gt(tier.cost, 0))),
)
