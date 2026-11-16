# Federation workbench QA

Result: passed for the defined local flows and viewports.

The v0.2 surface extends the selected Evidence Workbench: unchanged AiRC circuit-A, navy/cyan controls, Inter navigation and Source Serif 4 reading hierarchy. Node, origin/revision, source evidence and consent controls reflect actual backend state. Displayed examples are authored fixtures.

- Desktop: 1487 × 1058 CSS pixels; source/recipient controls, imported artifact, scope, source rights and private reporting inspected.
- Narrow: 390 × 844 viewport; five navigation destinations remain in one row with touch targets and no horizontal overflow.
- The first full-page image retained a scrolled sticky rail. The test now scrolls to the top before recapture; the screenshot was not edited into evidence.
- The fifth navigation destination initially wrapped to a second mobile row. Five responsive columns retain labels and readable wrapping.
- Two canonical browser hosts held simultaneous sessions in one context. No credential field, trace or video appears in captures.
- Selected automated WCAG tags reported zero violations on the operator surface. Page errors were checked throughout.
- Native in-app browsing rendered both running nodes. South showed North's accepted variance record; North showed South's returning contribution. Both tabs were retained.

The flow covers source opt-in → receiver opt-in/review → detail/private report → private correction → new review/publication/export/review → withdrawal. Empty, pending, unavailable and expired states do not present older advice as current.

Final captures: [desktop](screenshots/federation-desktop.png), [narrow](screenshots/federation-mobile.png). Browser plugin not available; the existing Playwright workflow uses installed Chrome with isolated contexts. Captures show fixture workflows, not independent researchers. Native WebKit/Chrome font-rasterization differences are outside this local visual gate.
