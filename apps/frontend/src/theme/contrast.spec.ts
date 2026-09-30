import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Contrast of spec 008, measured from `tokens.css` instead of by eye.
 *
 * The panel paints every text, control boundary and focus ring with a token, so the ratios can be
 * computed from the tokens themselves: resolve the `var()` chains, apply the WCAG 2.1 relative
 * luminance and compare each pair with its minimum (4.5 for normal text, 3 for large text, control
 * boundaries and focus indicators). A `needs` of 0 marks a decorative pair: measured, and judged by
 * nothing, because a separator is not text.
 *
 * The "before" numbers of the third pass were produced by measuring the two control boundaries with
 * the pass 2 bindings (`--color-border` and `--color-border-strong`, separators rather than control
 * boundaries). This test only judges the state that shipped.
 */

interface ContrastPair {
  /** Where the pair appears, so a failure points at a screen instead of at a hex value. */
  readonly what: string;
  readonly ink: string;
  readonly surface: string;
  /** WCAG 2.1 minimum for this kind of pair, or 0 when it is decorative. */
  readonly needs: number;
}

const PAIRS: readonly ContrastPair[] = [
  { what: 'contenido sobre superficie (texto base)', ink: '--color-content', surface: '--color-surface', needs: 4.5 },
  { what: 'contenido sobre superficie elevada (secciones)', ink: '--color-content', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'contenido sobre superficie hundida (notas, entradas)', ink: '--color-content', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'atenuado sobre superficie (endpoint del panel)', ink: '--color-muted', surface: '--color-surface', needs: 4.5 },
  { what: 'atenuado sobre superficie elevada (leyendas, celdas)', ink: '--color-muted', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'atenuado sobre superficie hundida (placeholder, nota neutra)', ink: '--color-muted', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'acento sobre superficie (enlaces de la barra)', ink: '--color-accent', surface: '--color-surface', needs: 4.5 },
  { what: 'acento sobre superficie elevada (identificador de modelo)', ink: '--color-accent', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'acento claro sobre superficie (enlace apuntado)', ink: '--color-accent-strong', surface: '--color-surface', needs: 4.5 },
  { what: 'acento pulsado sobre superficie elevada (control pulsado)', ink: '--color-accent-pressed', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'acento pulsado sobre superficie (enlace pulsado)', ink: '--color-accent-pressed', surface: '--color-surface', needs: 4.5 },
  { what: 'acento pulsado sobre superficie hundida (boton secundario pulsado, entrada pulsada)', ink: '--color-accent-pressed', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'texto del boton primario sobre acento', ink: '--color-accent-content', surface: '--color-accent', needs: 4.5 },
  { what: 'texto del boton primario apuntado sobre acento claro', ink: '--color-accent-content', surface: '--color-accent-strong', needs: 4.5 },
  { what: 'texto del boton primario pulsado sobre acento pulsado', ink: '--color-accent-content', surface: '--color-accent-pressed', needs: 4.5 },
  { what: 'texto del boton peligro sobre danger', ink: '--color-danger-content', surface: '--color-danger', needs: 4.5 },
  { what: 'texto del boton peligro apuntado sobre danger claro', ink: '--color-danger-content', surface: '--color-danger-strong', needs: 4.5 },
  { what: 'texto del boton peligro pulsado sobre danger pulsado', ink: '--color-danger-content', surface: '--color-danger-pressed', needs: 4.5 },
  { what: 'ok sobre superficie (pildora del panel)', ink: '--color-ok', surface: '--color-surface', needs: 4.5 },
  { what: 'ok sobre superficie elevada (pildora en tabla)', ink: '--color-ok', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'ok sobre superficie hundida (aviso de accion aplicada)', ink: '--color-ok', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'warning sobre superficie elevada (pildora en tabla)', ink: '--color-warning', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'warning sobre superficie hundida (nota de advertencia)', ink: '--color-warning', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'danger sobre superficie elevada (pildora en tabla)', ink: '--color-danger', surface: '--color-surface-raised', needs: 4.5 },
  { what: 'danger sobre superficie hundida (mensaje de error)', ink: '--color-danger', surface: '--color-surface-inset', needs: 4.5 },
  { what: 'danger sobre superficie (pildora del panel)', ink: '--color-danger', surface: '--color-surface', needs: 4.5 },
  { what: 'borde de control sobre superficie elevada (entrada, select, boton secundario)', ink: '--color-border-control', surface: '--color-surface-raised', needs: 3 },
  { what: 'borde de control sobre superficie (control en el marco)', ink: '--color-border-control', surface: '--color-surface', needs: 3 },
  { what: 'borde de control apuntado sobre superficie elevada', ink: '--color-border-control-hover', surface: '--color-surface-raised', needs: 3 },
  { what: 'borde de la pildora de estado sobre superficie elevada', ink: '--color-ok', surface: '--color-surface-raised', needs: 3 },
  { what: 'anillo de foco sobre superficie', ink: '--color-accent', surface: '--color-surface', needs: 3 },
  { what: 'anillo de foco sobre superficie elevada', ink: '--color-accent', surface: '--color-surface-raised', needs: 3 },
  { what: 'anillo de foco sobre superficie hundida', ink: '--color-accent', surface: '--color-surface-inset', needs: 3 },
  { what: 'borde fuerte sobre superficie elevada (regla de cabecera, decorativo)', ink: '--color-border-strong', surface: '--color-surface-raised', needs: 0 },
  { what: 'borde sobre superficie elevada (separador de filas, decorativo)', ink: '--color-border', surface: '--color-surface-raised', needs: 0 },
  { what: 'borde del campo inactivo sobre superficie hundida, exento por WCAG 1.4.11 (decorativo)', ink: '--color-border', surface: '--color-surface-inset', needs: 0 },
  { what: 'borde del select inactivo sobre superficie, exento por WCAG 1.4.11 (decorativo)', ink: '--color-border', surface: '--color-surface', needs: 0 },
];

