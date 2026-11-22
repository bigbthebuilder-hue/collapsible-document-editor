// Formatting is data, never HTML. All offsets use native textarea UTF-16 indices.
export function normalizeMarks(text, marks = []) {
  if (!Array.isArray(marks)) return [];
  const valid = marks.filter(m => m && Number.isInteger(m.start) && Number.isInteger(m.end))
    .map(m => ({ start: Math.max(0, Math.min(text.length, m.start)), end: Math.max(0, Math.min(text.length, m.end)), bold: m.bold === true, highlight: m.highlight === true }))
    .filter(m => m.end > m.start && (m.bold || m.highlight));
  const points = [...new Set(valid.flatMap(m => [m.start, m.end]))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    const active = valid.filter(m => m.start <= start && m.end >= end);
    const bold = active.some(m => m.bold), highlight = active.some(m => m.highlight);
    if (!bold && !highlight) continue;
    const last = out.at(-1);
    if (last && last.end === start && last.bold === bold && last.highlight === highlight) last.end = end;
    else out.push({ start, end, bold, highlight });
  }
  return out;
}

export function runs(text, marks) {
  const out = []; let pos = 0;
  for (const mark of normalizeMarks(text, marks)) {
    if (mark.start > pos) out.push({ text: text.slice(pos, mark.start) });
    out.push({ text: text.slice(mark.start, mark.end), bold: mark.bold, highlight: mark.highlight });
    pos = mark.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export function isMarked(text, marks, start, end, kind) {
  if (start >= end) return false;
  return runs(text.slice(start, end), sliceMarks(text, marks, start, end)).every(r => r[kind]);
}

export function sliceMarks(text, marks, start, end) {
  return normalizeMarks(text, marks).filter(m => m.end > start && m.start < end)
    .map(m => ({ ...m, start: Math.max(m.start, start) - start, end: Math.min(m.end, end) - start }));
}

export function toggleMark(text, marks, start, end, kind) {
  if (!['bold', 'highlight'].includes(kind) || start >= end) return normalizeMarks(text, marks);
  const remove = isMarked(text, marks, start, end, kind);
  const next = [];
  for (const m of normalizeMarks(text, marks)) {
    if (!remove || m.end <= start || m.start >= end) { next.push(m); continue; }
    if (m.start < start) next.push({ ...m, end: start });
    next.push({ ...m, start: Math.max(start, m.start), end: Math.min(end, m.end), [kind]: false });
    if (m.end > end) next.push({ ...m, start: end });
  }
  if (!remove) next.push({ start, end, [kind]: true });
  return normalizeMarks(text, next);
}

export function editMarks(oldText, newText, marks, selection) {
  if (oldText === newText) return normalizeMarks(newText, marks);
  let start = 0, end = oldText.length, inserted = '';
  // Native beforeinput disambiguates edits in repeated text.
  if (selection && newText.startsWith(oldText.slice(0, selection.start)) && newText.endsWith(oldText.slice(selection.end)) && newText.length >= selection.start + oldText.length - selection.end) {
    start = selection.start; end = selection.end;
    inserted = newText.slice(start, newText.length - (oldText.length - end));
  } else {
    while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
    let tail = 0;
    while (tail < oldText.length - start && tail < newText.length - start && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) tail++;
    end = oldText.length - tail;
    inserted = newText.slice(start, newText.length - tail);
  }
  const delta = inserted.length - (end - start), next = [];
  for (const m of normalizeMarks(oldText, marks)) {
    if (m.start < start) next.push({ ...m, end: Math.min(start, m.end) });
    if (m.end > end) next.push({ ...m, start: Math.max(end, m.start) + delta, end: m.end + delta });
    if (inserted && start === end && m.start < start && m.end >= start) {
      next.push({ ...m, start, end: start + inserted.length });
    }
  }
  if (inserted && start < end) {
    next.push({ start, end: start + inserted.length,
      bold: isMarked(oldText, marks, start, end, 'bold'),
      highlight: isMarked(oldText, marks, start, end, 'highlight') });
  }
  return normalizeMarks(newText, next);
}

export function normalizeRich(value, marks) {
  const original = String(value || '');
  const text = original.replace(/\r\n?/g, '\n');
  const normalized = normalizeMarks(original, marks).map(m => ({ ...m,
    start: original.slice(0, m.start).replace(/\r\n?/g, '\n').length,
    end: original.slice(0, m.end).replace(/\r\n?/g, '\n').length }));
  return { content: text, marks: normalizeMarks(text, normalized) };
}

export function escapeText(text) {
  return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
export function formattedHtml(text, marks) {
  return runs(text, marks).map(r => {
    let value = escapeText(r.text).replace(/\n/g, '<br>');
    if (r.bold) value = `<strong>${value}</strong>`;
    if (r.highlight) value = `<mark>${value}</mark>`;
    return value;
  }).join('');
}
