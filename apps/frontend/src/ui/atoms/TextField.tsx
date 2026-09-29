import type { ChangeEvent } from 'react';
import styles from './TextField.module.css';

export interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
}

/** Controlled text input with label and optional hint. Normalizes the event to its string value. */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
  required = false,
}: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-describedby={hintId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {hintId !== undefined && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
