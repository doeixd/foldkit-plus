/**
 * Closed lookup table of every core operator descriptor (`CoreOpId -> Node.Op`)
 * and its fixed arity.
 *
 * Shared by `metakit/conformance` and `metakit/artifact` so adding a primitive
 * to `Node.CoreOpId` fails to compile until its descriptor and arity are here.
 */
import type * as Node from '../node.js'
import * as Arr from './arr.js'
import * as Bool from './bool.js'
import * as Eq from './eq.js'
import * as MulScaled from './mulScaled.js'
import * as Null from './null.js'
import * as Num from './num.js'
import * as Ord from './ord.js'
import * as Sets from './set.js'
import * as Str from './str.js'
import * as Time from './time.js'

/** Every primitive's descriptor: a new `CoreOpId` fails to compile until its operator is here. */
export const coreOps: { readonly [Id in Node.CoreOpId]: Node.Op<Id> } = {
  'bool.and': Bool.andOp,
  'bool.or': Bool.orOp,
  'bool.not': Bool.notOp,
  'eq.is': Eq.isOp,
  'eq.isNot': Eq.isNotOp,
  'eq.in': Eq.inOp,
  'eq.equals': Eq.equalsOp,
  'eq.among': Eq.amongOp,
  'null.isNull': Null.isNullOp,
  'null.coalesce': Null.coalesceOp,
  'str.lowerAscii': Str.lowerAsciiOp,
  'str.upperAscii': Str.upperAsciiOp,
  'str.trim': Str.trimOp,
  'str.concat': Str.concatOp,
  'str.lt': Str.ltOp,
  'str.lte': Str.lteOp,
  'str.gt': Str.gtOp,
  'str.gte': Str.gteOp,
  'ord.lt': Ord.ltOp,
  'ord.lte': Ord.lteOp,
  'ord.gt': Ord.gtOp,
  'ord.gte': Ord.gteOp,
  'num.add': Num.addOp,
  'num.sub': Num.subOp,
  'num.mul': Num.mulOp,
  'num.neg': Num.negOp,
  'num.mulScaled': MulScaled.mulScaledOp,
  'num.div': Num.divOp,
  'num.rem': Num.remOp,
  'time.addDays': Time.addDaysOp,
  'time.addMonths': Time.addMonthsOp,
  'time.daysBetween': Time.daysBetweenOp,
  'time.startOfMonth': Time.startOfMonthOp,
  'time.overlaps': Time.overlapsOp,
  'str.len': Str.lenOp,
  'str.startsWith': Str.startsWithOp,
  'str.endsWith': Str.endsWithOp,
  'str.contains': Str.containsOp,
  'arr.count': Arr.countOp,
  'arr.isEmpty': Arr.isEmptyOp,
  'arr.has': Arr.hasOp,
  'arr.append': Arr.appendOp,
  'arr.include': Arr.includeOp,
  'arr.exclude': Arr.excludeOp,
  'arr.move': Arr.moveOp,
  'set.union': Sets.unionOp,
  'set.intersect': Sets.intersectOp,
  'set.difference': Sets.differenceOp,
  'set.subset': Sets.subsetOp,
  'set.disjoint': Sets.disjointOp,
}

/** Expected argument count for each core primitive. */
export const coreArity: Readonly<Record<Node.CoreOpId, number>> = {
  'bool.and': 2,
  'bool.or': 2,
  'bool.not': 1,
  'eq.is': 2,
  'eq.isNot': 2,
  'eq.in': 2,
  'eq.equals': 2,
  'eq.among': 2,
  'null.isNull': 1,
  'null.coalesce': 2,
  'str.lowerAscii': 1,
  'str.upperAscii': 1,
  'str.trim': 1,
  'str.concat': 2,
  'str.lt': 2,
  'str.lte': 2,
  'str.gt': 2,
  'str.gte': 2,
  'ord.lt': 2,
  'ord.lte': 2,
  'ord.gt': 2,
  'ord.gte': 2,
  'num.add': 2,
  'num.sub': 2,
  'num.mul': 2,
  'num.neg': 1,
  'num.mulScaled': 3,
  'num.div': 4,
  'num.rem': 3,
  'time.addDays': 2,
  'time.addMonths': 2,
  'time.daysBetween': 2,
  'time.startOfMonth': 1,
  'time.overlaps': 4,
  'str.len': 1,
  'str.startsWith': 2,
  'str.endsWith': 2,
  'str.contains': 2,
  'arr.count': 1,
  'arr.isEmpty': 1,
  'arr.has': 2,
  'arr.append': 2,
  'arr.include': 2,
  'arr.exclude': 2,
  'arr.move': 4,
  'set.union': 2,
  'set.intersect': 2,
  'set.difference': 2,
  'set.subset': 2,
  'set.disjoint': 2,
}

/** True when `id` names a closed-set core operator. */
export const isCoreOpId = (id: string): id is Node.CoreOpId => Object.hasOwn(coreOps, id)
