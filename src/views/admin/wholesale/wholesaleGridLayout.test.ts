// ============================================================================
// Wholesale two-column grids — the shrink guard
//
// A grid item's default `min-width: auto` is its min-content width. Each of
// these grids holds `Panel`s wrapping a `DataTable` wide enough to read, so at a
// phone width the column could not shrink and blew out to 380px inside a 320px
// pane — measured in a real browser on the deployed console, the wholesale pane
// (the screen's own scroll container) grew an 80px horizontal scrollbar while
// `documentElement` still reported zero overflow.
//
// `[&>*]:min-w-0` is what lets the items shrink so the table's `overflow-x-auto`
// host does the scrolling instead. Tailwind wiring is invisible to a render
// test, and the console needs a session to open, so it is asserted here.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

const sources: ReadonlyArray<[string, string]> = [
  ['BusinessPanels.tsx', read('BusinessPanels.tsx')],
  ['CalculatorPanel.tsx', read('CalculatorPanel.tsx')],
];

describe('wholesale panel grids', () => {
  it('lets every two-column mesh shrink its items below their table width', () => {
    for (const [name, source] of sources) {
      const grids = source.match(/className="grid [^"]*lg:grid-cols-2[^"]*"/g) ?? [];
      expect(grids.length, `${name} should still have its two-column grids`).toBeGreaterThan(0);
      for (const grid of grids) {
        // Either the container carries the child rule, or it has no table inside.
        if (grid.includes('min-w-0')) continue;
        expect(grid, `${name}: ${grid} holds a wide table but lets its items keep min-width:auto`).toContain(
          '[&>*]:min-w-0',
        );
      }
    }
  });
});
