import { CalendarScreen } from './ui/screens/Calendar';
import { ClientsScreen } from './ui/screens/Clients';
import { SettingsScreen } from './ui/screens/Settings';
import { Sheets } from './ui/components/Sheets';
import { TabBar } from './ui/components/TabBar';
import { ui, useStore } from './ui/store';

export function App() {
  const { tab } = useStore(ui);
  return (
    <div class="app" data-testid="app">
      <main class="screen">
        {tab === 'calendar' ? <CalendarScreen /> : tab === 'clients' ? <ClientsScreen /> : <SettingsScreen />}
      </main>
      <TabBar />
      <Sheets />
    </div>
  );
}
