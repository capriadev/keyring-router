import type { ReactNode } from 'react';
import { ActionButton } from '../atoms/ActionButton';
import { StateNote } from './StateNote';

export interface ResourceStateProps {
  /** Reading in flight. */
  readonly loading: boolean;
  /** Message of the last failed attempt, or null. */
  readonly error: string | null;
  /** Rows the panel has to show, or null when it has none at all. */
  readonly count: number | null;
  readonly loadingText: string;
  readonly failureTitle: string;
  readonly emptyTitle: string;
  readonly emptyDetail: string;
  readonly emptyNextStep?: string;
  /** The single control that starts what the empty state asks for. One action, never a menu. */
  readonly emptyAction?: ReactNode;
  readonly retryLabel?: string;
  readonly onRetry: () => void;
}

/**
 * The honest state of one panel, in one module: loading, failed with nothing to show, failed over a
 * reading that is still on screen (degraded), or empty with the next action spelled out. It renders
 * nothing when the panel has rows, so the table is the only thing left on screen. A failure always
 * offers the retry; an empty state never does, because retrying solves nothing there: it offers the
 * one action that would fill it, if the panel has a concrete one.
 */
export function ResourceState({
  loading,
  error,
  count,
  loadingText,
  failureTitle,
  emptyTitle,
  emptyDetail,
  emptyNextStep,
  emptyAction,
  retryLabel = 'Reintentar',
  onRetry,
}: ResourceStateProps) {
  const retry = <ActionButton label={retryLabel} onClick={onRetry} />;

  if (count === null && loading) {
    return <StateNote tone="neutral" title={loadingText} detail="Una sola lectura del gateway; no hace falta recargar." />;
  }

  if (count === null) {
    return (
      <StateNote
        tone="danger"
        title={failureTitle}
        detail={error ?? 'El gateway no respondio a la lectura.'}
        nextStep="Verifica que el gateway este corriendo y vuelve a intentarlo."
        action={retry}
      />
    );
  }

  if (error !== null) {
    return (
      <StateNote
        tone="warning"
        title="La ultima lectura fallo"
        detail={error}
        nextStep="Lo que ves es la ultima lectura disponible; reintenta para actualizarla."
        action={retry}
      />
    );
  }

  if (count === 0) {
    return (
      <StateNote
        tone="neutral"
        title={emptyTitle}
        detail={emptyDetail}
        nextStep={emptyNextStep}
        action={emptyAction}
      />
    );
  }

  return null;
}
