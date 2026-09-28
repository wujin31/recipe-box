// Per-page lifecycle: hooks run when you leave a page, and an AbortSignal for its listeners.

let leaveHooks = [];
let pageAbort = new AbortController();
export const onLeave = (fn) => leaveHooks.push(fn);
export const pageSignal = () => pageAbort.signal;

// Called by the router before showing the next page.
export function leavePage() {
  leaveHooks.forEach((fn) => fn());
  leaveHooks = [];
  pageAbort.abort();
  pageAbort = new AbortController();
}
