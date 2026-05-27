export interface ShaderSourceMap {
  byFileName: Record<string, string>;
}

export function createShaderSourceMap(
  modules: Record<string, string>
): ShaderSourceMap {
  const entries = Object.entries(modules).map(([modulePath, source]) => {
    const fileName = modulePath.split('/').pop();
    if (!fileName) {
      throw new Error(`Invalid shader module path: ${modulePath}`);
    }

    if (typeof source !== 'string') {
      throw new Error(`Shader module '${modulePath}' did not resolve to source text`);
    }

    return [fileName, source] as const;
  });

  return {
    byFileName: Object.fromEntries(entries)
  };
}
