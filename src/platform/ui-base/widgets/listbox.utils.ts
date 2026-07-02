/**
 * Listbox helpers
 *
 * Shared helpers for rendering and updating listbox-style option lists.
 */



export interface RenderListboxOptions<TOption> {
  container: Element | null | undefined;
  options: readonly TOption[];
  createOption(option: TOption): Node | null | undefined;
}

export interface UpdateListboxActiveStateOptions<TElement extends HTMLElement = HTMLElement> {
  container: Element | null | undefined;
  optionSelector: string;
  activeValue: string | null | undefined;
  activeClass?: string;
  getOptionValue?: (option: TElement) => string | null | undefined;
  setAriaSelected?: boolean;
}

function renderListboxOptions<TOption>({
  container,
  options,
  createOption
}: RenderListboxOptions<TOption>): void {
  if (!container) return;

  container.innerHTML = '';
  options.forEach((option) => {
    const element = createOption(option);
    if (element) {
      container.appendChild(element);
    }
  });
}

function updateListboxActiveState<TElement extends HTMLElement = HTMLElement>({
  container,
  optionSelector,
  activeValue,
  activeClass = 'active',
  getOptionValue = (option) => option.dataset.value,
  setAriaSelected = true
}: UpdateListboxActiveStateOptions<TElement>): void {
  if (!container) return;

  const options = container.querySelectorAll<TElement>(optionSelector);
  options.forEach((option) => {
    const isActive = getOptionValue(option) === activeValue;
    option.classList.toggle(activeClass, isActive);
    if (setAriaSelected) {
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });
}

export { renderListboxOptions, updateListboxActiveState };
