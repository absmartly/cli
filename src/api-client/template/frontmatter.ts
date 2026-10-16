import yaml from 'js-yaml';

export interface Frontmatter {
  data: Record<string, unknown>;
  content: string;
}

const DELIMITER = '---';
const YAML_LANGUAGES = new Set(['yaml', 'yml']);

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

// js-yaml's default !!omap resolver scans an array of prior keys for each
// entry (quadratic). Keep the other default YAML types, but refuse !!omap.
const TEMPLATE_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('tag:yaml.org,2002:omap', {
    kind: 'sequence',
    resolve: () => {
      throw new Error('YAML !!omap is not supported in templates');
    },
  }),
]);

function loadYamlMapping(block: string): Record<string, unknown> {
  const loaded = yaml.load(block, { schema: TEMPLATE_SCHEMA, listener: rejectAnchors });
  return isPlainObject(loaded) ? loaded : {};
}

/**
 * YAML anchors (`&ref`) and aliases (`*ref`) let a few hundred bytes stand for
 * gigabytes once a value is reused in many places (a "billion laughs"
 * document), whether the reused node is a collection or one long string, and
 * a self-reference makes a cycle. Templates never need them, so any anchor
 * fails the parse before an alias can be resolved; an alias without an anchor
 * is already a js-yaml error.
 */
function rejectAnchors(eventType: yaml.EventType, state: yaml.State): void {
  // js-yaml sets `anchor` on its loader state, but @types/js-yaml omits it.
  const { anchor } = state as yaml.State & { anchor?: string | null };
  if (eventType === 'close' && anchor != null) {
    throw new Error(`YAML anchors and aliases are not supported (found "&${anchor}")`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}
