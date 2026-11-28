/**
 * Example 4: Multi-Tenant Document Workflow & Agent Affordances
 *
 * Exercises:
 * - `Domain.Text` (NUL-free strings so Z3 proves text-equality policies)
 * - `Machine.compose` + `Machine.lift` + `Machine.intent` + `Machine.affordances`
 * - `Policy.make` + `Prove.policyImplies` (RBAC + ABAC verification)
 * - `Graph.analyze` + `Graph.pruneStatic` (SSR pruning given known principal/flags)
 * - `Inspect.fieldSpecs` & `Inspect.toJsonSchema` (annotated agent tool schemas)
 */
import { Schema } from 'effect'
import { Bool, Eq, Expr, Num, Path, Str, Transition } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'
import * as Machine from '@doeixd/metakit/machine'
import * as Policy from '@doeixd/metakit/policy'

export const ReviewState = Schema.Struct({
  approvals: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  requiredApprovals: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
})

export const BillingState = Schema.Struct({
  billable: Schema.Boolean,
  exportCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

export const DocumentRow = Schema.Struct({
  id: Text.schema,
  tenantId: Text.schema,
  ownerId: Text.schema,
  title: Text.schema
    .annotate({
      title: 'Document Title',
      description: 'Human-readable title shown in lists and exports',
    })
    .pipe(Expr.refine($ => Num.gt(Str.len($), 0), { message: 'title is required' })),
  status: Schema.Literals(['draft', 'in_review', 'approved', 'archived']).annotate({
    title: 'Lifecycle Status',
    description: 'Current workflow stage',
  }),
  review: ReviewState,
  billing: BillingState,
}).annotate({
  title: 'Workspace Document',
  description: 'Multi-tenant document with review and billing sub-states',
})
export type DocumentRow = typeof DocumentRow.Type

export const Principal = Schema.Struct({
  userId: Text.schema,
  tenantId: Text.schema,
  role: Schema.Literals(['viewer', 'editor', 'reviewer', 'admin']),
})
export type Principal = typeof Principal.Type

/** Child machine: review approvals. */
const RecordApproval = Transition.make({
  state: ReviewState,
  input: Schema.Struct({}),
  when: ({ state }) => Num.lt(state.approvals, state.requiredApprovals),
  apply: ({ state }) => [Transition.add(state.approvals, 1)],
})

export const ReviewMachine = Machine.make({
  state: ReviewState,
  transitions: { Approved: RecordApproval },
})

/** Child machine: billing export counter. */
const RecordExport = Transition.make({
  state: BillingState,
  input: Schema.Struct({}),
  when: ({ state }) => state.billable,
  apply: ({ state }) => [Transition.add(state.exportCount, 1)],
})

export const BillingMachine = Machine.make({
  state: BillingState,
  transitions: { Exported: RecordExport },
})

/** Parent document transitions. */
const SubmitForReview = Transition.make({
  state: DocumentRow,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'draft'),
  apply: ({ state }) => [Transition.set(state.status, 'in_review')],
})

const Publish = Transition.make({
  state: DocumentRow,
  input: Schema.Struct({}),
  when: ({ state }) =>
    Expr.all(
      Eq.is(state.status, 'in_review'),
      Num.gte(state.review.approvals, state.review.requiredApprovals),
    ),
  apply: ({ state }) => [Transition.set(state.status, 'approved')],
})

const Archive = Transition.make({
  state: DocumentRow,
  input: Schema.Struct({}),
  when: ({ state }) => Bool.not(Eq.is(state.status, 'archived')),
  apply: ({ state }) => [Transition.set(state.status, 'archived')],
})

const $doc = Path.from(DocumentRow)

export const DocumentMachine = Machine.compose({
  state: DocumentRow,
  transitions: { SubmitForReview, Publish, Archive },
  children: {
    Review: Machine.lift($doc.review, ReviewMachine),
    Billing: Machine.lift($doc.billing, BillingMachine),
  },
})

/** Multi-tenant RBAC + ABAC authorization policy. */
export const DocumentPolicy = Policy.make({
  row: DocumentRow,
  principal: Principal,
  rules: ({ row, principal }) => {
    const sameTenant = Eq.is(row.tenantId, principal.tenantId)
    const isAdmin = Eq.is(principal.role, 'admin')
    const isOwner = Eq.is(row.ownerId, principal.userId)
    const notArchived = Bool.not(Eq.is(row.status, 'archived'))
    return {
      canView: sameTenant,
      canEdit: Expr.all(
        sameTenant,
        Expr.any(
          isAdmin,
          Expr.all(notArchived, Expr.any(Eq.is(principal.role, 'editor'), isOwner)),
        ),
      ),
      canApprove: Expr.all(
        sameTenant,
        Eq.is(row.status, 'in_review'),
        Expr.any(Eq.is(principal.role, 'reviewer'), isAdmin),
      ),
      canEditArchived: Expr.all(sameTenant, Eq.is(row.status, 'archived'), isAdmin),
    }
  },
})
