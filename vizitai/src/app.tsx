import { CalendarScreen } from './ui/screens/Calendar';
import { ClientsScreen } from './ui/screens/Clients';
import { ExpensesScreen } from './ui/screens/Expenses';
import { SettingsScreen } from './ui/screens/Settings';
import { KB_PRIMER_ID } from './ui/actions';
import { Sheets } from './ui/components/Sheets';
import { TabBar } from './ui/components/TabBar';
import { ui, useStore } from './ui/store';

export function App() {
  const { tab } = useStore(ui);
  return (
    <div class="app" data-testid="app">
      <main class="screen">
        {tab === 'calendar' ? <CalendarScreen /> : tab === 'clients' ? <ClientsScreen /> : tab === 'expenses' ? <ExpensesScreen /> : <SettingsScreen />}
      </main>
      <TabBar />
      <Sheets />
      {/* Focused synchronously by taps that open the New sheet, so iOS raises the keyboard (see primeKeyboard). */}
      <input id={KB_PRIMER_ID} class="kb-primer" data-testid="kb-primer" aria-hidden="true" tabIndex={-1} autocomplete="off" />
    </div>
  );
}
