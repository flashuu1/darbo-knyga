export interface GateDeps { isBusy: () => boolean; apply: () => void; uptimeMs: () => number }
const LAUNCH_WINDOW_MS = 5000;

export function createUpdateGate({ isBusy, apply, uptimeMs }: GateDeps) {
  let pending = false;
  const poke = () => {
    if (pending && !isBusy()) { pending = false; apply(); }
  };
  const markPending = () => {
    pending = true;
    if (uptimeMs() < LAUNCH_WINDOW_MS) poke(); // found at launch: activate now; otherwise wait for next foreground
  };
  return { markPending, poke };
}

export function initUpdates(isBusy: () => boolean): () => void {
  let reload: (reloadPage?: boolean) => Promise<void> = async () => {};
  const gate = createUpdateGate({ isBusy, apply: () => void reload(true), uptimeMs: () => performance.now() });
  // Loaded lazily: the virtual module only exists under the PWA plugin, not in plain Vitest runs.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    reload = registerSW({
      onNeedRefresh: gate.markPending,
      onRegisteredSW: (_url, reg) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') { void reg?.update(); gate.poke(); }
        });
      },
    });
  }).catch((e) => console.error(e)); // e.g. the chunk failed to load: the app keeps working without updates
  return gate.poke;
}
