import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import mammoth from 'mammoth';
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Download,
  FileUp,
  History,
  Layers,
  MoreHorizontal,
  RotateCcw,
  Save,
  Upload,
  X
} from 'lucide-react';
import './styles.css';

const APP_VERSION = '1.1';
const STORAGE_KEY = 'collapsible-docs-current-v2';
const VERSIONS_KEY = 'collapsible-docs-versions-v2';
const SAFETY_KEY = 'collapsible-docs-safety-backup-v2';
const MAX_MANUAL_VERSIONS = 5;
const AUTOSAVE_DELAY_MS = 15000;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
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

function makeDocumentSnapshot(title, blocks, docId) {
  return {
    appVersion: APP_VERSION,
    documentId: docId || uid(),
    title: title || 'Untitled Document',
    updatedAt: new Date().toISOString(),
    blocks: Array.isArray(blocks) ? blocks : []
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
  return String(value || 'document').trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').slice(0, 80) || 'document';
}

function getVersions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VERSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setVersions(versions) {
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions.slice(0, MAX_MANUAL_VERSIONS)));
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

function App() {
  const [documentId, setDocumentId] = useState(uid());
  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [blocks, setBlocks] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [message, setMessage] = useState('Paste text or upload a .docx/.txt file to begin.');
  const [showImport, setShowImport] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersionState] = useState([]);
  const [activeTextBlockId, setActiveTextBlockId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fileInputRef = useRef(null);
  const importDocumentRef = useRef(null);
  const pasteTextareaRef = useRef(null);
  const blockTextareaRefs = useRef({});
  const autosaveTimerRef = useRef(null);
  const latestSnapshotRef = useRef(null);

  const currentSnapshot = useMemo(
    () => makeDocumentSnapshot(docTitle, blocks, documentId),
    [docTitle, blocks, documentId]
  );

  useEffect(() => {
    latestSnapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    setVersionState(getVersions());

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.blocks)) {
          setDocumentId(parsed.documentId || uid());
          setDocTitle(parsed.title || 'Untitled Document');
          setBlocks(parsed.blocks);
          setShowImport(false);
          setLastSavedAt(parsed.updatedAt || null);
          setMessage('Loaded your autosaved document from this device.');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

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
    if (!loaded || !dirty) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveCurrent('Autosaved');
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(autosaveTimerRef.current);
  }, [currentSnapshot, dirty, loaded]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (!latestSnapshotRef.current) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latestSnapshotRef.current));
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const documentStats = useMemo(() => {
    const collapsible = blocks.filter(block => block.type === 'collapsible').length;
    return { collapsible, total: blocks.length };
  }, [blocks]);

  function autosaveCurrent(label = 'Autosaved') {
    const snapshot = makeDocumentSnapshot(docTitle, blocks, documentId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    setLastSavedAt(snapshot.updatedAt);
    setDirty(false);
    setMessage(`${label} on this device at ${formatTime(snapshot.updatedAt)}.`);
  }

  function createManualVersion(reason = 'Manual save') {
    const snapshot = makeDocumentSnapshot(docTitle, blocks, documentId);
    const version = {
      ...snapshot,
      versionId: uid(),
      reason
    };

    const next = [version, ...getVersions()].slice(0, MAX_MANUAL_VERSIONS);
    setVersions(next);
    setVersionState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    setLastSavedAt(snapshot.updatedAt);
    setDirty(false);
    setMessage(`${reason} saved. Keeping the last ${MAX_MANUAL_VERSIONS} manual versions.`);
  }

  function createSafetyBackup(reason) {
    if (!blocks.length && !cleanText(pasteText)) return;
    const snapshot = {
      ...makeDocumentSnapshot(docTitle, blocks, documentId),
      reason: reason || 'Safety backup',
      versionId: uid()
    };
    localStorage.setItem(SAFETY_KEY, JSON.stringify(snapshot));
  }

  function hasWork() {
    return blocks.length > 0 || !!cleanText(pasteText);
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
    setMessage('Loaded pasted text. Highlight the exact words/sentences to collapse, then press Make collapsible.');
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (hasWork() && blocks.length) {
        const ok = window.confirm('Open this file and replace the current document on screen? Your current document will be saved as a safety backup first.');
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

      setDocumentId(uid());
      setDocTitle(file.name.replace(/\.[^.]+$/, ''));
      setBlocks([makeTextBlock(text)]);
      setShowImport(false);
      setMessage(`Imported ${file.name}. Highlight exact text to collapse it.`);
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
        setMessage('That file is not a valid collapsible document export.');
        return;
      }

      if (hasWork()) {
        const ok = window.confirm('Import this saved document? Your current document will be saved as a safety backup first.');
        if (!ok) {
          setMessage('Import cancelled. Your current document was not changed.');
          return;
        }
        createSafetyBackup('Before importing document');
      }

      setDocumentId(parsed.documentId || uid());
      setDocTitle(parsed.title || 'Imported Document');
      setBlocks(parsed.blocks);
      setShowImport(false);
      setShowOptions(false);
      setMessage(`Imported ${file.name}.`);
    } catch {
      setMessage('Could not import that document file. Use a .collapsible-doc or JSON export from this app.');
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
    if (showImport && cleanText(pasteText) && collapseSelectionFromPasteBox()) return;
    if (collapseSelectionFromTextBlock()) return;

    if (showImport && cleanText(pasteText) && !blocks.length) {
      loadPasteText();
      return;
    }

    setMessage('Highlight the exact text you want to collapse, then press Make collapsible. Existing collapsible portions are protected.');
  }

  function updateBlock(id, changes) {
    setBlocks(current => current.map(block => block.id === id ? { ...block, ...changes } : block));
  }

  function deleteBlock(id) {
    const ok = window.confirm('Delete this collapsible portion? A safety backup will be saved first.');
    if (!ok) {
      setMessage('Delete cancelled.');
      return;
    }
    createSafetyBackup('Before deleting a section');
    setBlocks(current => current.filter(block => block.id !== id));
    setMessage('Deleted that portion. A safety backup was saved on this device.');
  }

  function expandAll(open) {
    setBlocks(current => current.map(block => block.type === 'collapsible' ? { ...block, isOpen: open } : block));
    setShowViewMenu(false);
    setMessage(open ? 'Expanded all collapsible portions.' : 'Collapsed all collapsible portions.');
  }

  function clearDocument() {
    if (hasWork()) {
      const ok = window.confirm('Start a new blank document? Your current document will be saved as a safety backup first.');
      if (!ok) {
        setMessage('New document cancelled. Your current document was not changed.');
        return;
      }
      createSafetyBackup('Before starting new document');
    }

    setDocumentId(uid());
    setDocTitle('Untitled Document');
    setBlocks([]);
    setPasteText('');
    setShowImport(true);
    setShowOptions(false);
    setShowVersions(false);
    setMessage('Started a new blank document. A safety backup was saved if there was previous work.');
    localStorage.removeItem(STORAGE_KEY);
  }

  function restoreCollapsibleToText(id) {
    createSafetyBackup('Before restoring collapsible section to normal text');
    setBlocks(current => current.map(block => {
      if (block.id !== id) return block;
      return makeTextBlock(block.content);
    }));
    setMessage('Restored that collapsible portion back into normal document text using its current edited full text.');
  }

  function exportDocument(snapshot = currentSnapshot) {
    downloadFile(
      `${safeFilename(snapshot.title)}.collapsible-doc`,
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
    const ok = window.confirm('Restore this previous version? Your current document will be saved as a safety backup first.');
    if (!ok) {
      setMessage('Restore cancelled.');
      return;
    }
    createSafetyBackup('Before restoring previous version');
    setDocumentId(version.documentId || uid());
    setDocTitle(version.title || 'Restored Document');
    setBlocks(version.blocks || []);
    setShowVersions(false);
    setShowImport(false);
    setMessage(`Restored version from ${formatTime(version.updatedAt)}.`);
  }

  function openOptionsAction(action) {
    setShowOptions(false);
    action();
  }

  return (
    <div className="app-shell">
      <header className="compact-header">
        <div className="title-area">
          <p className="eyebrow">Collapsible document editor</p>
          <input className="title-input" value={docTitle} onChange={event => setDocTitle(event.target.value)} aria-label="Document title" />
        </div>
        <div className="status-card">
          <strong>{documentStats.collapsible}</strong>
          <span>collapsible</span>
          <small>{dirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Not saved yet'}</small>
        </div>
      </header>

      <nav className="toolbar">
        <button onClick={() => setShowImport(value => !value)}><ClipboardPaste size={18} /> Paste/import</button>
        <button className="primary" onClick={makeSelectedCollapsible}><Layers size={18} /> Make collapsible</button>

        <div className="menu-wrap wide-only">
          <button onClick={() => setShowViewMenu(value => !value)}><ChevronDown size={18} /> View</button>
          {showViewMenu && (
            <div className="menu-card small-menu">
              <button onClick={() => expandAll(false)}><ChevronRight size={18} /> Collapse all</button>
              <button onClick={() => expandAll(true)}><ChevronDown size={18} /> Expand all</button>
            </div>
          )}
        </div>

        <button className="wide-only" onClick={() => createManualVersion()}><Save size={18} /> Save</button>

        <div className="menu-wrap">
          <button onClick={() => setShowOptions(value => !value)}><MoreHorizontal size={18} /> Options</button>
          {showOptions && (
            <div className="menu-card options-menu">
              <p className="menu-label">Document</p>
              <button onClick={() => openOptionsAction(() => createManualVersion())}><Save size={18} /> Save version</button>
              <button onClick={() => openOptionsAction(() => fileInputRef.current?.click())}><FileUp size={18} /> Upload Word/text file</button>
              <button onClick={() => openOptionsAction(() => importDocumentRef.current?.click())}><Upload size={18} /> Import document</button>
              <button onClick={() => openOptionsAction(() => exportDocument())}><Download size={18} /> Export document</button>
              <button onClick={() => openOptionsAction(exportHtml)}><Download size={18} /> Export HTML</button>
              <button onClick={() => { setShowVersions(value => !value); setShowOptions(false); }}><History size={18} /> Previous versions</button>
              <p className="menu-label mobile-only">View</p>
              <button className="mobile-only" onClick={() => openOptionsAction(() => expandAll(false))}><ChevronRight size={18} /> Collapse all</button>
              <button className="mobile-only" onClick={() => openOptionsAction(() => expandAll(true))}><ChevronDown size={18} /> Expand all</button>
              <div className="menu-divider" />
              <button className="danger" onClick={() => openOptionsAction(clearDocument)}><X size={18} /> New document</button>
            </div>
          )}
        </div>

        <input ref={fileInputRef} className="hidden" type="file" accept=".docx,.txt,.md,.html" onChange={handleFileUpload} />
        <input ref={importDocumentRef} className="hidden" type="file" accept=".collapsible-doc,.json" onChange={handleImportDocument} />
      </nav>

      <p className="message">{message}</p>

      {showImport && (
        <section className="import-panel">
          <h2>Paste copied Word text</h2>
          <p>Paste the document here. Highlight a small part and press Make collapsible, or load the whole pasted document first.</p>
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
              <p>Manual saves only. The newest {MAX_MANUAL_VERSIONS} versions are kept.</p>
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
                {block.isOpen ? (
                  <>
                    <div className="inline-collapse-tools">
                      <button className="collapse-toggle" onClick={() => updateBlock(block.id, { isOpen: false })}>
                        <ChevronDown size={18} /> Collapse this portion
                      </button>
                      <input
                        className="preview-mini-editor"
                        value={block.preview}
                        onChange={event => updateBlock(block.id, { preview: event.target.value })}
                        placeholder="Collapsed preview text..."
                        title="This is what will show when collapsed"
                      />
                    </div>
                    <AutoResizeTextarea
                      className="expanded-editor document-flow-editor"
                      value={block.content}
                      onChange={event => updateBlock(block.id, { content: event.target.value })}
                      placeholder="Full section text..."
                    />
                  </>
                ) : (
                  <div className="collapsed-line">
                    <button className="collapse-toggle" onClick={() => updateBlock(block.id, { isOpen: true })}>
                      <ChevronRight size={18} />
                    </button>
                    <input
                      className="preview-editor"
                      value={block.preview}
                      onChange={event => updateBlock(block.id, { preview: event.target.value })}
                      placeholder="Write the short collapsed preview here..."
                    />
                  </div>
                )}

                <div className="block-actions collapse-actions">
                  <button onClick={() => updateBlock(block.id, { isOpen: !block.isOpen })}>{block.isOpen ? 'Collapse' : 'Expand'}</button>
                  <button onClick={() => navigator.clipboard?.writeText(block.content).then(() => setMessage('Copied expanded section text.'))}>Copy full text</button>
                  <button onClick={() => restoreCollapsibleToText(block.id)}><RotateCcw size={16} /> Restore to normal text</button>
                </div>
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
