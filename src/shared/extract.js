// Guesses a definition from the sentence a term was selected in.
// Plain text rules only (no AI): "X is ...", "X refers to ...", "X: ...", "... is called X".

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function tidy(s) {
  let d = s.trim().replace(/\s+/g, " ").replace(/[\s,;:]+$/, "");
  if (!/[.!?]$/.test(d)) d += ".";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function guessDefinition(term, sentence) {
  if (!term || !sentence) return "";
  const t = escapeRe(term.trim());
  const paren = "(?:\\s*\\([^)]{0,40}\\))?";
  const patterns = [
    new RegExp(`(?:^|\\b)(?:an?\\s+|the\\s+)?${t}s?${paren}\\s*,?\\s+(?:is|are|was|were)\\s+(?:defined\\s+as|known\\s+as|called\\s+)?\\s*(.{6,})`, "i"),
    new RegExp(`(?:^|\\b)(?:an?\\s+|the\\s+)?${t}s?${paren}\\s+(?:refers?\\s+to|means|denotes|describes|represents)\\s+(.{6,})`, "i"),
    new RegExp(`(?:^|\\b)${t}${paren}\\s*(?::|—|–|\\s-\\s)\\s*(.{6,})`, "i"),
    new RegExp(`^(.{6,}?),?\\s+(?:is|are)\\s+(?:called|known\\s+as|referred\\s+to\\s+as|termed)\\s+(?:an?\\s+|the\\s+)?${t}\\b`, "i"),
    new RegExp(`(?:^|\\b)${t}${paren}\\s*,\\s+(?:which|that|a|an|the)\\s+(.{6,}?)(?:,|$)`, "i"),
  ];
  for (const p of patterns) {
    const m = sentence.match(p);
    if (m && m[1]) {
      const d = m[1].replace(/[.!?]+\s*$/, "");
      if (d.length >= 6 && d.length <= 400) return tidy(d);
    }
  }
  return "";
}

/** Returns the sentence around text[index .. index+length]. */
export function sentenceAround(text, index, length) {
  if (!text) return "";
  if (index < 0) return "";
  const before = text.slice(0, index);
  const after = text.slice(index + length);
  const startMatch = before.match(/(?:[.!?]["')\]]?\s+|\n\s*\n|\n(?=[A-Z•\-–]))(?=[^.!?]*$)/);
  const start = startMatch ? startMatch.index + startMatch[0].length : Math.max(0, index - 300);
  const endMatch = after.match(/[.!?](?=["')\]]?(\s|$))|\n\s*\n/);
  const end = endMatch ? index + length + endMatch.index + 1 : Math.min(text.length, index + length + 300);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 500);
}
