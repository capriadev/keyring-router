'use client';

import { useId, type ReactNode } from 'react';
import styles from './ScreenSection.module.css';

export interface ScreenSectionProps {
  /** Heading of the section. The section points at it, so the landmark is never unnamed. */
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/**
 * One labelled section of a screen. It owns the `section` landmark, its heading level and the heading
 * identifier, so every panel in the panel set is announced the same way and no screen re-invents it.
 */
export function ScreenSection({ title, description, children }: ScreenSectionProps) {
  const titleId = useId();

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <header className={styles.head}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        {description !== undefined && <p className={styles.description}>{description}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
