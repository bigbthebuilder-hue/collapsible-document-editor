# Collapsible Document Editor

A React/Vite app for pasting or importing document text, then turning exact highlighted portions into collapsible text.

## V5 behavior

- Normal document text stays visually in one document flow.
- Making text collapsible does not show the unselected before/after text as separate section cards.
- Expanded collapsible text appears in the original location in the document flow.
- Collapsed text is visually replaced by one editable preview line.
- Whole hidden document pieces are not selectable/wrapped through checkboxes.
- The collapsed preview text is separate from the expanded full content.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```


V6 fix: document text remains visible after making a portion collapsible.


## v9 update
- Removed the Delete button from collapsible section controls. To remove content, restore the section to normal text first, then delete the text in the document like regular text.