/** The theme folder of this workspace, whether the suite runs from the workspace or from the repo root. */
function themeDirectory(): string {
  const candidates = [
    resolve(process.cwd(), 'src', 'theme'),
    resolve(process.cwd(), 'apps', 'frontend', 'src', 'theme'),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, 'tokens.css')));

  if (found === undefined) {
    throw new Error(`no se encontro tokens.css desde ${process.cwd()}`);
  }

  return found;
}

const THEME = themeDirectory();
const TOKENS = new Map<string, string>();

for (const line of readFileSync(join(THEME, 'tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')) {
  const declared = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/.exec(line);

  if (declared !== null) {
    TOKENS.set(declared[1], declared[2].trim());
  }
}

/** The literal value of a token, following `var(--other)` until a value is reached. */
function value(name: string): string {
  const raw = TOKENS.get(name);

  if (raw === undefined) {
    throw new Error(`token ausente en tokens.css: ${name}`);
  }

  const reference = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(raw);

  return reference === null ? raw : value(reference[1]);
}

function channels(hex: string): readonly number[] {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`no es un color hexadecimal de 6 digitos: ${hex}`);
  }

  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255);
}

/** Relative luminance of WCAG 2.1. */
function luminance(hex: string): number {
  const linear = channels(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(ink: string, surface: string): number {
  const [high, low] = [luminance(ink), luminance(surface)].sort((first, second) => second - first);

  return (high + 0.05) / (low + 0.05);
}

/** Every stylesheet of the interface, so the coverage below is not a spot check. */
function stylesheets(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      return stylesheets(full);
    }

    return entry.name.endsWith('.css') ? [full] : [];
  });
}

describe('contraste de los tokens', () => {
  it('mide cada par que la interfaz pinta por encima de su minimo de WCAG 2.1', () => {
    const below: string[] = [];

    for (const pair of PAIRS) {
      const measured = contrast(value(pair.ink), value(pair.surface));

      if (pair.needs > 0 && measured < pair.needs) {
        below.push(`${pair.what}: ${measured.toFixed(2)}, minimo ${pair.needs}`);
      }
    }

    assert.deepEqual(below, [], 'pares por debajo de su minimo');
  });

  it('mide tambien los pares decorativos, que se informan y no se juzgan', () => {
    const decorative = PAIRS.filter((pair) => pair.needs === 0);

    assert.equal(decorative.length, 4);

    for (const pair of decorative) {
      assert.ok(contrast(value(pair.ink), value(pair.surface)) >= 1);
    }
  });

  it('no deja ningun var() sin definir en las hojas de estilo', () => {
    const unresolved: string[] = [];

    for (const sheet of stylesheets(resolve(THEME, '..'))) {
      for (const match of readFileSync(sheet, 'utf8').matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
        if (!TOKENS.has(match[1])) {
          unresolved.push(`${match[1]} en ${sheet}`);
        }
      }
    }

    assert.deepEqual(unresolved, [], 'tokens usados y no definidos');
  });
});
