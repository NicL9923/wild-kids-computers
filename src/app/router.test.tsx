// @vitest-environment jsdom
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BAND } from '../core/bands.ts';
import { placeholderText } from './placeholderText.ts';
import { createAppRouter } from './router.ts';

afterEach(cleanup);

describe('app router', () => {
  it('shows the home screen inside the default band theme', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    render(<RouterProvider router={router} />);

    const heading = await screen.findByRole('heading', { level: 1, name: placeholderText.title });
    expect(heading.closest('[data-band]')?.getAttribute('data-band')).toBe(DEFAULT_BAND);
  });
});
