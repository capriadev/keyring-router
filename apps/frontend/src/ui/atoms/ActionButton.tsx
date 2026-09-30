import type { Ref } from 'react';
import styles from './ActionButton.module.css';

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ActionButtonProps {
  readonly label: string;
  /** Omitted for `type="submit"` buttons, where the surrounding form owns the action. */
  readonly onClick?: () => void;
  readonly variant?: ActionButtonVariant;
  /** Disables the button and appends an ellipsis while its action is in flight. */
  readonly pending?: boolean;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit';
  /** The destructive confirmation starts the focus on Cancelar, so it needs the node. */
  readonly ref?: Ref<HTMLButtonElement>;
}

export function ActionButton({
  label,
  onClick,
  variant = 'secondary',
  pending = false,
  disabled = false,
  type = 'button',
  ref,
}: ActionButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? `${label}...` : label}
    </button>
  );
}

