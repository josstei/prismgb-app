import { cleanup } from '@testing-library/dom';

function renderComponent(markup, { container = document.createElement('div') } = {}) {
  container.innerHTML = markup;
  document.body.appendChild(container);

  return {
    container,
    cleanup() {
      cleanup();
      container.remove();
    }
  };
}

export { renderComponent };

