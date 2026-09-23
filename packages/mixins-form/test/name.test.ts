/**
 * Every control carries its key as `name`, and a relation picker's
 * checkboxes carry `name` and `value`, so a plain form post carries the
 * drafts with scripts off.
 */
import { SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { FormView } from '../src/index.js'
import { Edit, options } from './fixture.js'

interface Node {
  readonly sel?: string
  readonly data?: {
    readonly props?: Readonly<Record<string, unknown>>
    readonly attrs?: Readonly<Record<string, unknown>>
  }
  readonly children?: ReadonlyArray<Node>
}

const all = (node: Node): ReadonlyArray<Node> => [node, ...(node.children ?? []).flatMap(all)]
const byId = (root: Node, id: string): Node | undefined =>
  all(root).find(node => node.data?.props?.id === id)

const model = Edit.bundle.init(undefined).model
const root = FormView.define(Edit)(
  { model, errors: model.errors, canSubmit: Edit.canSubmit(model), options },
  SlotView.inertBuilder(),
) as unknown as Node

describe('form controls are named by their key', () => {
  it.each(['title', 'body', 'status', 'rating', 'featured', 'editorId'])('%s', key => {
    expect(byId(root, `Edit-${key}`)?.data?.props?.name).toBe(key)
  })

  it('a relation picker names and values each checkbox', () => {
    const boxes = all(root).filter(
      node => node.data?.props?.type === 'checkbox' && node.data?.props?.name === 'tagIds',
    )
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.map(box => box.data?.props?.value)).toEqual(
      options.tagIds.map(option => option.value),
    )
  })
})
