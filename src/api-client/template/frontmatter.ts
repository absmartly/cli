import yaml from 'js-yaml';

export interface Frontmatter {
  data: Record<string, unknown>;
  content: string;
}

const DELIMITER = '---';
const YAML_LANGUAGES = new Set(['yaml', 'yml']);
const MAX_FRONTMATTER_NODES = 100_000;

/**
 * Splits `---` YAML frontmatter from a markdown body, following gray-matter's
 * delimiter rules. This replaces gray-matter, which evaluates `---js`
 * frontmatter with eval(), caches every parsed document in a module-level
 * object that never shrinks, and strips comments with a regex that is
 * quadratic on whitespace-heavy input. Template content reaches this parser
 * from untrusted callers (the /mcp endpoint), so it must stay linear and must
 * never execute code.
 */
export function splitFrontmatter(input: string): Frontmatter {
  const str = input.charAt(0) === '\uFEFF' ? input.slice(1) : input;
  if (!str.startsWith(DELIMITER) || str.charAt(DELIMITER.length) === '-') {
    return { data: {}, content: str };
  }

  let rest = str.slice(DELIMITER.length);
  // Same quirk as gray-matter: with no newline at all, the last character is
  // left out of the language name.
  const language = rest.slice(0, rest.search(/\r?\n/));
  if (language.trim()) {
    if (!YAML_LANGUAGES.has(language.trim().toLowerCase())) {
      throw new Error(
        `Unsupported frontmatter language "${language.trim()}": only YAML is allowed`
      );
    }
    rest = rest.slice(language.length);
  }

  const close = '\n' + DELIMITER;
  const closeIndex = rest.indexOf(close);
  const block = closeIndex === -1 ? rest : rest.slice(0, closeIndex);
  let content = closeIndex === -1 ? '' : rest.slice(closeIndex + close.length);
  if (content.charAt(0) === '\r') content = content.slice(1);
  if (content.charAt(0) === '\n') content = content.slice(1);

  return { data: loadYamlMapping(block), content };
}

function loadYamlMapping(block: string): Record<string, unknown> {
  const loaded = yaml.load(block);
  if (!isPlainObject(loaded)) return {};
  assertBoundedSize(loaded);
  return loaded;
}

/**
 * YAML aliases (`*ref`) reuse one node in many places, so a few hundred bytes
 * can stand for billions of values once the template is copied or serialised
 * (a "billion laughs" document), and a self-referencing alias makes a cycle.
 * Count nodes the way a consumer walks them, revisits included, and charge
 * each node's children before queueing them, so work and pending storage both
 * stay under a budget no real template comes near.
 */
function assertBoundedSize(root: Record<string, unknown>): void {
  const stack: unknown[] = [root];
  let scheduled = 1;
  while (stack.length > 0) {
    const node = stack.pop();
    if (!Array.isArray(node) && !isPlainObject(node)) continue;
    const children = Object.values(node);
    scheduled += children.length;
    if (scheduled > MAX_FRONTMATTER_NODES) {
      throw new Error(`Frontmatter expands to more than ${MAX_FRONTMATTER_NODES} values`);
    }
    for (const child of children) stack.push(child);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}
