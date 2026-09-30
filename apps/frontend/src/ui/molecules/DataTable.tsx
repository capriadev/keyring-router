import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

export interface DataTableProps {
  /** Read by a screen reader before the contents, so the table is never an unlabelled grid. */
  readonly caption: string;
  readonly columns: readonly string[];
  /** The `tr` rows, each with a `th` of `scope="row"` as its first cell. */
  readonly children: ReactNode;
}

/** A data table with its caption, a real `thead` and column headers of `scope="col"`. */
export function DataTable({ caption, columns, children }: DataTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={styles.headCell} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.body}>{children}</tbody>
      </table>
    </div>
  );
}
