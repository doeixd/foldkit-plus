import { Expr, Text, type OperatorDescriptor } from 'foldkit-entity'

const kernel: ReadonlySet<OperatorDescriptor> = new Set([
  Expr.add.descriptor,
  Expr.sub.descriptor,
  Text.startsWith.descriptor,
])

/** Whether metakit's own operations carry this operator's SQL, so no table implements it. */
export const isKernelOperator = (operator: OperatorDescriptor): boolean => kernel.has(operator)
