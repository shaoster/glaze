import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';

test('renders LandingPage and shows CTA buttons', () => {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
  expect(screen.getByText(/Pieces/i)).toBeDefined();
  expect(screen.getByText(/Analyze/i)).toBeDefined();
});
