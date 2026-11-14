# Laws

What `Laws.check` says of every write `src/domain.ts` declares, written by
`test/laws.test.ts`: run it with `-u` after changing a write, and read the
difference.

```text
Product
  Draft -> Published   Publish   holds
  Published -> Draft   Revert    refused by publishedStaysPublished
  Archived -> Draft    Revert    undeclared
  * -> InStock         Sell      enforced
  Archived                       unreached

Publish   x reservedWithinStock       kept: writes no member it reads
Publish   x publishedStaysPublished   kept: 1 row enumerated
Rename    x reservedWithinStock       kept: writes no member it reads
Rename    x publishedStaysPublished   kept: 3 rows enumerated
Restock   x reservedWithinStock       undecided: stock is incremented
Restock   x publishedStaysPublished   kept: 3 rows enumerated
Revert    x reservedWithinStock       kept: writes no member it reads
Revert    x publishedStaysPublished   refused: from {"status":"published"} it leaves {"status":"draft"}
Sell      x reservedWithinStock       undecided: stock is incremented
Sell      x publishedStaysPublished   kept: 3 rows enumerated
Sell      x becomes:InStock           undecided: stock is incremented
```

## Evidence

What keeps each law against each write that can break it, as `Module.toMarkdown`
says with the evidence `test/shop.ts` gathers: the check's records, the walk of
`Sell` and `Restock` through the server, and one line for the refused revert.

| Law | Transition | Evidence |
| --- | --- | --- |
| Product.reservedWithinStock | write:Restock | walked: 12 seeds of 15 steps from stocked, all reserved, empty |
| Product.reservedWithinStock | write:Sell | walked: 12 seeds of 15 steps from stocked, all reserved, empty |
| Product.publishedStaysPublished | write:Publish | enumerated |
| Product.publishedStaysPublished | write:Revert | runtime only: Laws.check finds Published -> Draft refused: the writer refuses such a revert where it commits, as Invalid publishedStaysPublished |
