import styles from './TruncatedText.module.css';

export interface TruncatedTextProps {
  /** The whole value. It is written in full into the text and repeated in the tooltip. */
  readonly value: string;
  /** `code` keeps the semantics of the identifier the value used to be. */
  readonly element?: 'span' | 'code';
  readonly className?: string;
}

/**
 * A value that can be longer than the column that holds it: it stays on one line, ends in an ellipsis
 * and repeats itself complete in its tooltip, so a long identifier never breaks the table nor pushes
 * the columns beside it, and the full text is still one hover away. The text is never cut in the data:
 * a screen reader reads the whole value, and so does the copy control that receives it.
 */
export function TruncatedText({ value, element = 'span', className }: TruncatedTextProps) {
  const Element = element;

  return (
    <Element
      className={className === undefined ? styles.truncated : `${styles.truncated} ${className}`}
      title={value}
    >
      {value}
    </Element>
  );
}
