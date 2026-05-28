import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const srcDir = path.resolve('src/renderer');
const outputPath = path.resolve('src/renderer/di.generated.ts');

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

function topologicalSort(services) {
  const sorted = [];
  const visited = new Set();
  const temp = new Set();
  const serviceMap = new Map(services.map(s => [s.token, s]));

  // Standard static infrastructure tokens that are not scanned classes
  const customTokens = new Set([
    'storageService',
    'browserMediaService',
    'deviceIpcAdapter',
    'deviceChangeDebounceAdapter',
    'canvasRenderLoopService',
    'gpuFrameBuffer',
    'streamingRendererFactory',
    'ipcClient',
    'deviceStatusProvider',
    'adapterFactory',
    'uiComponentRegistry',
    'animationCache'
  ]);

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
          } else if (!customTokens.has(dep) && dep !== 'uiController') {
            console.warn("[DI Emitter Warning] Dependency " + dep + " of " + token + " is not a scanned service.");
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

  console.log('[DI CodeGen] Found ' + services.length + ' services. Topologically sorting...');
  let sortedServices;
  try {
    sortedServices = topologicalSort(services);
  } catch (err) {
    console.error('[DI CodeGen] Generation aborted: ' + err.message);
    process.exit(1);
  }

  // Build imports
  let importsCode = '// AUTOGENERATED DEPENDENCY INJECTION CONTAINER - DO NOT EDIT DIRECTLY\n\n';
  
  // Scanned service imports
  for (const service of sortedServices) {
    let relPath;
    if (service.filePath.includes('packages/')) {
      const match = service.filePath.replace(/\\/g, '/').match(/packages\/prismgb-([^\/]+)\/src\/(.+)$/);
      if (match) {
        const pkgName = match[1];
        relPath = '@prismgb/' + pkgName;
      }
    }
    if (!relPath) {
      relPath = path.relative(path.dirname(outputPath), service.filePath);
      relPath = relPath.replace(/\.tsx?$/, '');
      if (!relPath.startsWith('.')) {
        relPath = './' + relPath;
      }
    }
    importsCode += "import { " + service.className + " } from '" + relPath + "';\n";
  }

  // Add standard infrastructure imports
  importsCode += `
import { BrowserStorageAdapter } from './infrastructure/browser/browser-storage.adapter';
import { PROTECTED_STORAGE_KEYS } from '../shared/config/storage-keys.config.js';
import { DeviceIpcAdapter } from './infrastructure/adapters/device-ipc.adapter';
import { DeviceChangeDebounceAdapter } from './infrastructure/adapters/device-change-debounce.adapter';
import { StreamingCanvasRenderLoopService } from './infrastructure/services/canvas-render-loop.service';
import { GpuFrameBuffer } from './infrastructure/services/gpu-frame-buffer';
import { StreamingRendererFactory } from './infrastructure/factories/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from './infrastructure/adapters/streaming-gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from './infrastructure/adapters/streaming-canvas2d-renderer.adapter';
import { DeviceIpcStatusAdapter } from './infrastructure/adapters/device-ipc-status.adapter';
import { StreamingAdapterFactory } from './infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from './infrastructure/adapters/device-chromatic.adapter';
import { chromaticConfig } from '@prismgb/devices';
import { UIComponentRegistry } from './presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from './presentation/controller/ui-component.catalog';
import { AnimationCache, safeDispose } from '@prismgb/core';
`;

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

  const allStaticTokens = [
    'storageService',
    'deviceIpcAdapter',
    'deviceChangeDebounceAdapter',
    'canvasRenderLoopService',
    'gpuFrameBuffer',
    'streamingRendererFactory',
    'ipcClient',
    'deviceStatusProvider',
    'adapterFactory',
    'uiComponentRegistry',
    'animationCache',
    ...sortedServices.map(s => s.token)
  ];

  // Write full code
  const code = importsCode + `
export class GeneratedContainer {
  public cache: Map<string, { value: unknown }> = new Map();
  public registrations: Record<string, any> = {};
  private instances: Map<string, any> = new Map();

  constructor(overrides: Record<string, any> = {}) {
    // Pre-seed all static tokens
    const staticTokens = ` + JSON.stringify(allStaticTokens, null, 2) + `;
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
      // Standard Infrastructure & Factories
      case 'storageService':
        instance = new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS });
        break;
      case 'deviceIpcAdapter':
        instance = new DeviceIpcAdapter({
          eventBus: this.resolve('eventBus'),
          logger: this.resolve<any>('loggerFactory').create('DeviceIpcAdapter')
        });
        break;
      case 'deviceChangeDebounceAdapter':
        instance = new DeviceChangeDebounceAdapter({
          browserMediaService: this.resolve('browserMediaService'),
          logger: this.resolve<any>('loggerFactory').create('DeviceChangeDebounceAdapter')
        });
        break;
      case 'canvasRenderLoopService':
        instance = new StreamingCanvasRenderLoopService(
          this.resolve<any>('loggerFactory').create('StreamingCanvasRenderLoopService'),
          this.resolve('animationCache')
        );
        break;
      case 'gpuFrameBuffer':
        instance = new GpuFrameBuffer({ loggerFactory: this.resolve('loggerFactory') });
        break;
      case 'streamingRendererFactory': {
        const rendererProviders = {
          gpu: (deps: any) => new StreamingGpuRendererAdapter(deps),
          canvas2d: (deps: any) => new StreamingCanvas2DRendererAdapter(deps)
        };
        const rendererFactory = new StreamingRendererFactory(
          this.resolve('eventBus'),
          this.resolve('loggerFactory'),
          rendererProviders
        );
        rendererFactory.initialize();
        instance = rendererFactory;
        break;
      }
      case 'ipcClient': {
        const globalWindow = window as any;
        if (!globalWindow.deviceAPI) {
          throw new Error('deviceAPI is not available in the renderer. The preload script may have failed to load.');
        }
        instance = globalWindow.deviceAPI;
        break;
      }
      case 'deviceStatusProvider':
        instance = new DeviceIpcStatusAdapter(this.resolve('ipcClient'));
        break;
      case 'adapterFactory': {
        const adapterClasses = new Map([[chromaticConfig.id, DeviceChromaticAdapter]]);
        const adapterFactory = new StreamingAdapterFactory(
          this.resolve('eventBus'),
          this.resolve('loggerFactory'),
          this.resolve('browserMediaService'),
          adapterClasses
        );
        adapterFactory.initialize();
        instance = adapterFactory;
        break;
      }
      case 'uiComponentRegistry':
        instance = new UIComponentRegistry({
          componentDefinitions: rendererUiComponentDefinitions,
          loggerFactory: this.resolve('loggerFactory')
        });
        break;
      case 'animationCache':
        instance = new AnimationCache();
        break;

      // Scanned @Service class instantiations
` + resolveCases + `
      default:
        throw new Error("[GeneratedContainer] Could not resolve token: " + token);
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
