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
