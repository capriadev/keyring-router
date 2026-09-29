'use client';

import { credentialAction, isModelPending, useDashboard } from '../hooks/useDashboard';
import type { HealthResponse } from '../types/api';
import { ActionButton } from '../ui/atoms/ActionButton';
import { StatusPill, type StatusTone } from '../ui/atoms/StatusPill';
import { CredentialRow } from '../ui/molecules/CredentialRow';
import { CatalogPanel } from '../ui/organisms/CatalogPanel';
import { CredentialForm } from '../ui/organisms/CredentialForm';
import { ExposedModelsPanel } from '../ui/organisms/ExposedModelsPanel';
import styles from './page.module.css';

interface HealthBadge {
  readonly label: string;
  readonly tone: StatusTone;
}

function describeHealth(health: HealthResponse | null, loading: boolean): HealthBadge {
  if (loading) {
    return { label: 'Consultando gateway', tone: 'neutral' };
  }

  if (health === null) {
    return { label: 'Gateway sin respuesta', tone: 'danger' };
  }

  return { label: 'Gateway activo', tone: 'ok' };
}

export default function HomePage() {
  const dashboard = useDashboard();
  const badge = describeHealth(dashboard.health, dashboard.loading);
  const reloading = dashboard.loading || dashboard.pending?.action === 'reload';
  const busy = reloading || dashboard.pending !== null;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Keyring Router</p>
          <h1 className={styles.title}>Panel local del gateway</h1>
          <p className={styles.subtitle}>
            Credenciales con namespace propio, catalogo descubierto y exposicion decidida por la politica.
          </p>
        </div>

        <div className={styles.health}>
          <StatusPill label={badge.label} tone={badge.tone} />
          {dashboard.health !== null && (
            <span className={styles.healthMeta}>
              version {dashboard.health.version} - activo hace {dashboard.health.uptimeSeconds} s
            </span>
          )}
          <ActionButton
            label="Actualizar todo"
            pending={reloading}
            disabled={busy && !reloading}
            onClick={dashboard.reload}
          />
        </div>
      </header>

      {dashboard.error !== null && (
        <p className={styles.error} role="alert">
          {dashboard.error}
        </p>
      )}
      {dashboard.notice !== null && (
        <p className={styles.notice} role="status">
          {dashboard.notice}
        </p>
      )}

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Credenciales</h2>
          <p className={styles.sectionHint}>
            {dashboard.credentials.length} registradas. Una credencial es una cuenta concreta de un proveedor.
          </p>
        </header>

        <CredentialForm pending={busy} onSubmit={dashboard.create} />

        {dashboard.credentials.length === 0 ? (
          <p className={styles.empty}>Sin credenciales. Registra una para descubrir su catalogo.</p>
        ) : (
          <ul className={styles.credentialList}>
            {dashboard.credentials.map((credential) => (
              <CredentialRow
                key={credential.id}
                credential={credential}
                action={credentialAction(dashboard.pending, credential.id)}
                onValidate={dashboard.validate}
                onRefresh={dashboard.refresh}
              />
            ))}
          </ul>
        )}
      </section>

      <div className={styles.panels}>
        <CatalogPanel
          models={dashboard.catalog}
          onAllow={dashboard.allow}
          isRowPending={(namespacedId) => isModelPending(dashboard.pending, namespacedId)}
        />
        <ExposedModelsPanel models={dashboard.models} />
      </div>
    </main>
  );
}
