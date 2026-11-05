// Hand-written scanners that return exactly what the regex in each doc
// comment returned. Those regexes backtracked polynomially
// (or worse) on crafted input, and template content arrives from untrusted
// callers, so each scanner visits every character a bounded number of times.

/** `/```json\s*\n([\s\S]*?)\n\s*```/.exec(content)?.[1]` */
export function findJsonFenceBody(content: string): string | undefined {
  const OPEN = '```json';
  const FENCE = '```';
  const open = content.indexOf(OPEN);
  // Later openings can only see a subset of the closings this one can, so if
  // the first opening followed by a newline finds no closing, none will.
  for (let i = open; i !== -1; i = content.indexOf(OPEN, i + 1)) {
    const afterOpen = i + OPEN.length;
    // Find the last two newlines inside the opening whitespace run only, so
    // a run of invalid openings never rescans the input before it.
    let runEnd = afterOpen;
    let lastNewline = -1;
    let previousNewline = -1;
    for (; runEnd < content.length && isWhitespace(content.charAt(runEnd)); runEnd++) {
      if (content.charAt(runEnd) === '\n') {
        previousNewline = lastNewline;
        lastNewline = runEnd;
      }
    }
    if (lastNewline === -1) continue;

    const bodyStart = lastNewline + 1;
    for (let nl = content.indexOf('\n', bodyStart); nl !== -1; ) {
      const fence = skipWhitespace(content, nl + 1);
      if (content.startsWith(FENCE, fence)) return content.slice(bodyStart, nl);
      // Every newline before `fence` is followed by the same whitespace run.
      nl = content.indexOf('\n', fence);
    }

    // Backtracking: an earlier newline in the opening run can close a
    // whitespace-only body when a fence directly follows that run.
    if (previousNewline !== -1 && content.startsWith(FENCE, runEnd)) {
      return content.slice(previousNewline + 1, lastNewline);
    }
    return undefined;
  }
  return undefined;
}

/** `/^[^\S\n]*-\s+(.+)$/.exec(line)?.[1]` for a line without `\n` */
export function matchListItem(line: string): string | undefined {
  const dash = skipWhitespace(line, 0);
  if (line.charAt(dash) !== '-') return undefined;
  const rest = line.slice(dash + 1);
  const valueStart = Math.min(skipWhitespace(rest, 0), rest.length - 1);
  if (valueStart < 1 || lastLineTerminator(rest) >= valueStart) return undefined;
  return rest.slice(valueStart);
}

/** `/^(\w+):\s*(.*)$/.exec(line)` groups for a line without `\n` */
export function matchVariantKeyValue(line: string): [string, string] | undefined {
  const keyMatch = /^\w+:/.exec(line);
  if (!keyMatch) return undefined;
  const rest = line.slice(keyMatch[0].length);
  const valueStart = skipWhitespace(rest, 0);
  if (lastLineTerminator(rest) >= valueStart) return undefined;
  return [keyMatch[0].slice(0, -1), rest.slice(valueStart)];
}

/** Groups of every `/### (.+?)\s*\n([\s\S]*?)(?=###|$)/g` match */
export function matchCustomFields(content: string): Array<[string, string]> {
  const HEADING = '### ';
  const matches: Array<[string, string]> = [];
  let from = 0;
  while (from < content.length) {
    const heading = content.indexOf(HEADING, from);
    if (heading === -1) break;
    const nameStart = heading + HEADING.length;
    const name = scanHeadingName(content, nameStart);
    if (name.end === -1) {
      // Headings before `name.resume` would fail on the same character.
      from = Math.max(name.resume, heading + 1);
      continue;
    }
    const bodyStart = content.lastIndexOf('\n', skipWhitespace(content, name.end) - 1) + 1;
    const nextHeading = content.indexOf('###', bodyStart);
    const bodyEnd = nextHeading === -1 ? content.length : nextHeading;
    matches.push([content.slice(nameStart, name.end), content.slice(bodyStart, bodyEnd)]);
    from = bodyEnd;
  }
  return matches;
}

/**
 * Finds where `(.+?)\s*\n` stops its lazy name: the first position after at
 * least one non-terminator character whose whitespace run contains `\n`.
 * On failure `end` is -1 and `resume` is the terminator (or end of input)
 * that ended the scan.
 */
function scanHeadingName(content: string, start: number): { end: number; resume: number } {
  if (start >= content.length || isLineTerminator(content.charAt(start))) {
    return { end: -1, resume: start };
  }
  let i = start + 1;
  while (i < content.length) {
    if (!isWhitespace(content.charAt(i))) {
      i++;
      continue;
    }
    const runEnd = skipWhitespace(content, i);
    const run = content.slice(i, runEnd);
    if (run.includes('\n')) return { end: i, resume: i };
    const terminator = lastLineTerminator(run);
    if (terminator !== -1) return { end: -1, resume: i + terminator };
    i = runEnd;
  }
  return { end: -1, resume: content.length };
}

function lastLineTerminator(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (isLineTerminator(text.charAt(i))) return i;
  }
  return -1;
}

const WHITESPACE = /\s/;

/** Characters `.` does not match without the `s` flag. */
function isLineTerminator(ch: string): boolean {
  return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

/** Characters `\s` matches. */
function isWhitespace(ch: string): boolean {
  return WHITESPACE.test(ch);
}

/** Index of the first non-`\s` character at or after `from`. */
function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && isWhitespace(text.charAt(i))) i++;
  return i;
}
