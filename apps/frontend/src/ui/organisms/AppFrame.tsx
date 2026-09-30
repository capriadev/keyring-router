'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useDashboard } from '../../hooks/useDashboard';
import { API_BASE_URL } from '../../services/api/client';
import { ActionButton } from '../atoms/ActionButton';
import { StatusPill, type StatusTone } from '../atoms/StatusPill';
import { TruncatedText } from '../atoms/TruncatedText';
import { StateNote } from '../molecules/StateNote';
import styles from './AppFrame.module.css';

interface SectionLink {
  readonly href: string;
  readonly label: string;
}

/** The five screens. Navigation is real routes: nothing is stacked behind a toggle. */
const SECTIONS: readonly SectionLink[] = [
  { href: '/', label: 'Estado' },
  { href: '/credenciales', label: 'Credenciales' },
  { href: '/catalogo', label: 'Catalogo y exposicion' },
  { href: '/modelos', label: 'Modelos expuestos' },
  { href: '/ajustes', label: 'Ajustes' },
];

export interface AppFrameProps {
  readonly children: ReactNode;
}

/** The frame every screen lives in: banner, navigation, the one main landmark and the global status. */
export function AppFrame({ children }: AppFrameProps) {
  const store = useDashboard();
  const pathname = usePathname();

  const gateway: { readonly label: string; readonly tone: StatusTone } = store.health.loading
    ? { label: 'Consultando gateway', tone: 'neutral' }
    : store.health.data === null
      ? { label: 'Gateway sin respuesta', tone: 'danger' }
      : { label: 'Gateway activo', tone: 'ok' };

  return (
    <div className={styles.frame}>
      <header className={styles.banner}>
        <p className={styles.brand}>Keyring Router</p>

        <nav aria-label="Secciones del panel">
          <ul className={styles.nav}>
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link
                  className={styles.link}
                  href={section.href}
                  aria-current={pathname === section.href ? 'page' : undefined}
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.gateway}>
          <span className={styles.status}>
            <StatusPill label={gateway.label} tone={gateway.tone} />
          </span>
          <ActionButton label="Actualizar datos" pending={store.loading} onClick={store.refreshAll} />
        </div>
      </header>

      <p className={styles.endpoint}>
        Este panel consulta{' '}
        <TruncatedText element="code" className={styles.url} value={API_BASE_URL} />
      </p>

      {store.actionError !== null && (
        <StateNote
          tone="danger"
          title="La ultima accion no se aplico"
          detail={store.actionError}
          nextStep="Revisa los datos, confirma que el gateway responde y vuelve a intentarlo."
          action={<ActionButton label="Actualizar datos" onClick={store.refreshAll} />}
        />
      )}

      {store.actionError === null && store.notice !== null && (
        <StateNote tone="ok" title="Accion aplicada" detail={store.notice} />
      )}

      <main className={styles.main}>{children}</main>
    </div>
  );
}
