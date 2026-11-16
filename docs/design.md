# Prototype interface reference

The initial search and help-exchange screens were generated with the built-in Image Gen tool and reviewed before frontend implementation. Local reference files are `.nexus/design/search-concept.png` and `.nexus/design/help-concept.png`; these are design references, not application UI or committed assets. The actual app uses semantic HTML, React and CSS.

The design uses a true white background, near-black forest text, muted green-gray secondary text, evergreen actions, thin dividers, generous spacing and a system sans-serif typeface. There is no marketing hero illustration, decorative badge, statistic tile grid or embedded screenshot used as a control.

## Design system

- Background `#ffffff`; text `#162d26`; secondary `#65736c`; borders `#dce4df`; action `#17664f`; subtle notice `#edf2ef`.
- Desktop container: maximum 1368 px with 60 px outer gutters at the reference width. Header approximately 72 px, plain text wordmark and horizontal navigation.
- Typography: system sans-serif; wordmark 30 px/750; main title 44–46 px/750; supporting sentence 22–24 px; section title 28–30 px; result title 22 px; controls/body 16–18 px.
- Controls: 6 px corners, a clear 2 px keyboard-focus outline, generous target sizes and restrained borders. List results use open rows and dividers.
- Search has one primary query, runtime/version filters, a disputed-result option and a path to request help.
- Help uses an open two-column form/explanation layout, stacking on small screens. Requests and replies begin private; actual consent controls are required extensions of this reference.
- Detail, contribution, review, sign-in and activity states reuse the same typography, form controls and divider-based structure. They are functional extensions of the accepted primary-screen system.

## Copy and data fidelity

Primary navigation is Search, Help exchange, Contributions and Activity. The functional notice states that all records are authored demo data. Search and help headings follow the reference wording. Record titles and statuses are real API data; source-backed descriptions may differ from the generated paraphrases to preserve accuracy. Signed-in identity, permission states, errors, screening results and review/consent controls are required dynamic content.

The implementation must be compared with both references at desktop and a narrow viewport, with screenshot and interaction evidence before handoff. Temporary browser evidence stays outside committed source.
