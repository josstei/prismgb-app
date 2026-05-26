export const TEMPLATE_REF_ATTRIBUTE = 'data-ref';
export const TEMPLATE_ACTION_ATTRIBUTE = 'data-action';

export type TemplateRefList<TBindings extends Record<keyof TBindings, HTMLElement | null>> =
  readonly (Extract<keyof TBindings, string>)[];

export type TemplateRefLegacyIdMap<TBindings extends Record<keyof TBindings, HTMLElement | null>> =
  Partial<Record<Extract<keyof TBindings, string>, string>>;

export interface TemplateRefBindingOptions<
  TBindings extends Record<keyof TBindings, HTMLElement | null>
> {
  legacyIds?: TemplateRefLegacyIdMap<TBindings>;
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createTemplateRefSelector(ref: string): string {
  return `[${TEMPLATE_REF_ATTRIBUTE}="${escapeAttributeSelectorValue(ref)}"]`;
}

export function getTemplateAction(element: HTMLElement | null | undefined): string | null {
  return element?.getAttribute(TEMPLATE_ACTION_ATTRIBUTE) || null;
}

function queryRoot(root: ParentNode, selector: string): HTMLElement | null {
  const rootElement = root as Element;
  if (typeof rootElement.matches === 'function' && rootElement.matches(selector)) {
    return rootElement as HTMLElement;
  }

  return root.querySelector(selector) as HTMLElement | null;
}

function findLegacyId(root: ParentNode, id: string): HTMLElement | null {
  const documentRoot = root as Document;
  if (typeof documentRoot.getElementById === 'function') {
    return documentRoot.getElementById(id);
  }

  return queryRoot(root, `[id="${escapeAttributeSelectorValue(id)}"]`);
}

export function bindTemplateRefs<TBindings extends Record<keyof TBindings, HTMLElement | null>>(
  root: ParentNode,
  refs: TemplateRefList<TBindings>,
  { legacyIds = {} }: TemplateRefBindingOptions<TBindings> = {}
): TBindings {
  const elements = {} as TBindings;

  refs.forEach((ref) => {
    const element = queryRoot(root, createTemplateRefSelector(ref)) || findLegacyId(root, legacyIds[ref] || ref);
    elements[ref] = element as TBindings[typeof ref];
  });

  return elements;
}
