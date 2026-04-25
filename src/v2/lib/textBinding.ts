import diff from 'fast-diff';
import type * as Y from 'yjs';

// Minimal text binding: translate "old text → new text" into Y.Text
// insert/delete operations using fast-diff's positional output. Keeps Yjs
// happy without needing ProseMirror or a structured editor binding.
export const applyTextDiff = (ytext: Y.Text, oldText: string, newText: string) => {
  if (oldText === newText) return;
  const ops = diff(oldText, newText);
  ytext.doc!.transact(() => {
    let pos = 0;
    for (const [op, value] of ops) {
      if (op === 0) pos += value.length;            // EQUAL
      else if (op === -1) ytext.delete(pos, value.length); // DELETE
      else { ytext.insert(pos, value); pos += value.length; } // INSERT
    }
  }, 'local');
};

// Caret offset within the editable element, expressed as a count of
// characters in the linear textContent. Survives a full innerHTML rebuild
// by re-walking the new DOM until we hit the same offset.
export const getCaretOffset = (root: HTMLElement): number | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
};

export const setCaretOffset = (root: HTMLElement, offset: number) => {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.nodeValue?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode() as Text | null;
  }
  // Fallback: place at end.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
};
