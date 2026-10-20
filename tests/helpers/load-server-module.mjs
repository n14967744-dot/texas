import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const nativeRequire = createRequire(import.meta.url);

// Run server-only TS modules with explicit dependency overrides and no Next server.
export function serverModule(entry, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (Object.hasOwn(overrides, filename)) return overrides[filename];
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === 'server-only') return {};
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return nativeRequire(specifier);
      let target = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(filename), specifier);
      if (!extname(target)) target += '.ts';
      if (extname(target) === '.json') return nativeRequire(target);
      return load(target);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(resolve(root, entry));
}

export const modulePath = (path) => resolve(root, path);
