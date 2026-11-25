# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rsyh17/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rsyh17/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over the sealed DefiLlama snapshot: it ranks 198 protocols that record no token yet by an implied launch value derived only from the snapshot's own figures — each protocol's TVL times its category's median market-cap/TVL ratio among traded peers, blended toward the all-category median in proportion to how few peers back it, and adjusted for 7-day momentum, years run with no token, and chain breadth. Protocols whose token already trades, and wrapped, staked or bridged products of them, are set aside. The dashboard is a static page with a category-multiples evidence table, search, category and chain filters, four sort orders (the column headings sort too), and a detail view per protocol showing the full valuation arithmetic and a concrete five-step farm plan with costs and durations.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=res4jwe8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
