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
  expect(screen.getByText(/Get Started/i)).toBeDefined();
});
