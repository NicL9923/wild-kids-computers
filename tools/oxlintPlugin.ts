/**
 * Repository lint rules that Oxlint has no built-in rule for. .oxlintrc.json loads this file as
 * a JS plugin named "wkc". tools/oxlintPlugin.test.ts runs Oxlint on probe files to prove each
 * rule fires where it should.
 */

interface Node {
  type: string;
  operator?: string;
}

interface RuleContext {
  report(descriptor: { node: Node; message: string }): void;
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
  },
};

export default plugin;
