import { describe, expect, it } from 'vitest';
import { findForeignBuildFiles } from './checkBuildAssets.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('findForeignBuildFiles', () => {
  const assets = [{ path: 'emoji/fox.svg', bytes: bytes('<svg>fox</svg>') }];

  it('accepts a renamed copy of an asset and ignores code', () => {
    const build = [
      { path: 'assets/fox-a1b2c3.svg', bytes: bytes('<svg>fox</svg>') },
      { path: 'assets/index-9f8e.js', bytes: bytes('console.log(1)') },
      { path: 'assets/index-9f8e.css', bytes: bytes('body{}') },
      { path: 'index.html', bytes: bytes('<html>') },
    ];
    expect(findForeignBuildFiles(build, assets)).toEqual([]);
  });

  it('reports a non-code file whose content matches no asset', () => {
    const build = [
      { path: 'assets/logo-123.png', bytes: bytes('png') },
      { path: 'assets/fox-a1b2c3.svg', bytes: bytes('<svg>changed</svg>') },
    ];
    expect(findForeignBuildFiles(build, assets)).toEqual(['assets/fox-a1b2c3.svg', 'assets/logo-123.png']);
  });

  it('accepts the generated notices at the build root only', () => {
    const notices = { path: 'third-party-notices.txt', bytes: bytes('notices') };
    const elsewhere = { path: 'assets/third-party-notices.txt', bytes: bytes('notices') };
    expect(findForeignBuildFiles([notices, elsewhere], assets)).toEqual(['assets/third-party-notices.txt']);
  });

  it('treats an upper-case code extension as code', () => {
    expect(findForeignBuildFiles([{ path: 'X.JS', bytes: bytes('x') }], assets)).toEqual([]);
  });
});
