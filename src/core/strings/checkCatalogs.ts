import { CONTENT_RULES, contentRulesMatched, type ContentRuleId } from './contentRules.ts';
import type { StringHandle } from './defineStrings.ts';

/** One catalog as the registry found it: the module path and the handles it exported. */
export interface CatalogSource {
  readonly path: string;
  readonly handles: readonly StringHandle[];
}

export interface StringProblem {
  /** The string id, or the module path for a problem with a whole catalog. */
  readonly where: string;
  readonly rule: 'duplicate-namespace' | 'mixed-namespace' | 'empty-catalog' | 'content' | 'stale-allow';
  readonly detail: string;
}

/**
 * Checks every catalog together. `defineStrings` already rejects malformed single strings; this
 * finds what only shows across strings or in their words:
 * - a namespace defined in two modules, or one module mixing namespaces
 * - a word from a content rule in the text or the speech, unless the string allows that rule
 * - an allowed rule the string no longer breaks, so allow lists cannot hide a future problem
 */
export function checkCatalogs(catalogs: readonly CatalogSource[]): StringProblem[] {
  const problems: StringProblem[] = [];
  const namespaceOwners = new Map<string, string>();

  for (const catalog of catalogs) {
    const namespaces = [...new Set(catalog.handles.map((handle) => handle.namespace))];
    const [namespace] = namespaces;
    if (namespace === undefined) {
      problems.push({ where: catalog.path, rule: 'empty-catalog', detail: 'exports no strings' });
      continue;
    }
    if (namespaces.length > 1) {
      problems.push({
        where: catalog.path,
        rule: 'mixed-namespace',
        detail: `exports strings from ${namespaces.join(', ')}. Export one defineStrings result as "strings".`,
      });
    }
    const owner = namespaceOwners.get(namespace);
    if (owner === undefined) namespaceOwners.set(namespace, catalog.path);
    else {
      problems.push({
        where: catalog.path,
        rule: 'duplicate-namespace',
        detail: `namespace "${namespace}" is already defined in ${owner}`,
      });
    }
    for (const handle of catalog.handles) problems.push(...checkContent(handle));
  }
  return problems;
}

function checkContent(handle: StringHandle): StringProblem[] {
  const said = handle.kind === 'spoken' ? `${handle.text}\n${handle.speech}` : handle.text;
  const matched = new Set<ContentRuleId>(contentRulesMatched(said));
  const problems: StringProblem[] = [];
  for (const rule of matched) {
    if (handle.allow.includes(rule)) continue;
    const { category, words } = CONTENT_RULES[rule];
    problems.push({
      where: handle.id,
      rule: 'content',
      detail: `uses a ${category} word from rule "${rule}" (${words.join(', ')}). Reword it, or add "${rule}" to allow if the use is honest.`,
    });
  }
  for (const rule of handle.allow) {
    if (!matched.has(rule)) {
      problems.push({ where: handle.id, rule: 'stale-allow', detail: `allows "${rule}" but no longer uses it` });
    }
  }
  return problems;
}

/** One readable line per problem, for a test failure message. */
export function formatProblems(problems: readonly StringProblem[]): string {
  return problems.map((problem) => `${problem.where}: [${problem.rule}] ${problem.detail}`).join('\n');
}
