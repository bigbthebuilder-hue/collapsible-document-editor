import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import mammoth from 'mammoth';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FileUp,
  FolderOpen,
  History,
  Layers,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Upload,
  X
} from 'lucide-react';
import './styles.css';

const APP_VERSION = '1.5';
const LIBRARY_KEY = 'talk-doc-library-v1';
const CURRENT_ID_KEY = 'talk-doc-current-id-v1';
const OLD_STORAGE_KEY = 'collapsible-docs-current-v2';
const OLD_VERSIONS_KEY = 'collapsible-docs-versions-v2';
const SAFETY_KEY = 'talk-doc-safety-backup-v1';
const MAX_MANUAL_VERSIONS = 5;
const AUTOSAVE_DELAY_MS = 15000;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(block => {
    if (block?.type === 'collapsible') {
      return {
        id: block.id || uid(),
        type: 'collapsible',
        preview: block.preview || createPreviewFromText(block.content || ''),
        content: cleanText(block.content || ''),
        isOpen: !!block.isOpen
      };
    }
    return { id: block?.id || uid(), type: 'text', content: cleanText(block?.content || '') };
  }).filter(block => block.type === 'collapsible' || block.content);
}

function makeTextBlock(content) {
  return { id: uid(), type: 'text', content: cleanText(content) };
}

function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = [];

  doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li').forEach(node => {
    const text = node.textContent.trim();
    if (text) blocks.push(text);
  });

  if (blocks.length) return blocks.join('\n\n');
  return doc.body.textContent.trim();
}

function createPreviewFromText(text) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (!oneLine) return 'Collapsed section';
  const sentenceMatch = oneLine.match(/^(.+?[.!?])\s/);
  const base = sentenceMatch ? sentenceMatch[1] : oneLine;
  return base.length > 120 ? base.slice(0, 117).trim() + '...' : base;
}

function makeCollapsibleBlock(text) {
  return {
    id: uid(),
    type: 'collapsible',
    preview: createPreviewFromText(text),
    content: cleanText(text),
    isOpen: false
  };
}

function makeDocument({ id = uid(), title = 'Untitled Talk', blocks = [], versions = [], createdAt = nowIso(), updatedAt = nowIso(), lastOpenedAt = nowIso() } = {}) {
  return {
    appVersion: APP_VERSION,
    id,
    documentId: id,
    title: title || 'Untitled Talk',
    blocks: normalizeBlocks(blocks),
    versions: Array.isArray(versions) ? versions.slice(0, MAX_MANUAL_VERSIONS) : [],
    createdAt,
    updatedAt,
    lastOpenedAt
  };
}

function getTextareaSelection(ref) {
  const el = ref?.current;
  if (!el) return null;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function safeFilename(value) {
  return String(value || 'talk-doc').trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').slice(0, 80) || 'talk-doc';
}

function readLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized = {};
    Object.values(parsed).forEach(doc => {
      const cleanDoc = makeDocument({
        id: doc.id || doc.documentId || uid(),
        title: doc.title || 'Untitled Talk',
        blocks: doc.blocks || [],
        versions: doc.versions || [],
        createdAt: doc.createdAt || doc.updatedAt || nowIso(),
        updatedAt: doc.updatedAt || nowIso(),
        lastOpenedAt: doc.lastOpenedAt || doc.updatedAt || nowIso()
      });
      normalized[cleanDoc.id] = cleanDoc;
    });
    return normalized;
  } catch {
    return {};
  }
}

function writeLibrary(library) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

function migrateOldDocumentIfNeeded() {
  const existing = readLibrary();
  if (Object.keys(existing).length) return existing;

  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || 'null');
    if (old && Array.isArray(old.blocks)) {
      const id = old.documentId || uid();
      const oldVersions = JSON.parse(localStorage.getItem(OLD_VERSIONS_KEY) || '[]');
      const doc = makeDocument({
        id,
        title: old.title || 'Untitled Talk',
        blocks: old.blocks,
        versions: Array.isArray(oldVersions) ? oldVersions.map(version => ({
          ...version,
          versionId: version.versionId || uid(),
          updatedAt: version.updatedAt || nowIso(),
          reason: version.reason || 'Manual save'
        })).slice(0, MAX_MANUAL_VERSIONS) : [],
        updatedAt: old.updatedAt || nowIso()
      });
      const next = { [id]: doc };
      writeLibrary(next);
      localStorage.setItem(CURRENT_ID_KEY, id);
      return next;
    }
  } catch {
    // ignore migration failure
  }

  const first = makeDocument({ title: 'Untitled Talk', blocks: [] });
  const next = { [first.id]: first };
  writeLibrary(next);
  localStorage.setItem(CURRENT_ID_KEY, first.id);
  return next;
}

