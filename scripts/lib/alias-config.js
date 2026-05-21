import * as ts from 'typescript';

function getPropertyName(node, sourceFile) {
  if (!node) {
    return null;
  }

  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }

  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text;
  }

  return node.getText(sourceFile);
}

function collectObjectLiteralBindings(sourceFile) {
  const bindings = new Map();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)
    ) {
      bindings.set(node.name.text, node.initializer);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectAliasKeysFromExpression(expression, sourceFile, bindings, visited = new Set()) {
  const keys = [];
  const current = unwrapExpression(expression);

  if (ts.isIdentifier(current)) {
    if (visited.has(current.text)) {
      return keys;
    }

    const binding = bindings.get(current.text);
    if (binding) {
      visited.add(current.text);
      keys.push(...collectAliasKeysFromExpression(binding, sourceFile, bindings, visited));
      visited.delete(current.text);
    }
    return keys;
  }

  if (ts.isArrayLiteralExpression(current)) {
    for (const element of current.elements) {
      const candidate = unwrapExpression(element);
      if (!ts.isObjectLiteralExpression(candidate)) {
        continue;
      }

      for (const property of candidate.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }
        const name = getPropertyName(property.name, sourceFile);
        if (name !== 'find') {
          continue;
        }
        const initializer = unwrapExpression(property.initializer);
        if (ts.isStringLiteralLike(initializer)) {
          keys.push(initializer.text);
        }
      }
    }
    return keys;
  }

  if (!ts.isObjectLiteralExpression(current)) {
    return keys;
  }

  for (const property of current.properties) {
    if (ts.isSpreadAssignment(property)) {
      keys.push(...collectAliasKeysFromExpression(property.expression, sourceFile, bindings, visited));
      continue;
    }

    if (ts.isPropertyAssignment(property)) {
      const propertyName = getPropertyName(property.name, sourceFile);
      if (propertyName) {
        keys.push(propertyName);
      }
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      keys.push(property.name.text);
    }
  }

  return keys;
}

export function extractAliasKeysFromConfigSource(sourceText, fileName = 'config.js') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  const bindings = collectObjectLiteralBindings(sourceFile);
  const aliases = [];

  function visit(node) {
    if (ts.isPropertyAssignment(node) && getPropertyName(node.name, sourceFile) === 'alias') {
      aliases.push(...collectAliasKeysFromExpression(node.initializer, sourceFile, bindings));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(aliases)].sort();
}
