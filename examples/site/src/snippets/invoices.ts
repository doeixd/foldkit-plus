export interface Invoice {
  readonly id: string
  readonly status: string
  readonly amount: number
}

export const invoices: ReadonlyArray<Invoice> = [
  { id: 'INV-001', status: 'Paid', amount: 250 },
  { id: 'INV-002', status: 'Pending', amount: 150 },
  { id: 'INV-003', status: 'Paid', amount: 350 },
  { id: 'INV-004', status: 'Overdue', amount: 450 },
]

export const money = (amount: number) => `$${amount.toFixed(2)}`
