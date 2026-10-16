// Linear-time stand-ins for regexes that backtracked polynomially on crafted
// input. Each returns exactly what the regex in its doc comment returned.

function isLineTerminator(ch: string): boolean {
  return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

/** `/<(.+?)>/.exec(text)?.[1]`, e.g. the email in `Jane Doe <jane@example.com>` */
export function extractAngleBracketed(text: string): string | undefined {
  let open = text.indexOf('<');
  while (open !== -1) {
    let j = open + 1;
    for (; j < text.length && !isLineTerminator(text.charAt(j)); j++) {
      if (text.charAt(j) === '>' && j > open + 1) return text.slice(open + 1, j);
    }
    // Every `<` before the terminator would stop at the same terminator.
    open = text.indexOf('<', j);
  }
  return undefined;
}

/** `text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => replacer(alt, url))` */
export function replaceMarkdownImages(
  text: string,
  replacer: (alt: string, url: string) => string
): string {
  let out = '';
  let copied = 0;
  let from = 0;
  for (;;) {
    const start = text.indexOf('![', from);
    if (start === -1) break;
    const altEnd = text.indexOf(']', start + 2);
    if (altEnd === -1) break;
    const urlEnd = text.charAt(altEnd + 1) === '(' ? text.indexOf(')', altEnd + 2) : -2;
    if (urlEnd === -1) break;
    if (urlEnd === -2 || urlEnd === altEnd + 2) {
      // Any `![` before `altEnd` shares this `]` and fails the same way.
      from = altEnd;
      continue;
    }
    out +=
      text.slice(copied, start) +
      replacer(text.slice(start + 2, altEnd), text.slice(altEnd + 2, urlEnd));
    copied = from = urlEnd + 1;
  }
  return out + text.slice(copied);
}
