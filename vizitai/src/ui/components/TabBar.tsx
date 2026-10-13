import { t, type Key } from '../../i18n/lt';
import { CalendarIcon, GearIcon, PeopleIcon, WalletIcon } from '../icons';
import { useNeedsBackup } from '../hooks';
import { ui, useStore } from '../store';

export type Tab = 'calendar' | 'clients' | 'expenses' | 'settings';
const TABS: { id: Tab; label: Key; icon: () => preact.JSX.Element }[] = [
  { id: 'calendar', label: 'tab.calendar', icon: CalendarIcon },
  { id: 'clients', label: 'tab.clients', icon: PeopleIcon },
  { id: 'expenses', label: 'tab.expenses', icon: WalletIcon },
  { id: 'settings', label: 'tab.settings', icon: GearIcon },
];

export function TabBar() {
  const { tab } = useStore(ui);
  const stale = useNeedsBackup();
  return (
    <nav class="tabbar">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-testid={`tab-${id}`} class={tab === id ? 'tab active' : 'tab'} onClick={() => ui.set({ tab: id })}>
          <Icon />
          <span>{t(label)}</span>
          {id === 'settings' && stale && <span class="badge" data-testid="tab-settings-badge" />}
        </button>
      ))}
    </nav>
  );
}
