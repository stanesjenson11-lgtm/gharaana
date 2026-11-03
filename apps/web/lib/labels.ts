// Words the console uses for the same things everywhere.
export const LISTING_STATUS = {
  pending_review: "Waiting for review",
  active: "Live",
  rented: "Sold or rented",
  expired: "Expired",
  rejected: "Rejected",
} as const;

export type ListingStatus = keyof typeof LISTING_STATUS;

/** Small badge colours for a listing's status. */
export const LISTING_STATUS_STYLE: Record<ListingStatus, string> = {
  pending_review: "bg-streetlight/30 text-ink",
  active: "bg-verified-wash text-verified",
  rented: "bg-indigo/10 text-indigo",
  expired: "bg-surface text-muted",
  rejected: "bg-danger/10 text-danger",
};
