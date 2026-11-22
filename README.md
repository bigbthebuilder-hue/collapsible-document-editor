# Talk Doc — v15

A local-first outline and discourse document editor with editable collapsible sections.

## What changed in v15

- Added a small, always-visible **Deliver** button in Edit Mode.
- Added a matching **Edit** button in Delivery Mode so switching modes is always available at the top.
- Replaced the separate **Collapse all** and **Expand all** actions with one **All sections** switch.
  - Switch off: all sections are collapsed.
  - Switch on: all sections are expanded.
- The same single switch is used in the desktop View menu, the phone/tablet View area, and Delivery Mode.
- Updated the service-worker cache name to `talk-doc-v15`.

## Run locally

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run build
```

## Storage

Talk Doc saves its library locally on the current device. It can work offline after it has been loaded once. Use **Export Talk Doc** to move a document between devices until cloud sync is added.

## Bold and Highlight

Select text in a normal paragraph or an expanded section, then use the two-button
Bold / Highlight control. Press the same button again to remove that style.
Ctrl/Cmd+B also toggles bold for a selection. Highlight uses one soft yellow.
Delivery Mode displays both styles and remains read-only.

Formatting is stored as bounded text ranges, alongside plain text. Existing files
need no conversion. Native textarea selection and the existing grow-only resize
correction are retained. Bold in Edit Mode uses a metric-preserving text stroke
so glyph widths, wrapping and touch-selection handles continue to match the native
textarea. Delivery Mode and HTML exports use semantic strong/mark elements.

Talk Doc import/export retains the complete document and five-version history.
HTML export/import retains both styles and section previews; Word import retains
bold and explicit yellow highlighting. Plain .txt/.md files carry plain text only.
Preview captions remain independently editable plain text; their edits never
replace or alter formatting in the full section.

## Regression checks

- `npm test`: formatting ranges, overlapping styles, replacement edits, Unicode,
  JSON persistence, section slicing, injection escaping, and byte-for-byte
  preservation of the deployed resize correction.
- `npm run build`: production bundle.
- `npx playwright install chromium` then `npm run test:browser`: desktop, Pixel
  phone and tablet emulation covering selection, touch toolbar taps, autosave,
  history, switching, exports/imports, sections, Delivery and cursor/scroll.
- The same checks run in GitHub Actions. Mobile emulation checks touch events
  and viewport layout; physical Android/iOS selection handles require a device
  check and are not represented as physical-device testing.
