import { useSyncExternalStore } from 'react';

// `useSyncExternalStore` returns `server` during server rendering and on
// the first (hydration) render, then `client` afterwards — without an
// effect, so there is no extra render pass.
const emptySubscribe = () => () => {};

export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return useSyncExternalStore(
    emptySubscribe,
    (): S | C => client,
    (): S | C => server,
  );
}
