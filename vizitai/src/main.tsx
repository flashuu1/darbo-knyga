import { render } from 'preact';
import './styles.css';
import { isStandalone } from './pwa/standalone';
import { InstallScreen } from './ui/screens/Install';

async function boot() {
  const root = document.getElementById('app')!;
  if (!isStandalone()) {
    render(<InstallScreen />, root); // Safari tab: nothing else is loaded, nothing is written
    return;
  }
  const [{ db }, { ensureSeed }, { requestPersistence }, { App }] = await Promise.all([
    import('./db/db'), import('./db/seed'), import('./pwa/persist'), import('./app'),
  ]);
  await ensureSeed(db);
  const settings = await db.settings.get('settings');
  if (settings?.persistGranted !== true) {
    await db.settings.update('settings', { persistGranted: await requestPersistence() });
  }
  render(<App />, root);
}
void boot();
