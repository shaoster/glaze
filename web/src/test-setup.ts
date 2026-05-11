import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock the Google OAuth script
window.google = {
  accounts: {
    id: {
      cancel: vi.fn(),
    },
  },
};
