# Evidence Workbench design QA

final result: passed

This is the original v0.1 reference comparison. The v0.2 federation extension has separate [visual and interaction evidence](docs/design/federation-qa.md), including the fifth navigation destination.

## Target and state

- Selected source: `docs/design/mockups/03-evidence-workbench.png` (third displayed branded option, selected by the owner).
- First implementation capture: `/tmp/airc-nexus-qa-01a1e25c/option3-implementation.png`.
- Durable final captures: [desktop](docs/design/screenshots/workbench-desktop.png) and [narrow](docs/design/screenshots/workbench-mobile.png). Both show authored fixtures with no credential fields.
- Same state: Morgan demo owner viewing the authored, owner-approved variance question and an unshared helper reply. No sign-in code is present in the capture.
- Source and render: 1487 × 1058 pixels; CSS viewport 1487 × 1058; device scale factor 1. No density normalization or browser chrome crop was required.
- Full comparison: `/tmp/airc-nexus-qa-01a1e25c/comparison-full.png`.
- Focused comparisons: `comparison-identity.png`, `comparison-inquiry.png`, `comparison-sharing.png` in that same temporary evidence directory.

## First comparison findings

- [P2] The display title and inquiry text were narrower and lighter than the selected visual. Increased the display face size/weight, enlarged the inquiry text while preserving line rhythm, and adjusted the editorial lead.
- [P2] Native inline mathematical notation was too small for the selected reading hierarchy. Changed to display-style MathML and increased its type size; the expressions remain actual accessible math data.
- [P2] The identity wordmark and primary sharing action were smaller than the mock-up. Increased the desktop wordmark/action size and aligned the navigation inset.
- Evidence gap: the first narrow capture occurred before lazy math finished loading. The browser test now waits for both rendered math expressions before checking overflow and capturing the final state.

The above visual repairs require a new same-state capture and comparison. Build/functional test success alone does not pass this gate.

## Intentional product differences

- Cyan actions use navy text for contrast; the sharing action stays disabled until the exact-reply consent checkbox is checked.
- A small source-rights label and a sign-out control support the working application.
- Supplied AiRC logo pixels are used, rather than approximating the generated mark.
- New-question, sign-in, empty, review and report states extend the selected typography/token system while enforcing the actual backend permissions.

## Functional evidence so far

Four repeatable browser acceptance tests passed, including science retrieval/return navigation, separate question/reply sharing, contribution screening/review/publication/withdrawal, private reporting and narrow layouts. The initial signed-in workbench had zero automated violations for the selected WCAG tags. Console page errors were checked by the acceptance tests. The native in-app browser was used for the live preview and initial search/science/help inspection; the pre-authorized Playwright test workflow supplies repeatable isolated signed-in captures.

## Second comparison and closure

The repaired application was captured again at the same 1487 × 1058 CSS/pixel viewport and private-reply state. The source and repaired render were opened together in `comparison-pass2.png`; focused identity and sharing comparisons were opened in `comparison-pass2-identity.png` and `comparison-pass2-sharing.png`. The complete narrow capture `option3-mobile.png` now waits for both mathematical expressions and was inspected directly.

- **Fonts/typography:** the repaired display size/weight and inquiry wrapping now carry the selected scholarly hierarchy. Inter handles controls and Source Serif 4 handles reading text. Display-style native MathML is readable and accessible.
- **Spacing/layout:** the navy rail, inquiry header/rules, reading column, evidence margin, consent/action block and editorial footer retain the selected composition. Narrow layouts stack the evidence margin and retain all navigation.
- **Colors/tokens:** navy/cyan AiRC identity and the sampled paper tone are consistent. Navy action text and disabled-until-consent state are intentional contrast/behavior corrections; automated selected-tag WCAG checks passed.
- **Asset fidelity:** the unchanged supplied circuit-A logo is used. The library icons match the thin outline family; no rasterized UI, invented illustration or hand-drawn logo is used.
- **Copy/content:** the selected headline, editorial lead, authored variance example, scope, consent language and footer are retained. Account identity, source rights and sharing state remain actual data rather than decorative claims.

All four browser acceptance tests passed again after repair. No actionable P0/P1/P2 visual issue remains. Minor differences in font rasterization, the extra source-rights label and the required sign-out control are recorded as P3/product constraints, not hidden mismatches.

## Implementation checklist

- [x] Repaired desktop capture compared with the selected source at equal density.
- [x] Focused identity, typography/inquiry and sharing controls inspected.
- [x] Full narrow state inspected after math resolved; no viewport overflow.
- [x] Actual owner sharing and revocation, contribution lifecycle and report navigation exercised.
- [x] Preserve the running local preview and continue the separate live-model/retrieval checks.
