// Splits the agent's final answer into natural WhatsApp message segments (AC#4).
// Pure function — fully unit-testable, no I/O.

const SINGLE_SEGMENT_MAX = 280;
const MIN_SEGMENT_CHARS = 40;
const MAX_SEGMENTS = 4;

/**
 * Splits a response into 1–4 natural message segments:
 *   - ≤280 chars → single segment.
 *   - else split on double newlines (paragraph breaks).
 *   - if there are no double newlines, split on sentence boundaries (`. `).
 * Tiny tail segments (<40 chars) are merged into the previous segment, and the
 * result is capped at 4 segments (extras are merged into the last).
 *
 * Returns a non-empty array. An all-whitespace/empty input yields `['']`.
 */
export function splitResponse(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [''];
  if (trimmed.length <= SINGLE_SEGMENT_MAX) return [trimmed];

  let parts = splitOnDoubleNewlines(trimmed);
  if (parts.length === 1) {
    parts = splitOnSentences(trimmed);
  }

  parts = mergeTinySegments(parts);
  parts = capSegments(parts);

  return parts.length > 0 ? parts : [trimmed];
}

function splitOnDoubleNewlines(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitOnSentences(text: string): string[] {
  // Split after sentence-ending punctuation followed by whitespace, keeping the
  // punctuation with its sentence.
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  if (!sentences) return [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Merges any segment shorter than MIN_SEGMENT_CHARS into the previous one. */
function mergeTinySegments(parts: string[]): string[] {
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length > 0 && part.length < MIN_SEGMENT_CHARS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`.trim();
    } else {
      merged.push(part);
    }
  }
  // A tiny FIRST segment can't merge backward; fold it forward into the next.
  if (merged.length > 1 && merged[0]!.length < MIN_SEGMENT_CHARS) {
    merged[1] = `${merged[0]} ${merged[1]}`.trim();
    merged.shift();
  }
  return merged;
}

/** Caps at MAX_SEGMENTS by appending overflow to the last kept segment. */
function capSegments(parts: string[]): string[] {
  if (parts.length <= MAX_SEGMENTS) return parts;
  const head = parts.slice(0, MAX_SEGMENTS - 1);
  const tail = parts.slice(MAX_SEGMENTS - 1).join(' ').trim();
  return [...head, tail];
}
