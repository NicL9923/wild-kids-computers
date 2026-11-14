// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Emoji } from './Emoji.tsx';

afterEach(cleanup);

describe('Emoji', () => {
  it('names the picture with its spoken name', () => {
    render(<Emoji id='computer-mouse' />);
    expect(screen.getByRole('img', { name: 'computer mouse' }).getAttribute('src')).toMatch(/computer-mouse\.svg/);
  });

  it('hides a decorative picture from assistive technology', () => {
    const { container } = render(<Emoji id='apple' decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});
