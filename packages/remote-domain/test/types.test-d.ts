/**
 * What `DomainRemote`'s bindings refuse at the type level: each rejection is
 * one `@ts-expect-error` of its own, beside the call it accepts, so a check
 * that fails open shows as an unused directive.
 */
import { DomainRemote } from '../src/index.js'
import { ProductEntity, Reserve, ShopApi } from './adapter/fixture.js'

const target = (input: { readonly id: string }) => input.id
const input = (input: { readonly quantity: number; readonly revision: number }) => ({
  quantity: input.quantity,
  revision: input.revision,
})
const refusals = {
  Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
  Invalid: () => DomainRemote.fail('invalid'),
  NotOwner: () => DomainRemote.forbid(),
  Missing: () => DomainRemote.fail('missing'),
} as const

// Accepted: the View the Api serves, by a numeric field.
DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'revision' })

// @ts-expect-error a View the Api does not serve
DomainRemote.view(ProductEntity, ShopApi, 'ProductList', { revision: 'revision' })

// @ts-expect-error a revision that is no field of the Entity
DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'version' })

// @ts-expect-error a revision that is a field, but not a number
DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'note' })

// Accepted: every Rejection mapped, each to the mutation's Refusal.
DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target,
  input,
  refusals,
  written: reply => reply,
})

// @ts-expect-error a command the Api does not serve
DomainRemote.command(Reserve, ShopApi, 'Restock', {
  target,
  input,
  refusals,
  written: reply => reply,
})

DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target,
  input,
  // @ts-expect-error a Rejection the command declares with no mapper
  refusals: {
    Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
    Invalid: () => DomainRemote.fail('invalid'),
    NotOwner: () => DomainRemote.forbid(),
  },
  written: reply => reply,
})

DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target,
  input,
  refusals: {
    ...refusals,
    // @ts-expect-error a refusal the mutation's Refusal does not hold
    Moved: () => DomainRemote.refuse({ _tag: 'Taken' }),
  },
  written: reply => reply,
})

// @ts-expect-error a declared write's binding without `written`
DomainRemote.command(Reserve, ShopApi, 'ReserveStock', { target, input, refusals })
