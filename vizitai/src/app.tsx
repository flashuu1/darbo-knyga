import { CalendarScreen } from './ui/screens/Calendar';
import { ClientsScreen } from './ui/screens/Clients';
import { Sheets } from './ui/components/Sheets';
import { TabBar } from './ui/components/TabBar';
import { ui, useStore } from './ui/store';
import { t } from './i18n/lt';

export function App() {
  const { tab } = useStore(ui);
  return (
    <div class="app" data-testid="app">
      <main class="screen">
        {tab === 'calendar' ? <CalendarScreen /> : tab === 'clients' ? <ClientsScreen /> : <h1 class="large-title">{t('tab.settings')}</h1>}
      </main>
      <TabBar />
      <Sheets />
    </div>
  );
}
