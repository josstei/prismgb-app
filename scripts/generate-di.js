import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const srcDir = path.resolve('src/renderer');
const outputPath = path.resolve('src/renderer/application/di/di.generated.ts');

const scanDirs = [srcDir];
const packagesDir = path.resolve('packages');
if (fs.existsSync(packagesDir)) {
  const pkgs = fs.readdirSync(packagesDir);
  for (const pkg of pkgs) {
    const pkgSrc = path.join(packagesDir, pkg, 'src');
    if (fs.existsSync(pkgSrc) && fs.statSync(pkgSrc).isDirectory()) {
      scanDirs.push(pkgSrc);
    }
  }
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      callback(fullPath);
    }
  }
}

// Convert PascalCase to camelCase
function toCamelCase(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function getDecorators(node) {
  const decorators = [];
  if (node.decorators) {
    decorators.push(...node.decorators);
  }
  if (node.modifiers) {
    for (const m of node.modifiers) {
      if (ts.isDecorator(m)) {
        decorators.push(m);
      }
    }
  }
  return decorators;
}

function getServiceDecorator(node) {
  const decorators = getDecorators(node);
  for (const decorator of decorators) {
    const expr = decorator.expression;
    if (ts.isCallExpression(expr)) {
      const identifier = expr.expression;
      if (ts.isIdentifier(identifier) && identifier.text === 'Service') {
        return expr;
      }
    } else if (ts.isIdentifier(expr) && expr.text === 'Service') {
      return expr;
    }
  }
  return null;
}

function parseDecoratorOptions(expr) {
  const options = {};
  if (expr.arguments && expr.arguments.length > 0) {
    const arg = expr.arguments[0];
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop)) {
          let key = null;
          if (ts.isIdentifier(prop.name)) {
            key = prop.name.text;
          } else if (ts.isStringLiteral(prop.name)) {
            key = prop.name.text;
          }
          if (!key) continue;

          const valExpr = prop.initializer;
          if (ts.isStringLiteral(valExpr)) {
            options[key] = valExpr.text;
          } else if (valExpr.kind === ts.SyntaxKind.TrueKeyword) {
            options[key] = true;
          } else if (valExpr.kind === ts.SyntaxKind.FalseKeyword) {
            options[key] = false;
          } else if (ts.isArrayLiteralExpression(valExpr)) {
            options[key] = valExpr.elements
              .filter(el => ts.isStringLiteral(el))
              .map(el => el.text);
          }
        }
      }
    }
  }
  return options;
}

