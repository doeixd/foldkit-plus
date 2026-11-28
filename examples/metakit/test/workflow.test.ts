import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Eq, Expr, Path, Verdict } from 'metakit'
import * as Graph from 'metakit/graph'
import * as Inspect from 'metakit/inspect'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import { DocumentMachine, DocumentPolicy, DocumentRow } from '../src/workflow/index.js'

const sampleDoc: DocumentRow = {
  id: 'doc-1',
  tenantId: 't1',
  ownerId: 'u1',
  title: 'Q4 Operating Plan',
  status: 'draft',
  review: { approvals: 0, requiredApprovals: 1 },
  billing: { billable: true, exportCount: 0 },
}

describe('Example 4: Multi-Tenant Document Workflow & Agent Affordances', () => {
  it('composes parent and lifted child machines with intents and affordances', () => {
    const aff1 = Machine.affordances(DocumentMachine, sampleDoc)
    expect(aff1.available).toContain('SubmitForReview')
    expect(aff1.available).toContain('ReviewApproved')
    expect(aff1.available).toContain('BillingExported')
    expect(aff1.disabled).toContain('Publish')

    const submitIntent = Machine.intent(DocumentMachine, 'SubmitForReview')
    expect(Verdict.isTrue(submitIntent.can({ state: sampleDoc }))).toBe(true)

    const [inReview] = DocumentMachine.update(sampleDoc, submitIntent.message({}))
    expect(inReview.status).toBe('in_review')

    const [approved] = DocumentMachine.update(inReview, { _tag: 'ReviewApproved', input: {} })
    expect(approved.review.approvals).toBe(1)

    const [published] = DocumentMachine.update(approved, { _tag: 'Publish', input: {} })
    expect(published.status).toBe('approved')

    const [exported] = DocumentMachine.update(published, { _tag: 'BillingExported', input: {} })
    expect(exported.billing.exportCount).toBe(1)
  })

  it('proves RBAC + ABAC policy implications in Z3 and evaluates partial principal checks', async () => {
    // Anyone who can approve can also view
    const approveImpliesView = await Effect.runPromise(
      Prove.policyImplies(DocumentPolicy, 'canApprove', 'canView'),
    )
    expect(Verdict.isTrue(approveImpliesView)).toBe(true)

    // Anyone who can edit an archived document is an admin (canEditArchived => canEdit)
    const archivedImpliesEdit = await Effect.runPromise(
      Prove.policyImplies(DocumentPolicy, 'canEditArchived', 'canEdit'),
    )
    expect(Verdict.isTrue(archivedImpliesEdit)).toBe(true)

    // Partial evaluation with only principal: viewer cannot approve any document
    expect(
      Verdict.isFalse(
        DocumentPolicy.can('canApprove', {
          principal: { userId: 'u2', tenantId: 't1', role: 'viewer' },
        }),
      ),
    ).toBe(true)
  })

  it('analyzes composed footprints, prunes static bindings, and exports agent JSON Schema', () => {
    const $ = Path.from(DocumentRow)
    const bindings = {
      headerTitle: $.title,
      approvalCount: $.review.approvals,
      exportCount: $.billing.exportCount,
      isPublished: Eq.is($.status, 'approved'),
    }

    const analysis = Graph.analyze(DocumentMachine, bindings)
    // BillingExported invalidates exportCount, NOT headerTitle or approvalCount
    expect(analysis.affectedBy.BillingExported).toEqual(['exportCount'])
    expect(analysis.affectedBy.ReviewApproved).toEqual(['approvalCount'])
    expect(analysis.affectedBy.Publish).toEqual(['isPublished'])

    // Static SSR pruning when title and status are already known
    const pruned = Graph.pruneStatic(bindings, { title: 'Q4 Operating Plan', status: 'draft' })
    expect(pruned.staticValues).toEqual({ headerTitle: 'Q4 Operating Plan', isPublished: false })
    expect(Object.keys(pruned.liveBindings)).toEqual(['approvalCount', 'exportCount'])

    // Annotated JSON Schema for AI agent tool calling (#639)
    const specs = Inspect.fieldSpecs(DocumentRow)
    const titleSpec = specs.find(s => s.name === 'title')
    expect(titleSpec?.title).toEqual(Option.some('Document Title'))
    expect(titleSpec?.description).toEqual(
      Option.some('Human-readable title shown in lists and exports'),
    )

    const schema = Inspect.toJsonSchema(DocumentRow)
    expect(schema['title']).toBe('Workspace Document')
    expect(Expr.rulesOf(DocumentRow).length).toBeGreaterThan(0)
  })
})
