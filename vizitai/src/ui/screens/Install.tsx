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
