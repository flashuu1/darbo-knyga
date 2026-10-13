import { render } from 'preact';
import './styles.css';
import './styles/layers.css';
import { isStandalone } from './pwa/standalone';
import { BootErrorScreen, InstallScreen } from './ui/screens/Install';
import { initUpdates } from './pwa/updates';
import { isBusy, ui } from './ui/store';
import { lockDocument } from './pwa/lock';

const root = document.getElementById('app')!;
lockDocument();

async function boot() {
  if (!isStandalone()) {
    render(<InstallScreen />, root); // Safari tab: nothing else is loaded, nothing is written
    return;
  }
  const [{ db }, { ensureSeed }, { requestPersistence }, { App }] = await Promise.all([
    import('./db/db'), import('./db/seed'), import('./pwa/persist'), import('./app'),
  ]);
  await ensureSeed(db);
  if (import.meta.env.MODE === 'e2e') {
    const { repo } = await import('./db/repo');
    (window as unknown as Record<string, unknown>).__vizitai = { db, repo, ui };
  }
  const settings = await db.settings.get('settings');
  if (settings?.persistGranted !== true) {
    await db.settings.update('settings', { persistGranted: await requestPersistence() });
  }
  // Cancelled visits only stay for a week: tidy up at launch and every time the app comes back to the front.
  const tidy = () => { import('./db/repo').then(({ repo }) => repo.purgeCancelled()).catch((e) => console.error(e)); };
  tidy();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tidy(); });
  render(<App />, root);
  initUpdates(isBusy);
}
boot().catch((e) => {
  console.error(e);
  render(<BootErrorScreen />, root);
});
