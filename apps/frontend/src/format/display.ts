/**
 * One way to write an instant, a count and a duration in the whole panel.
 *
 * Every screen reads its numbers from here, so "Ultimo refresh" on one screen and "Activo hace" on
 * another are the same shape, in Spanish, and a change of format happens in one file. The formatters
 * are built once: `Intl` constructions are not free and a table of forty rows would rebuild them.
 */
const timestampFormat = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });
const countFormat = new Intl.NumberFormat('es');
const sizeFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });

/** A moment, always the same way. `null` is not the epoch: it is something that never happened. */
export function formatTimestamp(value: number | null): string {
  return value === null ? 'nunca' : timestampFormat.format(value);
}

/** A count. `null` is a reading that failed, which is not the same thing as zero. */
export function formatCount(value: number | null): string {
  return value === null ? 'sin datos' : countFormat.format(value);
}

/** A duration in the largest two units that describe it, so nobody reads 36000 seconds. */
export function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${formatCount(seconds)} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${formatCount(minutes)} min ${formatCount(seconds % 60)} s`;
  }

  const hours = Math.floor(minutes / 60);

  return `${formatCount(hours)} h ${formatCount(minutes % 60)} min`;
}

/** The size a provider reports, in GB and with the decimal separator of the panel. */
export function formatSize(bytes: number | null): string | null {
  return bytes === null ? null : `${sizeFormat.format(bytes / 1024 ** 3)} GB`;
}
