# Phase B — Broader visual uplift

**Status: shipped in v0.1.72** (Summary KPIs, split inventory, Strato charts, X/Y comparison widgets across tabs).

## Goal

Make every Application Dashboard tab feel VP-readable without turning detail tabs into marketing pages. Keep Strato / Dynatrace chrome tokens. Reduce walls of subtitle text. Use color only for attention (counts > 0, gaps, failures).

## Shipped (v0.1.72)

### Shared system
- `ComparisonKpi`, `SectionIntro`, `ColorLegend`, `HubCharts` (horizontal/stacked bar, donut)
- Color legend on Summary
- Charts for rollups; host-level tables kept for drill-down

### Summary
- Second KPI row: Total Problems / Critical / High
- Host coverage X/Y meters (full stack, logs, traces, monitored)
- Split inventory: Portfolio Health + Coverage detail

### Signal / Problems / Security / RUM / Data Health
- Signal: coverage meters + monitoring-mode donut
- Problems: KPI tiles + bar by app + category donut; host table kept
- Security: severity KPIs + stacked bar + severity donut; slim selectable table + host detail
- RUM: mapped/total meter + mapping-method donut
- Data Health: packs-live meter; diagnostics host-hits bar

## Remaining / later
- Host→service expand/collapse on Signal
- RUM Web Vitals / errors / replay deep dive (Gen3 `user.events`)
- Clickable chart → filter security selection (table select remains)

## Non-goals

- Full rebrand / custom fonts outside Strato
- Embedding Experience Vitals UI
- cmdb-app changes
