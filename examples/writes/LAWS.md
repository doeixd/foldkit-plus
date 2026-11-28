# Laws

What `Laws.check` says of every write `src/domain.ts` declares, written by
`test/laws.test.ts`: run it with `-u` after changing a write, and read the
difference.

```text
Product
  Draft -> Published   Publish   holds
  Published -> Draft   Revert    refused by publishedStaysPublished
      before   status: "published"
      input    status: "draft"
      after    status: "draft"
  Archived -> Draft    Revert    undeclared
  * -> InStock         Sell      enforced
  Archived                       unreached

Publish   x reservedWithinStock       kept: writes no member it reads
Publish   x publishedStaysPublished   kept: 1 row enumerated
Rename    x reservedWithinStock       kept: writes no member it reads
Rename    x publishedStaysPublished   kept: 3 rows enumerated
Restock   x reservedWithinStock       refused: Reserved stock cannot exceed the stock
    before   reserved: 0, stock: 0, revision: 0
    input    revision: 0, quantity: -1
    after    reserved: 0, stock: -1, revision: 1
Restock   x publishedStaysPublished   kept: 3 rows enumerated
Revert    x reservedWithinStock       kept: writes no member it reads
Revert    x publishedStaysPublished   refused: A published product does not go back to draft
    before   status: "published"
    input    status: "draft"
    after    status: "draft"
Sell      x reservedWithinStock       refused: Reserved stock cannot exceed the stock
    before   reserved: 0, stock: 0
    input    quantity: -1
    after    reserved: 0, stock: -1
Sell      x publishedStaysPublished   kept: 3 rows enumerated
Sell      x becomes:InStock           refused: The Product would not be InStock once written
    before   stock: 0, reserved: 0
    input    quantity: 0
    after    stock: 0, reserved: 0

1 entity, 4 states, 5 writes, 2 rules: 11 pairs, 7 kept, 4 refused, 0 undecided
```

## Evidence

What keeps each law against each write that can break it, as `Graph.toMarkdown`
says with the evidence `test/shop.ts` gathers: the check's records, the walk of
`Sell` and `Restock` through the server, and one line for the refused revert.

| Law | Transition | Evidence |
| --- | --- | --- |
| Product.reservedWithinStock | write:Restock | walked: 12 seeds of 15 steps from stocked, all reserved, empty |
| Product.reservedWithinStock | write:Sell | walked: 12 seeds of 15 steps from stocked, all reserved, empty |
| Product.publishedStaysPublished | write:Publish | enumerated |
| Product.publishedStaysPublished | write:Rename | enumerated |
| Product.publishedStaysPublished | write:Restock | enumerated |
| Product.publishedStaysPublished | write:Revert | runtime only: Laws.check finds Published -> Draft refused: the writer refuses such a revert where it commits, as Invalid publishedStaysPublished |
| Product.publishedStaysPublished | write:Sell | enumerated |
