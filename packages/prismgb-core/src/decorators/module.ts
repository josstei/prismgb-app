import { setModuleMetadata, type Constructable } from '../metadata/module-metadata';

export interface ModuleOptions {
  providers: Constructable[];
  imports?: Constructable[];
}

export function Module(options: ModuleOptions): ClassDecorator {
  if (!Array.isArray(options.providers)) {
    throw new Error('@Module: providers must be an array.');
  }
  if (options.imports !== undefined && !Array.isArray(options.imports)) {
    throw new Error('@Module: imports must be an array when provided.');
  }
  return (target) => {
    setModuleMetadata(target, {
      providers: [...options.providers],
      imports: options.imports ? [...options.imports] : []
    });
  };
}
