import { CHANGELOG, type ChangeKind } from '../../i18n/changelog';
import { formatDayShort } from '../../i18n/format';
import { t } from '../../i18n/lt';

const LABEL: Record<ChangeKind, 'changelog.bugfix' | 'changelog.change' | 'changelog.feature'> = {
  bugfix: 'changelog.bugfix', change: 'changelog.change', feature: 'changelog.feature',
};

/**
 * Pakeitimų istorija: what changed in every build, newest on top. The newest entry is the running build: it is
 * highlighted and carries the build id shown in Nustatymai. Older entries are smaller and tighter, in a box that scrolls.
 */
export function Changelog() {
  const [current, ...older] = CHANGELOG;
  const show = (e: (typeof CHANGELOG)[number], isCurrent: boolean) => (
    <li key={`${e.build ?? 'now'}${e.date}`} class={isCurrent ? 'cl-entry current' : 'cl-entry'} data-testid={isCurrent ? 'changelog-current' : 'changelog-entry'}>
      <div class="cl-head">
        <span class="cl-date" data-testid="changelog-date">{formatDayShort(e.date)}</span>
        <span class="cl-build" data-testid="changelog-build">{isCurrent ? __BUILD_ID__ : e.build}</span>
        {isCurrent && <span class="cl-now">{t('changelog.current')}</span>}
      </div>
      <ul class="cl-items">
        {e.items.map((it, i) => (
          <li key={i}><span class={`cl-kind ${it.kind}`} data-testid="changelog-kind">{t(LABEL[it.kind])}</span><span class="cl-text">{it.text}</span></li>
        ))}
      </ul>
    </li>
  );
  return (
    <>
      <h2 class="section-head">{t('settings.changelog')}</h2>
      {current && <ul class="cl-list current-list">{show(current, true)}</ul>}
      <ul class="cl-list older" data-testid="changelog-older" tabIndex={0}>{older.map((e) => show(e, false))}</ul>
    </>
  );
}
