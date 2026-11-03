// Signing out, for every button and for the idle timer. The server ends the session and clears what is bound to it
// (/api/session/end), then the page is loaded afresh: a client-side navigation would leave the signed-out person's pages in
// the router's memory (so "Back" could show them) and could reuse a screen from before, such as a half-finished sign-in.
export async function signOutAndReload(reason: "idle" | "user", to = "/") {
  await fetch("/api/session/end", { method: "POST", headers: { "x-requested-with": "dn", "content-type": "application/json" }, body: JSON.stringify({ reason }), keepalive: true }).catch(() => null);
  window.location.assign(new URL(to, window.location.origin).href);
}
