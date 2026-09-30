import type { ReactNode } from 'react';
import { TruncatedText } from '../atoms/TruncatedText';
import styles from './MetaList.module.css';

export interface MetaListItem {
  readonly label: string;
  readonly value: string;
  /** Set for values that are read verbatim: urls, paths, identifiers. */
  readonly mono?: boolean;
  /**
   * Set for a value with no spaces to break on, such as a url: it keeps one line and offers the whole
   * value in its tooltip instead of widening the item it sits in.
   */
  readonly truncate?: boolean;
  /** The one control that acts on this value, such as copying it where a client can use it. */
  readonly action?: ReactNode;
}

export interface MetaListProps {
  readonly items: readonly MetaListItem[];
}

/** A definition list of label and value pairs, used for the facts of one subject. */
export function MetaList({ items }: MetaListProps) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div className={styles.item} key={item.label}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={`${styles.value} ${item.mono === true ? styles.mono : ''}`}>
            {item.truncate === true ? <TruncatedText value={item.value} /> : item.value}
          </dd>
          {item.action !== undefined && <div className={styles.action}>{item.action}</div>}
        </div>
      ))}
    </dl>
  );
}

