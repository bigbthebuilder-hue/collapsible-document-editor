import { normalizeMarks } from './formatting.js';

// Parse inert input and read text plus the two allowed marks. Never render HTML.
export function importHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  function read(root) {
    let content = ''; const marks = [];
    function walk(node, bold = false, highlight = false) {
      if (node.nodeType === 3) {
        const start = content.length; content += node.nodeValue;
        if (bold || highlight) marks.push({ start, end: content.length, bold, highlight });
        return;
      }
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|SVG|NOSCRIPT)$/.test(node.tagName)) return;
      if (node.tagName === 'BR') { content += '\n'; return; }
      const isBlock = /^(P|DIV|LI|H[1-6])$/.test(node.tagName);
      if (isBlock && content && !content.endsWith('\n')) content += '\n\n';
      bold ||= /^(B|STRONG)$/.test(node.tagName) || /^(bold|[6-9]00)$/.test(node.style.fontWeight);
      highlight ||= node.tagName === 'MARK' || /^(yellow|#ffff00|rgb\(255, 255, 0\)|rgb\(255, 240, 166\))$/.test(node.style.backgroundColor);
      node.childNodes.forEach(child => walk(child, bold, highlight));
      if (isBlock && content && !content.endsWith('\n')) content += '\n\n';
    }
    root.childNodes.forEach(child => walk(child));
    // Drop only synthetic block separators at the end.
    content = content.replace(/\n\n$/, '');
    return { content, marks: normalizeMarks(content, marks) };
  }
  const details = [...doc.body.querySelectorAll(':scope > details')];
  if (!details.length) return [{ type: 'text', ...read(doc.body) }];
  // Talk Doc HTML exports use top-level paragraphs and details.
  return [...doc.body.children].filter(n => n.tagName !== 'H1').map(node => {
    if (node.tagName !== 'DETAILS') return { type: 'text', ...read(node) };
    const summary = node.querySelector('summary');
    const preview = summary?.textContent || 'Collapsed section'; summary?.remove();
    return { type: 'collapsible', preview, isOpen: node.hasAttribute('open'), ...read(node) };
  });
}
