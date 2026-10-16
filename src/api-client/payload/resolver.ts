export interface ResolverContext {
  applications: Array<{ id: number; name: string }>;
  unitTypes: Array<{ id: number; name: string }>;
  metrics: Array<{ id: number; name: string }>;
  goals: Array<{ id: number; name: string }>;
  users?: Array<{ id: number; email: string; first_name?: string; last_name?: string }>;
  teams?: Array<{ id: number; name: string }>;
  experimentTags?: Array<{ id: number; tag: string }>;
  customSectionFields?: Array<{
    id: number;
    name?: string;
    title?: string;
    type: string;
    default_value?: string;
    archived?: boolean;
    custom_section?: { type?: string; archived?: boolean };
  }>;
}

export function resolveByName<T extends { id: number; name: string }>(
  items: T[],
  nameOrId: string,
  entityType: string
): T {
  const trimmed = nameOrId.trim();
  const asInt = parseInt(trimmed, 10);

  if (!isNaN(asInt) && String(asInt) === trimmed) {
    const byId = items.find((item) => item.id === asInt);
    if (byId) {
      return byId;
    }
    const availableNames = items.map((item) => `"${item.name}" (id: ${item.id})`).join(', ');
    throw new Error(`${entityType} with ID ${asInt} not found. Available: ${availableNames}`);
  }

  const lowerName = trimmed.toLowerCase();
  const matches = items.filter((item) => item.name.toLowerCase() === lowerName);

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    const suggestions = matches.map((item) => `"${item.name}" (id: ${item.id})`).join(', ');
    throw new Error(`Multiple ${entityType} entries match "${trimmed}". Matches: ${suggestions}`);
  }

  const availableNames = items.map((item) => `"${item.name}" (id: ${item.id})`).join(', ');
  throw new Error(`${entityType} "${trimmed}" not found. Available: ${availableNames}`);
}

/** Index once when resolving many references against the same catalogue. */
export function createNameResolver<T extends { id: number; name: string }>(
  items: T[]
): (name: string, label: string) => T {
  const byId = new Map<number, T>();
  const byName = new Map<string, T[]>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
    const key = item.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.push(item);
    else byName.set(key, [item]);
  }
  return (name, label) => {
    const trimmed = name.trim();
    const id = parseInt(trimmed, 10);
    if (!isNaN(id) && String(id) === trimmed) {
      const match = byId.get(id);
      if (match) return match;
    } else {
      const matches = byName.get(trimmed.toLowerCase());
      if (matches?.length === 1) return matches[0]!;
    }
    // Errors retain the existing wording and input order. They stop building
    // the template, so their one-off scan does not multiply across references.
    return resolveByName(items, name, label);
  };
}
