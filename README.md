# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hellboys87/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hellboys87/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks 200 pre-token protocols from a sealed DefiLlama snapshot by implied token value, and shows how to farm each one. The model (`radar-2` in `lib/model.ts`) derives every value from the snapshot's own figures — TVL times a category-anchored multiple (the median mcap/TVL of live protocols in the same category), adjusted for 7-day growth, age since first listing, and chain diversity — with no protocol name ever special-cased. The dashboard is sortable and filterable, has a detail view with a full model breakdown and a six-step farm plan per protocol, and a separate live-token view that shows the market's own values for protocols whose token already trades.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Requires Node.js 22.18 or later, standard library only, no network. The program reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Two runs on the same snapshot produce byte-identical output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9xcq3bkm&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
