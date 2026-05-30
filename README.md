# Talk Doc

A lightweight local-first document editor for creating expandable and collapsible talk notes.

## Features

- Multi-file local library for many outlines
- Current filename shown and editable at the top
- Paste or import document text
- Highlight text and make it collapsible
- Edit collapsed preview separately from expanded text
- Section options menu inside each collapsible bar, with no hover layout jumping
- Delivery Mode for desktop, tablet, and phone with editing locked
- Autosave locally on the device
- Save manual versions and restore previous versions per file
- Export/import `.talk-doc` files
- Install-ready PWA files and icons included

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vercel settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`


## v14

- Removed the floating bottom status/message bar so it no longer covers the document while editing or delivering.
- Status messages remain available to screen readers only; the visible save state stays in the top header.
- Updated service worker cache name to v14.
