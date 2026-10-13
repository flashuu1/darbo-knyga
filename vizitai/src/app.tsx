import { useState } from 'preact/hooks';
import { t } from './i18n/lt';
import { TabBar, type Tab } from './ui/components/TabBar';

export function App() {
  const [tab, setTab] = useState<Tab>('calendar');
  return (
    <div class="app" data-testid="app">
      <main class="screen"><h1 class="large-title">{t(`tab.${tab}`)}</h1></main>
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}
