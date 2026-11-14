/**
 * Repository lint rules that Oxlint has no built-in rule for. .oxlintrc.json loads this file as
 * a JS plugin named "wkc". tools/oxlintPlugin.test.ts runs Oxlint on probe files to prove each
 * rule fires where it should.
 */

interface Node {
  type: string;
  operator?: string;
  name?: Node | string;
  value?: unknown;
  property?: Node;
  callee?: Node;
}

interface RuleContext {
  readonly filename: string;
  report(descriptor: { node: Node; message: string }): void;
}

/**
 * Where native drag and pointer capture are allowed, next to the rule that bans them elsewhere.
 * - The activity kit's useCarry is the one drag implementation, with its click alternative.
 * - The paint studio paints with the pointer and has its sticky pen as the click alternative.
 * Native form controls and text selection need no entry: they use none of the banned names, and
 * the platform already gives them a keyboard alternative.
 */
export const NATIVE_DRAG_EXEMPT = ['src/activityShell/carry/', 'src/features/paint-studio/'] as const;

function isExempt(filename: string): boolean {
  const path = filename.replaceAll('\\', '/');
  return NATIVE_DRAG_EXEMPT.some((prefix) => path.includes(`/${prefix}`) || path.startsWith(prefix));
}

function identifierName(node: Node | string | undefined): string | undefined {
  if (typeof node === 'string') return node;
  if (node?.type === 'JSXIdentifier' || node?.type === 'Identifier')
    return typeof node.name === 'string' ? node.name : undefined;
  return undefined;
}

/** `draggable={false}` turns native drag off, so it is allowed. Anything else turns it on. */
function turnsDragOff(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('expression' in value)) return false;
  const expression = value.expression;
  return (
    typeof expression === 'object' &&
    expression !== null &&
    'type' in expression &&
    expression.type === 'Literal' &&
    'value' in expression &&
    expression.value === false
  );
}

const plugin = {
  meta: { name: 'wkc' },
  rules: {
    /**
     * Bans ** and **=. They round like Math.pow, which can differ in the last bit between
     * builds of V8. Paint code uses pow from src/core/paint/math.ts or plain multiplication.
     */
    'no-exponent-operator': {
      create(context: RuleContext) {
        const message =
          'The paint engine needs exact math. Use pow from src/core/paint/math.ts or multiply, not the ** operator.';
        return {
          BinaryExpression(node: Node) {
            if (node.operator === '**') context.report({ node, message });
          },
          AssignmentExpression(node: Node) {
            if (node.operator === '**=') context.report({ node, message });
          },
        };
      },
    },
    /**
     * Bans native drag outside NATIVE_DRAG_EXEMPT: a truthy `draggable`, any `onDrag*` handler,
     * and `setPointerCapture`. Every drag uses useCarry, which also works by click to pick up and
     * click to place (hard rule 7).
     */
    'no-native-drag': {
      create(context: RuleContext) {
        if (isExempt(context.filename)) return {};
        const message =
          'Hard rule 7: move things with useCarry from src/activityShell/carry/useCarry.ts, which also supports click to pick up and click to place.';
        return {
          JSXAttribute(node: Node) {
            const name = identifierName(node.name);
            if (name === undefined) return;
            if (name === 'draggable' && !turnsDragOff(node.value)) context.report({ node, message });
            if (name.startsWith('onDrag')) context.report({ node, message });
          },
          MemberExpression(node: Node) {
            if (identifierName(node.property) === 'setPointerCapture') context.report({ node, message });
          },
        };
      },
    },
  },
};

export default plugin;
