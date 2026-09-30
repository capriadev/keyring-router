import type { ReactNode } from 'react';
import styles from './StateNote.module.css';

export type StateTone = 'neutral' | 'ok' | 'warning' | 'danger';

export interface StateNoteProps {
  readonly tone?: StateTone;
  /** What this panel is showing instead of data: loading, empty, failed. */
  readonly title?: string;
  /** The message itself. For a failure it is the translated gateway or transport error. */
  readonly detail: string;
  /** What to do next. A failure that only says what failed leaves the reader stuck. */
  readonly nextStep?: string;
  readonly action?: ReactNode;
  /**
   * `alert` interrupts a screen reader, `status` waits for a pause, `none` is for a note that was
   * already there when the screen opened and is not an update.
   */
  readonly announce?: 'alert' | 'status' | 'none';
}

/**
 * The one shape of an honest state: loading, empty, degraded, partial or failed. Every panel that could
 * show data without having it renders one of these instead of a blank space.
 */
export function StateNote({
  tone = 'neutral',
  title,
  detail,
  nextStep,
  action,
  announce,
}: StateNoteProps) {
  const role = announce ?? (tone === 'danger' ? 'alert' : 'status');

  return (
    <div className={`${styles.note} ${styles[tone]}`} role={role === 'none' ? undefined : role}>
      {title !== undefined && <p className={styles.title}>{title}</p>}
      <p className={styles.detail}>{detail}</p>
      {nextStep !== undefined && <p className={styles.nextStep}>{nextStep}</p>}
      {action !== undefined && <div className={styles.action}>{action}</div>}
    </div>
  );
}
