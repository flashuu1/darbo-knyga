export interface StandaloneEnv {
  navigatorStandalone?: boolean;
  displayModeStandalone: boolean;
  e2e: boolean;
}
export const detectStandalone = (e: StandaloneEnv): boolean =>
  e.e2e || e.navigatorStandalone === true || e.displayModeStandalone;

export function isStandalone(): boolean {
  return detectStandalone({
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    e2e: import.meta.env.MODE === 'e2e' && !new URLSearchParams(location.search).has('safari'),
  });
}
