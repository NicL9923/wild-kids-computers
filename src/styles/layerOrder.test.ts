import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function layerStatement(css: string): string[] {
  const match = /@layer\s+([\w\s,-]+);/.exec(css);
  return match?.[1]?.split(',').map((name) => name.trim()) ?? [];
}

describe('cascade layer order', () => {
  // A CSS chunk linked before the Tailwind entry would otherwise declare its layer first and lose
  // to Tailwind's base reset. Seen on the first launch screens before this statement existed.
  it('is declared in index.html, before any stylesheet, in the order Tailwind uses', () => {
    const html = read('../../index.html');
    const declared = layerStatement(html);
    const tailwind = layerStatement(read('../../node_modules/tailwindcss/index.css'));
    expect(tailwind.length).toBeGreaterThan(2);
    expect(declared.filter((name) => tailwind.includes(name))).toEqual(tailwind);
    expect(html.indexOf('@layer')).toBeLessThan(html.search(/<link|<script/));
  });
});
