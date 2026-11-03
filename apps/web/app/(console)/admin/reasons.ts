// Shown to the owner on their dashboard, so they're written to them.
export const REJECT_REASONS = [
  "We couldn't confirm you own this home",
  "The photos don't match the details",
  "This looks like a broker's listing",
  "This home is already listed",
  "Some details are missing or unclear",
] as const;

export const FLAG_TEXT: Record<string, string> = {
  "duplicate-photos": "A photo matches one on another owner's listing",
  "many-listings": "This owner has posted 3 or more homes in 30 days",
  imported: "Imported from the spreadsheet: check the photos and details, and visit before approving if you can",
};