function AutoResizeTextarea({ className = '', value, onChange, textareaRef, onFocus, onMouseUp, onKeyUp, placeholder, readOnly = false }) {
  const localRef = useRef(null);

  function setRefs(el) {
    localRef.current = el;
    if (typeof textareaRef === 'function') textareaRef(el);
  }

  function resize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 30)}px`;
  }

  useLayoutEffect(() => {
    resize(localRef.current);
  }, [value]);

  return (
    <textarea
      ref={setRefs}
      className={className}
      value={value}
      onFocus={onFocus}
      onMouseUp={onMouseUp}
      onKeyUp={onKeyUp}
      onInput={event => resize(event.currentTarget)}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
    />
  );
}

function TextDisplay({ text }) {
  return <div className="readonly-text">{text}</div>;
}

function App() {
  const [library, setLibrary] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [docTitle, setDocTitle] = useState('Untitled Talk');
  const [blocks, setBlocks] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [message, setMessage] = useState('Paste text or upload a .docx/.txt file to begin.');
  const [showImport, setShowImport] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [openSectionMenuId, setOpenSectionMenuId] = useState(null);
  const [activeTextBlockId, setActiveTextBlockId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [deliveryScale, setDeliveryScale] = useState(1.12);

  const fileInputRef = useRef(null);
  const importDocumentRef = useRef(null);
  const pasteTextareaRef = useRef(null);
  const blockTextareaRefs = useRef({});
  const autosaveTimerRef = useRef(null);
  const latestSnapshotRef = useRef(null);
  const optionsRef = useRef(null);
  const viewRef = useRef(null);
  const sectionMenuRefs = useRef({});
  const closeMenuTimerRef = useRef(null);

  const currentDoc = useMemo(() => {
    if (!currentId) return null;
    return library[currentId] || null;
  }, [library, currentId]);

  const currentSnapshot = useMemo(() => makeDocument({
    id: currentId || uid(),
    title: docTitle,
    blocks,
    versions: currentDoc?.versions || [],
    createdAt: currentDoc?.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastOpenedAt: nowIso()
  }), [currentId, docTitle, blocks, currentDoc?.versions, currentDoc?.createdAt]);

  const sortedDocuments = useMemo(() => Object.values(library).sort((a, b) => {
    return new Date(b.lastOpenedAt || b.updatedAt || 0) - new Date(a.lastOpenedAt || a.updatedAt || 0);
  }), [library]);

  const versions = currentDoc?.versions || [];
  const collapsibleBlocks = useMemo(() => blocks.filter(block => block.type === 'collapsible'), [blocks]);
  const areAllSectionsExpanded = collapsibleBlocks.length > 0 && collapsibleBlocks.every(block => block.isOpen);

  useEffect(() => {
    latestSnapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    const loadedLibrary = migrateOldDocumentIfNeeded();
    const storedId = localStorage.getItem(CURRENT_ID_KEY);
    const firstId = storedId && loadedLibrary[storedId] ? storedId : Object.keys(loadedLibrary)[0];
    const doc = loadedLibrary[firstId];

    setLibrary(loadedLibrary);
    setCurrentId(firstId);
    setDocTitle(doc?.title || 'Untitled Talk');
    setBlocks(doc?.blocks || []);
    setLastSavedAt(doc?.updatedAt || null);
    setShowImport(!(doc?.blocks || []).length);
    setMessage(doc?.blocks?.length ? 'Loaded your current Talk Doc from this device.' : 'Paste text or upload a .docx/.txt file to begin.');
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setDirty(true);
  }, [docTitle, blocks, loaded]);

  useEffect(() => {
    if (!loaded || !dirty || !currentId) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      saveCurrentFile('Autosaved', false);
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [currentSnapshot, dirty, loaded, currentId]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (!latestSnapshotRef.current || !currentId) return;
      const next = { ...readLibrary(), [currentId]: latestSnapshotRef.current };
      writeLibrary(next);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentId]);

  useEffect(() => {
    function closeMenusFromOutside(event) {
      const target = event.target;
      const inOptions = optionsRef.current?.contains(target);
      const inView = viewRef.current?.contains(target);
      const inSection = Object.values(sectionMenuRefs.current).some(el => el?.contains(target));
      if (!inOptions) setShowOptions(false);
      if (!inView) setShowViewMenu(false);
      if (!inSection) setOpenSectionMenuId(null);
    }

    function closeMenusOnScroll() {
      setShowOptions(false);
      setShowViewMenu(false);
      setOpenSectionMenuId(null);
    }

    document.addEventListener('mousedown', closeMenusFromOutside);
    document.addEventListener('touchstart', closeMenusFromOutside, { passive: true });
    window.addEventListener('scroll', closeMenusOnScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeMenusFromOutside);
      document.removeEventListener('touchstart', closeMenusFromOutside);
      window.removeEventListener('scroll', closeMenusOnScroll);
    };
  }, []);

  useEffect(() => {
    if (!deliveryMode) return;
    let wakeLock = null;
    let cancelled = false;

    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock is optional. Delivery mode still works without it.
      }
    }

    requestWakeLock();
    const onVisibilityChange = () => {
      if (!cancelled && document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLock?.release?.().catch(() => {});
    };
  }, [deliveryMode]);

  function saveLibraryDoc(doc, showMessage = true, reason = 'Saved') {
    const cleanDoc = makeDocument(doc);
    const next = { ...library, [cleanDoc.id]: cleanDoc };
    setLibrary(next);
    writeLibrary(next);
    localStorage.setItem(CURRENT_ID_KEY, cleanDoc.id);
    setCurrentId(cleanDoc.id);
    setLastSavedAt(cleanDoc.updatedAt);
    setDirty(false);
    if (showMessage) setMessage(`${reason} ${cleanDoc.title} on this device at ${formatTime(cleanDoc.updatedAt)}.`);
    return cleanDoc;
  }

  function saveCurrentFile(reason = 'Saved', showMessage = true) {
    const doc = makeDocument({
      id: currentId || uid(),
      title: docTitle || 'Untitled Talk',
      blocks,
      versions: currentDoc?.versions || [],
      createdAt: currentDoc?.createdAt || nowIso(),
      updatedAt: nowIso(),
      lastOpenedAt: nowIso()
    });
    return saveLibraryDoc(doc, showMessage, reason);
  }

  function createManualVersion(reason = 'Manual save') {
    const savedDoc = saveCurrentFile('Saved version', false);
    const version = {
      appVersion: APP_VERSION,
      versionId: uid(),
      documentId: savedDoc.id,
      title: savedDoc.title,
      blocks: savedDoc.blocks,
      updatedAt: savedDoc.updatedAt,
      reason
    };
    const versions = [version, ...(savedDoc.versions || [])].slice(0, MAX_MANUAL_VERSIONS);
    const docWithVersion = { ...savedDoc, versions, updatedAt: nowIso() };
    saveLibraryDoc(docWithVersion, false);
    setMessage(`${reason} saved for ${savedDoc.title}. Keeping the last ${MAX_MANUAL_VERSIONS} manual versions for this file.`);
  }

  function createSafetyBackup(reason) {
    if (!hasWork()) return;
    const snapshot = {
      ...makeDocument({
        id: currentId || uid(),
        title: docTitle,
        blocks,
        versions: currentDoc?.versions || [],
        createdAt: currentDoc?.createdAt || nowIso(),
        updatedAt: nowIso()
      }),
      reason: reason || 'Safety backup',
      backupId: uid()
    };
    localStorage.setItem(SAFETY_KEY, JSON.stringify(snapshot));
  }

  function hasWork() {
    return blocks.length > 0 || !!cleanText(pasteText);
  }

  function promptSaveBeforeProceed(actionText) {
    if (!dirty || !hasWork()) return 'continue';
    const answer = window.confirm(`Save changes to "${docTitle}" before ${actionText}?\n\nOK = save first. Cancel = continue without saving.`);
    if (answer) saveCurrentFile('Saved', true);
    return 'continue';
  }

  function loadDocument(docId) {
    const doc = library[docId];
    if (!doc) return;
    promptSaveBeforeProceed('opening another file');
    const opened = { ...doc, lastOpenedAt: nowIso() };
    saveLibraryDoc(opened, false);
    setDocTitle(opened.title || 'Untitled Talk');
    setBlocks(opened.blocks || []);
    setCurrentId(opened.id);
    setShowFiles(false);
    setShowImport(false);
    setShowVersions(false);
    setDeliveryMode(false);
    setMessage(`Opened ${opened.title}.`);
  }

  function createNewFile() {
    if (hasWork()) {
      const ok = window.confirm(`Create a new blank file?\n\nYour current file will be saved first.`);
      if (!ok) {
        setMessage('New file cancelled.');
        return;
      }
      saveCurrentFile('Saved', false);
    }
    const doc = makeDocument({ title: 'Untitled Talk', blocks: [] });
    saveLibraryDoc(doc, false);
    setDocTitle(doc.title);
    setBlocks([]);
    setPasteText('');
    setShowImport(true);
    setShowOptions(false);
    setShowFiles(false);
    setDeliveryMode(false);
    setMessage('Started a new Talk Doc file.');
  }

  function duplicateCurrentFile() {
    const original = saveCurrentFile('Saved', false);
    const copy = makeDocument({
      title: `${original.title} Copy`,
      blocks: original.blocks,
      versions: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastOpenedAt: nowIso()
    });
    saveLibraryDoc(copy, false);
    setDocTitle(copy.title);
    setBlocks(copy.blocks);
    setShowOptions(false);
    setMessage(`Duplicated file as ${copy.title}.`);
  }

  function loadPasteText() {
    const text = cleanText(pasteText);
    if (!text) {
      setMessage('Paste some document text first.');
      return;
    }

    if (hasWork() && blocks.length) {
      const ok = window.confirm('Load this pasted text as the document? Your current document will be saved as a safety backup first.');
      if (!ok) {
        setMessage('Paste load cancelled. Your current document was not changed.');
        return;
      }
      createSafetyBackup('Before loading pasted text');
    }

    setBlocks([makeTextBlock(text)]);
    setShowImport(false);
    setMessage('Loaded pasted text. Highlight the exact words/sentences to collapse, then press Collapse.');
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (hasWork() && blocks.length) {
        const ok = window.confirm('Open this file and replace the current file on screen? Your current file will be saved as a safety backup first.');
        if (!ok) {
          setMessage('File upload cancelled. Your current document was not changed.');
          event.target.value = '';
          return;
        }
        createSafetyBackup('Before opening file');
      }

      let text = '';
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        text = htmlToText(result.value);
      } else {
        text = await file.text();
      }

      text = cleanText(text);
      if (!text) {
        setMessage('That file opened, but I could not find readable text in it.');
        return;
      }

      setDocTitle(file.name.replace(/\.[^.]+$/, ''));
      setBlocks([makeTextBlock(text)]);
      setShowImport(false);
      setMessage(`Imported ${file.name}. Save the file when ready.`);
    } catch {
      setMessage('The file could not be opened. Try copying and pasting the document text instead.');
    } finally {
      event.target.value = '';
    }
  }

  async function handleImportDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed?.blocks)) {
        setMessage('That file is not a valid Talk Doc export.');
        return;
      }

      if (hasWork()) {
        const ok = window.confirm('Import this saved Talk Doc file? Your current file will be saved first.');
        if (!ok) {
          setMessage('Import cancelled. Your current file was not changed.');
          return;
        }
        saveCurrentFile('Saved', false);
      }

      const doc = makeDocument({
        id: parsed.id || parsed.documentId || uid(),
        title: parsed.title || file.name.replace(/\.[^.]+$/, '') || 'Imported Talk',
        blocks: parsed.blocks,
        versions: parsed.versions || [],
        createdAt: parsed.createdAt || nowIso(),
        updatedAt: nowIso(),
        lastOpenedAt: nowIso()
      });
      saveLibraryDoc(doc, false);
      setDocTitle(doc.title);
      setBlocks(doc.blocks);
      setShowImport(false);
      setShowOptions(false);
      setMessage(`Imported ${file.name}.`);
    } catch {
      setMessage('Could not import that document file. Use a .talk-doc, .collapsible-doc, or JSON export from this app.');
    } finally {
      event.target.value = '';
    }
  }

  function collapseSelectionFromPasteBox() {
    const range = getTextareaSelection(pasteTextareaRef);
    const text = pasteText;
    if (!range) return false;

    const selectedText = cleanText(text.slice(range.start, range.end));
    if (!selectedText) return false;

    const beforeText = cleanText(text.slice(0, range.start));
    const afterText = cleanText(text.slice(range.end));
    const next = [];
    if (beforeText) next.push(makeTextBlock(beforeText));
    next.push(makeCollapsibleBlock(selectedText));
    if (afterText) next.push(makeTextBlock(afterText));

    setBlocks(next);
    setShowImport(false);
    setMessage('Only the highlighted text was made collapsible.');
    return true;
  }

  function collapseSelectionFromTextBlock() {
    if (!activeTextBlockId) return false;
    const ref = { current: blockTextareaRefs.current[activeTextBlockId] };
    const range = getTextareaSelection(ref);
    if (!range) return false;

    const sourceBlock = blocks.find(block => block.id === activeTextBlockId && block.type === 'text');
    if (!sourceBlock) return false;

    const selectedText = cleanText(sourceBlock.content.slice(range.start, range.end));
    if (!selectedText) return false;

    const beforeText = cleanText(sourceBlock.content.slice(0, range.start));
    const afterText = cleanText(sourceBlock.content.slice(range.end));

    setBlocks(current => {
      const next = [];
      current.forEach(block => {
        if (block.id !== activeTextBlockId) {
          next.push(block);
          return;
        }
        if (beforeText) next.push(makeTextBlock(beforeText));
        next.push(makeCollapsibleBlock(selectedText));
        if (afterText) next.push(makeTextBlock(afterText));
      });
      return next;
    });
    setActiveTextBlockId(null);
    setMessage('Only the highlighted text was made collapsible.');
    return true;
  }

  function makeSelectedCollapsible() {
    if (deliveryMode) return;
    if (showImport && cleanText(pasteText) && collapseSelectionFromPasteBox()) return;
    if (collapseSelectionFromTextBlock()) return;

    if (showImport && cleanText(pasteText) && !blocks.length) {
      loadPasteText();
      return;
    }

    setMessage('Highlight the exact text you want to collapse, then press Collapse. Existing collapsible portions are protected.');
  }

  function updateBlock(id, changes) {
    setBlocks(current => current.map(block => block.id === id ? { ...block, ...changes } : block));
  }

  function expandAll(open) {
    setBlocks(current => current.map(block => block.type === 'collapsible' ? { ...block, isOpen: open } : block));
    setShowViewMenu(false);
    setShowOptions(false);
    setMessage(open ? 'Expanded all collapsible portions.' : 'Collapsed all collapsible portions.');
  }

  function toggleAllSections() {
    if (!collapsibleBlocks.length) return;
    expandAll(!areAllSectionsExpanded);
  }

  function restoreCollapsibleToText(id) {
    createSafetyBackup('Before restoring collapsible section to normal text');
    setBlocks(current => current.map(block => {
      if (block.id !== id) return block;
      return makeTextBlock(block.content);
    }));
    setOpenSectionMenuId(null);
    setMessage('Restored that collapsible portion back into normal document text using its current edited full text.');
  }

  function copySectionText(block) {
    navigator.clipboard?.writeText(block.content).then(() => setMessage('Copied expanded section text.')).catch(() => setMessage('Could not copy automatically.'));
    setOpenSectionMenuId(null);
  }

  function exportDocument(snapshot = currentSnapshot) {
    downloadFile(
      `${safeFilename(snapshot.title)}.talk-doc`,
      JSON.stringify(snapshot, null, 2),
      'application/json'
    );
  }

  function exportHtml() {
    const body = blocks.map(block => {
      if (block.type === 'collapsible') {
        return `<details><summary>${escapeHtml(block.preview)}</summary><div>${escapeHtml(block.content).replace(/\n/g, '<br>')}</div></details>`;
      }
      return `<p>${escapeHtml(block.content).replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>body{font-family:Arial,sans-serif;line-height:1.55;max-width:850px;margin:40px auto;padding:0 18px}details{border:1px solid #ccc;border-radius:10px;padding:12px;margin:12px 0}summary{font-weight:700;cursor:pointer}</style></head><body><h1>${escapeHtml(docTitle)}</h1>${body}</body></html>`;
    downloadFile(`${safeFilename(docTitle)}.html`, html, 'text/html');
  }

  function restoreVersion(version) {
    const ok = window.confirm('Restore this previous version? Your current file will be saved as a safety backup first.');
    if (!ok) {
      setMessage('Restore cancelled.');
      return;
    }
    createSafetyBackup('Before restoring previous version');
    setDocTitle(version.title || 'Restored Talk');
    setBlocks(version.blocks || []);
    setShowVersions(false);
    setShowImport(false);
    setMessage(`Restored version from ${formatTime(version.updatedAt)}.`);
  }

  function openOptionsAction(action) {
    setShowOptions(false);
    action();
  }

  function scheduleMenuClose() {
    clearTimeout(closeMenuTimerRef.current);
    closeMenuTimerRef.current = setTimeout(() => {
      setShowOptions(false);
      setShowViewMenu(false);
      setOpenSectionMenuId(null);
    }, 1000);
  }

  function cancelMenuClose() {
    clearTimeout(closeMenuTimerRef.current);
  }

  function enterDeliveryMode() {
    saveCurrentFile('Saved before delivery', false);
    setShowOptions(false);
    setShowViewMenu(false);
    setShowFiles(false);
    setShowVersions(false);
    setShowImport(false);
    setOpenSectionMenuId(null);
    setDeliveryMode(true);
    setMessage('Delivery Mode is on. Editing tools are locked.');
  }

  function exitDeliveryMode() {
    setDeliveryMode(false);
    setMessage('Exited Delivery Mode. Editing tools are available again.');
  }

  function renderSectionMenu(block) {
    const isOpen = openSectionMenuId === block.id;
    return (
      <div
        className="section-menu-wrap"
        ref={el => { if (el) sectionMenuRefs.current[block.id] = el; }}
        onMouseEnter={cancelMenuClose}
        onMouseLeave={scheduleMenuClose}
      >
        <button
          className="section-menu-button"
          type="button"
          aria-label="Section options"
          onClick={event => {
            event.stopPropagation();
            setOpenSectionMenuId(current => current === block.id ? null : block.id);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
        {isOpen && (
          <div className="section-menu-card">
            <button onClick={() => copySectionText(block)}><Copy size={16} /> Copy full text</button>
            {!deliveryMode && <button onClick={() => restoreCollapsibleToText(block.id)}><RotateCcw size={16} /> Restore to normal text</button>}
          </div>
        )}
      </div>
    );
  }

  function AllSectionsSwitch({ compact = false }) {
    const disabled = !collapsibleBlocks.length;
    return (
      <button
        type="button"
        className={`all-sections-switch ${areAllSectionsExpanded ? 'is-expanded' : 'is-collapsed'} ${compact ? 'compact' : ''}`}
        onClick={toggleAllSections}
        disabled={disabled}
        aria-pressed={areAllSectionsExpanded}
        aria-label={areAllSectionsExpanded ? 'Collapse all sections' : 'Expand all sections'}
        title={areAllSectionsExpanded ? 'Collapse all sections' : 'Expand all sections'}
      >
        <span className="all-switch-label">All</span>
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        <span className="all-switch-state">{areAllSectionsExpanded ? 'Expanded' : 'Collapsed'}</span>
      </button>
    );
  }

  if (deliveryMode) {
    return (
      <div className="app-shell delivery-shell" style={{ '--delivery-scale': deliveryScale }}>
        <header className="delivery-header">
          <div className="delivery-title-wrap">
            <div className="brand-mark small" aria-hidden="true"><MessageCircle size={28} strokeWidth={2.8} /><span /><span /><span /></div>
            <div>
              <strong>Talk Doc</strong>
              <span>{docTitle}</span>
            </div>
          </div>
          <div className="delivery-actions">
            <button className="mode-switch-button" onClick={exitDeliveryMode}><X size={17} /> <span>Edit</span></button>
            <AllSectionsSwitch compact />
            <button className="text-size-button" onClick={() => setDeliveryScale(value => Math.max(0.9, Number((value - 0.08).toFixed(2))))} aria-label="Decrease reading size"><Minus size={18} /> A</button>
            <button className="text-size-button" onClick={() => setDeliveryScale(value => Math.min(1.6, Number((value + 0.08).toFixed(2))))} aria-label="Increase reading size"><Plus size={18} /> A</button>
          </div>
        </header>

        <main className="document-page delivery-page">
          {!blocks.length && <div className="empty-state"><h2>No document text yet</h2><p>Exit Delivery Mode to add text.</p></div>}
          {blocks.map(block => {
            if (block.type === 'text') {
              return <section key={block.id} className="doc-block text-block"><TextDisplay text={block.content} /></section>;
            }
            return (
              <section key={block.id} className={`doc-block collapsible-block ${block.isOpen ? 'expanded-flow' : 'collapsed-flow'} delivery-block`}>
                <div className="collapse-bar" onClick={() => updateBlock(block.id, { isOpen: !block.isOpen })}>
                  <button className="collapse-toggle compact" type="button">{block.isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</button>
                  <div className="delivery-preview-text">{block.preview || 'Collapsed section'}</div>
                  {renderSectionMenu(block)}
                </div>
                {block.isOpen && <TextDisplay text={block.content} />}
              </section>
            );
          })}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          <MessageCircle size={30} strokeWidth={2.8} />
          <span />
          <span />
          <span />
        </div>
        <div className="title-stack">
          <h1>Talk Doc</h1>
          <input
            className="file-title-input"
            value={docTitle}
            onChange={event => setDocTitle(event.target.value)}
            onBlur={() => saveCurrentFile('Saved', false)}
            aria-label="Current file name"
          />
        </div>
        <div className="header-actions">
          <div className="save-indicator" aria-live="polite">
            <CheckCircle2 size={18} />
            <span>{dirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Not saved yet'}</span>
          </div>
          <button className="mode-switch-button" onClick={enterDeliveryMode}><FileText size={17} /> <span>Deliver</span></button>
        </div>
      </header>

      <nav className="toolbar">
        <button className="top-action paste-action" onClick={() => setShowImport(value => !value)}><ClipboardPaste size={18} /><span className="label-full">Paste/import</span><span className="label-short">Paste</span></button>
        <button className="top-action make-action primary" onClick={makeSelectedCollapsible}><Layers size={18} /><span className="label-full">Make collapsible</span><span className="label-short">Collapse</span></button>

        <div className="menu-wrap wide-only" ref={viewRef} onMouseEnter={cancelMenuClose} onMouseLeave={scheduleMenuClose}>
          <button onClick={() => setShowViewMenu(value => !value)}><ChevronDown size={18} /> View</button>
          {showViewMenu && (
            <div className="menu-card small-menu view-menu" onMouseEnter={cancelMenuClose} onMouseLeave={scheduleMenuClose}>
              <p className="menu-label">All sections</p>
              <AllSectionsSwitch />
            </div>
          )}
        </div>

        <button className="wide-only" onClick={() => createManualVersion()}><Save size={18} /> Save</button>

        <div className="menu-wrap" ref={optionsRef} onMouseEnter={cancelMenuClose} onMouseLeave={scheduleMenuClose}>
          <button className="top-action options-action" onClick={() => setShowOptions(value => !value)}><MoreHorizontal size={18} /><span className="label-full">Options</span><span className="label-short">Menu</span></button>
          {showOptions && (
            <div className="menu-card options-menu" onMouseEnter={cancelMenuClose} onMouseLeave={scheduleMenuClose}>
              <p className="menu-label">Files</p>
              <button onClick={() => openOptionsAction(createNewFile)}><FilePlus2 size={18} /> New file</button>
              <button onClick={() => { setShowFiles(value => !value); setShowOptions(false); }}><FolderOpen size={18} /> Open file</button>
              <button onClick={() => openOptionsAction(() => saveCurrentFile('Saved'))}><Save size={18} /> Save current file</button>
              <button onClick={() => openOptionsAction(duplicateCurrentFile)}><Copy size={18} /> Duplicate file</button>
              <p className="menu-label">Document</p>
              <button onClick={() => openOptionsAction(() => createManualVersion())}><History size={18} /> Save version</button>
              <button onClick={() => openOptionsAction(() => fileInputRef.current?.click())}><FileUp size={18} /> Upload Word/text file</button>
              <button onClick={() => openOptionsAction(() => importDocumentRef.current?.click())}><Upload size={18} /> Import Talk Doc</button>
              <button onClick={() => openOptionsAction(() => exportDocument())}><Download size={18} /> Export Talk Doc</button>
              <button onClick={() => openOptionsAction(exportHtml)}><Download size={18} /> Export HTML</button>
              <button onClick={() => { setShowVersions(value => !value); setShowOptions(false); }}><History size={18} /> Previous versions</button>
              <p className="menu-label mobile-only">View</p>
              <div className="mobile-only switch-menu-row"><AllSectionsSwitch /></div>
            </div>
          )}
        </div>

        <input ref={fileInputRef} className="hidden" type="file" accept=".docx,.txt,.md,.html" onChange={handleFileUpload} />
        <input ref={importDocumentRef} className="hidden" type="file" accept=".talk-doc,.collapsible-doc,.json" onChange={handleImportDocument} />
      </nav>

      {message && <p className="sr-only" role="status" aria-live="polite">{message}</p>}

      {showFiles && (
        <section className="files-panel">
          <div className="versions-header">
            <div>
              <h2>Open file</h2>
              <p>Saved locally on this device.</p>
            </div>
            <button onClick={() => setShowFiles(false)}>Close</button>
          </div>
          {!sortedDocuments.length ? (
            <p className="empty-history">No saved files yet.</p>
          ) : (
            sortedDocuments.map(doc => (
              <article className={`file-row ${doc.id === currentId ? 'current-file' : ''}`} key={doc.id}>
                <button onClick={() => loadDocument(doc.id)}>
                  <FileText size={19} />
                  <span>
                    <strong>{doc.title || 'Untitled Talk'}</strong>
                    <small>{doc.id === currentId ? 'Current file' : `Saved ${formatTime(doc.updatedAt)}`}</small>
                  </span>
                </button>
              </article>
            ))
          )}
        </section>
      )}

      {showImport && (
        <section className="import-panel">
          <h2>Paste copied Word text</h2>
          <p>Paste the document here. Highlight a small part and press Collapse, or load the whole pasted document first.</p>
          <textarea
            ref={pasteTextareaRef}
            value={pasteText}
            onChange={event => setPasteText(event.target.value)}
            placeholder="Paste document text here..."
          />
          <div className="panel-actions">
            <button className="primary" onClick={loadPasteText}>Load pasted text</button>
            <button onClick={() => fileInputRef.current?.click()}>Upload .docx or .txt</button>
          </div>
        </section>
      )}

      {showVersions && (
        <section className="versions-panel">
          <div className="versions-header">
            <div>
              <h2>Previous versions</h2>
              <p>Manual saves for this file only. The newest {MAX_MANUAL_VERSIONS} versions are kept.</p>
            </div>
            <button onClick={() => setShowVersions(false)}>Close</button>
          </div>
          {!versions.length ? (
            <p className="empty-history">No manual saved versions yet. Press Save to create one.</p>
          ) : (
            versions.map(version => (
              <article className="version-row" key={version.versionId}>
                <div>
                  <strong>{formatTime(version.updatedAt)}</strong>
                  <span>{version.reason || 'Manual save'} — {version.title}</span>
                </div>
                <div className="version-actions">
                  <button onClick={() => exportDocument(version)}>Export</button>
                  <button className="primary" onClick={() => restoreVersion(version)}>Restore</button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      <main className="document-page">
        {!blocks.length && !showImport && (
          <div className="empty-state">
            <h2>No document text yet</h2>
            <p>Paste text or upload a file to start.</p>
            <button className="primary" onClick={() => setShowImport(true)}>Open import panel</button>
          </div>
        )}

        {blocks.map(block => (
          <section key={block.id} className={`doc-block ${block.type === 'collapsible' ? (block.isOpen ? 'collapsible-block expanded-flow' : 'collapsible-block collapsed-flow') : 'text-block'}`}>
            {block.type === 'text' ? (
              <div className="block-main">
                <AutoResizeTextarea
                  textareaRef={el => { if (el) blockTextareaRefs.current[block.id] = el; }}
                  className="text-editor"
                  value={block.content}
                  onFocus={() => setActiveTextBlockId(block.id)}
                  onMouseUp={() => setActiveTextBlockId(block.id)}
                  onKeyUp={() => setActiveTextBlockId(block.id)}
                  onChange={event => updateBlock(block.id, { content: event.target.value })}
                  placeholder="Type or paste text here..."
                />
              </div>
            ) : (
              <div className="block-main">
                <div className="collapse-bar">
                  <button className="collapse-toggle compact" onClick={() => updateBlock(block.id, { isOpen: !block.isOpen })}>
                    {block.isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <input
                    className="preview-editor"
                    value={block.preview}
                    onChange={event => updateBlock(block.id, { preview: event.target.value })}
                    placeholder="Write the short collapsed preview here..."
                  />
                  {renderSectionMenu(block)}
                </div>
                {block.isOpen && (
                  <AutoResizeTextarea
                    className="expanded-editor document-flow-editor"
                    value={block.content}
                    onChange={event => updateBlock(block.id, { content: event.target.value })}
                    placeholder="Full section text..."
                  />
                )}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
