import styles from './ScreenHeader.module.css';

export interface ScreenHeaderProps {
  /** The only `h1` of the screen. Every screen renders exactly one header. */
  readonly title: string;
  readonly lede?: string;
}

/** Screen title and the one sentence that frames it. */
export function ScreenHeader({ title, lede }: ScreenHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {lede !== undefined && <p className={styles.lede}>{lede}</p>}
    </header>
  );
}