function scanFile(filePath) {
  const services = [];
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const serviceDecorator = getServiceDecorator(node);
      if (serviceDecorator) {
        const className = node.name.text;
        const options = parseDecoratorOptions(serviceDecorator);
        const token = options.token || toCamelCase(className);
        const lifecycle = options.lifecycle || 'singleton';
        const disposal = options.disposal || 'none';
        const dependencies = options.dependencies || [];

        const constructorNode = node.members.find(ts.isConstructorDeclaration);
        const hasConstructorParams = !!(constructorNode && constructorNode.parameters.length > 0);

        services.push({
          className,
          token,
          lifecycle,
          disposal,
          dependencies,
          hasConstructorParams,
          filePath
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return services;
}

function resolveImportPath(service) {
  if (service.filePath.includes('packages/')) {
    const match = service.filePath.replace(/\\/g, '/').match(/packages\/prismgb-([^\/]+)\/src\/(.+)$/);
    if (match) {
      return '@prismgb/' + match[1];
    }
  }
  let relPath = path.relative(path.dirname(outputPath), service.filePath);
  relPath = relPath.replace(/\.tsx?$/, '');
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath;
  }
  return relPath;
}

function readDeclaredTokens(relativePath, exportName, kind) {
  const filePath = path.resolve(relativePath);
  const sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const tokens = [];

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === exportName && node.initializer) {
      if (kind === 'objectKeys' && ts.isObjectLiteralExpression(node.initializer)) {
        for (const prop of node.initializer.properties) {
          if ((ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) && prop.name &&
              (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
            tokens.push(prop.name.text);
          }
        }
      }
      if (kind === 'arrayItems') {
        let arr = node.initializer;
        if (ts.isAsExpression(arr)) arr = arr.expression;
        if (ts.isArrayLiteralExpression(arr)) {
          arr.elements.forEach(el => { if (ts.isStringLiteral(el)) tokens.push(el.text); });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tokens;
}

function readManualProviderTokens() {
  const tokens = readDeclaredTokens('src/renderer/application/di/manual-providers.ts', 'manualProviders', 'objectKeys');
  if (tokens.length === 0) {
    throw new Error('[DI CodeGen] Could not parse any tokens from manual-providers.ts');
  }
  return tokens;
}

function readExternalTokens() {
  return readDeclaredTokens('src/renderer/application/di/external-tokens.ts', 'externallyRegisteredTokens', 'arrayItems');
}

function topologicalSort(services, nonScannedTokens) {
  const sorted = [];
  const visited = new Set();
  const temp = new Set();
  const serviceMap = new Map(services.map(s => [s.token, s]));
  const nonScannedTokenSet = new Set(nonScannedTokens);

  function visit(token) {
    if (temp.has(token)) {
      throw new Error("Circular dependency detected involving token: " + token);
    }
    if (!visited.has(token)) {
      temp.add(token);
      const service = serviceMap.get(token);
      if (service) {
        for (const dep of service.dependencies) {
          if (serviceMap.has(dep)) {
            visit(dep);
          } else if (!nonScannedTokenSet.has(dep)) {
            throw new Error(
              "[DI CodeGen] Dependency '" + dep + "' of '" + token +
              "' is neither a scanned @Service, a manual provider, nor an external token. " +
              "Add it as an @Service class, to manual-providers.ts, or to external-tokens.ts."
            );
          }
        }
        sorted.push(service);
      }
      temp.delete(token);
      visited.add(token);
    }
  }

  for (const service of services) {
    visit(service.token);
  }
  return sorted;
}

function generateDI() {
  console.log('[DI CodeGen] Scanning src/renderer and packages/prismgb-*/src for @Service annotated classes...');
  const services = [];
  
  for (const scanDir of scanDirs) {
    walkDir(scanDir, (filePath) => {
      // Skip generated files
      if (filePath.endsWith('di.generated.ts') || filePath.endsWith('di.generated.js')) {
        return;
      }
      const fileServices = scanFile(filePath);
      services.push(...fileServices);
    });
  }

  const manualTokens = readManualProviderTokens();
  const externalTokens = readExternalTokens();
  console.log('[DI CodeGen] Found ' + services.length + ' scanned services, ' + manualTokens.length + ' manual providers, ' + externalTokens.length + ' external tokens.');

  let sortedServices;
  try {
    sortedServices = topologicalSort(services, [...manualTokens, ...externalTokens]);
  } catch (err) {
    console.error('[DI CodeGen] Generation aborted: ' + err.message);
    process.exit(1);
  }

  // Build module-deduped imports
  const importsByModule = new Map();
  function addImport(module, name) {
    if (!importsByModule.has(module)) {
      importsByModule.set(module, new Set());
    }
    importsByModule.get(module).add(name);
  }
  for (const service of sortedServices) {
    addImport(resolveImportPath(service), service.className);
  }
  addImport('@prismgb/core', 'safeDispose');
  addImport('./manual-providers', 'manualProviders');

  let importsCode = '// AUTOGENERATED DEPENDENCY INJECTION CONTAINER - DO NOT EDIT DIRECTLY\n\n';
  for (const [module, names] of importsByModule) {
    importsCode += "import { " + [...names].join(', ') + " } from '" + module + "';\n";
  }

  // Build resolve cases
  let resolveCases = '';
  for (const service of sortedServices) {
    resolveCases += "      case '" + service.token + "':\n";
    if (service.hasConstructorParams) {
      resolveCases += "        instance = new " + service.className + "(this.cradle);\n";
    } else {
      resolveCases += "        instance = new " + service.className + "();\n";
    }
    resolveCases += "        break;\n";
  }

  const scannedTokensLiteral = JSON.stringify(sortedServices.map(s => s.token), null, 2);

  // Write full code
  const code = importsCode + `
export class GeneratedContainer {
  public cache: Map<string, { value: unknown }> = new Map();
  public registrations: Record<string, any> = {};
  private instances: Map<string, any> = new Map();

  constructor(overrides: Record<string, any> = {}) {
    // Pre-seed all static tokens
    const staticTokens = [...Object.keys(manualProviders), ...` + scannedTokensLiteral + `];
    for (const token of staticTokens) {
      this.registrations[token] = {};
    }

    // Pre-seed overrides
    for (const [key, val] of Object.entries(overrides)) {
      const unwrapped = val && typeof val === 'object' && 'value' in val ? val.value : val;
      this.instances.set(key, unwrapped);
      this.cache.set(key, { value: unwrapped });
      this.registrations[key] = val;
    }
  }

  public get cradle(): any {
    return new Proxy({}, {
      get: (_target: object, prop: string | symbol) => {
        if (typeof prop === 'string' && prop in this.registrations) {
          return this.resolve(prop);
        }
        return undefined;
      },
      has: (_target: object, prop: string | symbol) => {
        return typeof prop === 'string' && prop in this.registrations;
      },
      ownKeys: () => []
    }) as any;
  }

  public register(registrations: Record<string, any>) {
    for (const [key, resolver] of Object.entries(registrations)) {
      this.registrations[key] = resolver;
      const unwrapped = resolver && typeof resolver === 'object' && 'value' in resolver ? resolver.value : resolver;
      this.instances.set(key, unwrapped);
      this.cache.set(key, { value: unwrapped });
    }
  }

  public resolve<T = unknown>(token: string): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    let instance: any;
    switch (token) {
      // Scanned @Service class instantiations
` + resolveCases + `
      default: {
        const provider = manualProviders[token];
        if (!provider) {
          throw new Error("[GeneratedContainer] Could not resolve token: " + token);
        }
        instance = provider((dependencyToken) => this.resolve(dependencyToken));
      }
    }

    this.instances.set(token, instance);
    this.cache.set(token, { value: instance });
    this.registrations[token] = { value: instance };
    return instance as T;
  }

  public async dispose(): Promise<void> {
    const logger = this.resolve<any>('loggerFactory').create('Container');
    for (const [token, instance] of this.instances.entries()) {
      if (!instance) continue;
      const method = typeof instance.dispose === 'function' ? 'dispose' : (typeof instance.cleanup === 'function' ? 'cleanup' : undefined);
      if (method) {
        await safeDispose(logger, token, instance, method);
      }
    }
    this.instances.clear();
    this.cache.clear();
    this.registrations = {};
  }
}
`;

  fs.writeFileSync(outputPath, code, 'utf8');
  console.log('[DI CodeGen] Generated ' + outputPath + ' successfully.');
}

generateDI();
