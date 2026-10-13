import { t, type Key } from '../../i18n/lt';
import { CalendarIcon, GearIcon, PeopleIcon } from '../icons';

export type Tab = 'calendar' | 'clients' | 'settings';
const TABS: { id: Tab; label: Key; icon: () => preact.JSX.Element }[] = [
  { id: 'calendar', label: 'tab.calendar', icon: CalendarIcon },
  { id: 'clients', label: 'tab.clients', icon: PeopleIcon },
  { id: 'settings', label: 'tab.settings', icon: GearIcon },
];

export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav class="tabbar">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} data-testid={`tab-${id}`} class={active === id ? 'tab active' : 'tab'} onClick={() => onSelect(id)}>
          <Icon />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
