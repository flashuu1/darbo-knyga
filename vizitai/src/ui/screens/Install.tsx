import { t } from '../../i18n/lt';
export function InstallScreen() {
  return (
    <main class="install" data-testid="install">
      <h1>{t('install.title')}</h1>
      <ol>
        <li>{t('install.step.share')}</li>
        <li>{t('install.step.add')}</li>
        <li>{t('install.step.open')}</li>
      </ol>
    </main>
  );
}

/** Shown when start-up fails (e.g. the database cannot be opened), instead of a blank white screen. */
export function BootErrorScreen() {
  return (
    <main class="install" data-testid="boot-error-screen">
      <p data-testid="boot-error">{t('boot.error')}</p>
    </main>
  );
}
