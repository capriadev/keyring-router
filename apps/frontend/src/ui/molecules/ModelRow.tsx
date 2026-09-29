import type { ReactNode } from 'react';
import styles from './ModelRow.module.css';

export interface ModelRowProps {
  readonly title: string;
  /** Namespaced model id, shown verbatim because it is the identifier a client uses. */
  readonly subtitle: string;
  readonly meta?: string;
  readonly status?: ReactNode;
  readonly action?: ReactNode;
}

/** One model line, reused by the catalog panel and the exposed model panel. */
export function ModelRow({ title, subtitle, meta, status, action }: ModelRowProps) {
  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <span className={styles.title}>{title}</span>
        <code className={styles.subtitle}>{subtitle}</code>
        {meta !== undefined && <span className={styles.meta}>{meta}</span>}
      </div>

      {(status !== undefined || action !== undefined) && (
        <div className={styles.side}>
          {status}
          {action}
        </div>
      )}
    </li>
  );
}
