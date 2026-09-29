import styles from './StatusPill.module.css';

export type StatusTone = 'ok' | 'warning' | 'danger' | 'neutral';

export interface StatusPillProps {
  readonly label: string;
  readonly tone?: StatusTone;
}

/** Short state badge: health, validation, exposure. */
export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{label}</span>;
}
