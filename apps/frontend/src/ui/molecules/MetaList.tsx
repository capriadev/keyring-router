import styles from './MetaList.module.css';

export interface MetaListItem {
  readonly label: string;
  readonly value: string;
  /** Set for values that are read verbatim: urls, paths, identifiers. */
  readonly mono?: boolean;
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
          <dd className={`${styles.value} ${item.mono === true ? styles.mono : ''}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
