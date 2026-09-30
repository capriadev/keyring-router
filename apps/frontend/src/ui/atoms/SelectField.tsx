import type { ChangeEvent } from 'react';
import styles from './SelectField.module.css';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/** Controlled select with a bound label, used wherever the choice comes from gateway data. */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  disabled = false,
}: SelectFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hintId !== undefined && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
