// The per-request context (which company the request works for). Kept apart from tenant.mts so http.mts
// can start it for every request without an import cycle.
import { AsyncLocalStorage } from "node:async_hooks";

export const als = new AsyncLocalStorage<{ company: number }>();

/** Every API request runs inside its own context; the company is filled in once the user is known. */
export const runRequest = <T,>(fn: () => Promise<T>) => als.run({ company: 0 }, fn);
