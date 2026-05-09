import '@testing-library/jest-dom'

// ResizeObserver-Mock für Radix UI Komponenten (Slider, Select) die in jsdom nicht verfügbar sind
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
