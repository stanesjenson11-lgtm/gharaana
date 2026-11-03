// Runs once when the server starts, before it answers anything.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./instrumentation-node")).start();
}
