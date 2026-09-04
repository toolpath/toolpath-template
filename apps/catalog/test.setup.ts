import '@testing-library/jest-dom/vitest'

globalThis.ResizeObserver = class {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}
