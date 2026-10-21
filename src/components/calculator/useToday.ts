import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Today's local date as YYYY-MM-DD, or null while rendering on the server.
 * Reading the clock during prerender is not allowed with Cache Components, so the
 * date is only filled in on the client, at hydration.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, localToday, () => null);
}
