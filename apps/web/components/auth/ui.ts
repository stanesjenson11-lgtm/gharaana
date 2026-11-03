// The sign-in screens' parts, copied from the sign-in design the team chose (a 21st.dev "sign-in" component) and mapped
// onto Gharaana's colour names: shadcn's border/foreground/muted/primary become hairline/ink/muted/ink. Shared by every
// sign-in step (number, code, authenticator, staff check, setup).

/** Enters with a short fade and blur, after the steps before it (see .animate-element in globals.css). */
export const anim = (step: number) => `animate-element animate-delay-${step * 100}`;

export const authTitle = "text-4xl md:text-5xl font-semibold leading-tight";
export const authTitleText = "font-light text-ink tracking-tighter";
export const authLead = "text-muted";
export const authLabel = "text-sm font-medium text-muted";
export const authField =
  "rounded-2xl border border-hairline bg-ink/5 backdrop-blur-sm transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10 has-[[aria-invalid=true]]:border-danger";
export const authInput = "w-full bg-transparent text-sm p-4 rounded-2xl text-ink placeholder:text-muted focus:outline-none";
export const authCode = `${authInput} text-base tracking-[0.4em] tabular-nums placeholder:tracking-normal`;
export const authPrimary =
  "w-full cursor-pointer rounded-2xl bg-ink py-4 font-medium text-canvas hover:bg-ink/90 transition-colors disabled:cursor-wait disabled:opacity-70";
export const authOutline =
  "w-full cursor-pointer flex items-center justify-center gap-3 border border-hairline rounded-2xl py-4 text-ink hover:bg-surface transition-colors disabled:cursor-wait disabled:opacity-70";
// The design's links are violet-400, too faint on white to read comfortably; 600 is the same violet at a readable contrast.
export const authLink = "cursor-pointer text-violet-600 hover:underline transition-colors";
export const authNotice = "rounded-2xl border border-hairline bg-ink/5 p-4 text-sm text-ink";
export const authError = "mt-2 text-sm text-danger";
