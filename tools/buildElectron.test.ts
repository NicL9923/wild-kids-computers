import { describe, expect, it } from 'vitest';
import { findForbiddenMainRequires } from './buildElectron.ts';

describe('findForbiddenMainRequires', () => {
  it('returns empty for a clean bundle without networking built-ins', () => {
    expect(findForbiddenMainRequires(`const fs = require("node:fs"); const path = require("path");`)).toEqual([]);
  });

  it('flags bare and node:-prefixed networking requires', () => {
    const bundle = `
      const a = require("node:http");
      const b = require('https');
      const c = require("node:dns");
      const d = require('net');
    `;
    expect(findForbiddenMainRequires(bundle)).toEqual(['dns', 'http', 'https', 'net']);
  });
});
