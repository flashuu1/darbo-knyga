import { t, type Key } from '../../i18n/lt';
import { CalendarIcon, GearIcon, PeopleIcon } from '../icons';
import { ui, useStore } from '../store';

export type Tab = 'calendar' | 'clients' | 'settings';
const TABS: { id: Tab; label: Key; icon: () => preact.JSX.Element }[] = [
  { id: 'calendar', label: 'tab.calendar', icon: CalendarIcon },
  { id: 'clients', label: 'tab.clients', icon: PeopleIcon },
  { id: 'settings', label: 'tab.settings', icon: GearIcon },
];

export function TabBar() {
  const { tab } = useStore(ui);
  return (
    <nav class="tabbar">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-testid={`tab-${id}`} class={tab === id ? 'tab active' : 'tab'} onClick={() => ui.set({ tab: id })}>
          <Icon />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
