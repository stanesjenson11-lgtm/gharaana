import { relations, sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, point, primaryKey, serial, smallint, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

export * from "./auth-schema.ts";

export const listingType = pgEnum("listing_type", ["rent", "buy"]);
export const propertyKind = pgEnum("property_kind", ["apartment", "independent-house", "villa"]);
export const furnishing = pgEnum("furnishing", ["full", "semi", "none"]);
export const parking = pgEnum("parking", ["none", "bike", "car"]);
export const listingStatus = pgEnum("listing_status", ["pending_review", "active", "rented", "expired", "rejected"]);
export const room = pgEnum("room", ["living", "bedroom", "kitchen", "bathroom", "exterior", "balcony"]);
export const saleCondition = pgEnum("sale_condition", ["new", "resale"]); // new = from the builder

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const listings = pgTable(
  "listings",
  {
    id: text().primaryKey(), // readable slug, e.g. 2bhk-5th-block-koramangala-1
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: listingStatus().notNull().default("pending_review"),
    sample: boolean().notNull().default(false), // seeded demo listings, labelled as such in the UI
    type: listingType().notNull(),
    kind: propertyKind().notNull(),
    bhk: smallint().notNull(), // 0 = 1 RK
    title: text().notNull(),
    city: text().notNull().default("Bengaluru"),
    locality: text().notNull(),
    area: text().notNull(),
    addressPrivate: text().notNull(), // never selected for public pages
    // Public map position (x = lng, y = lat), jittered off the building. Core point type + GiST: no PostGIS needed yet.
    location: point({ mode: "xy" }).notNull(),
    price: bigint({ mode: "number" }).notNull(), // monthly rent, or sale price
    maintenance: integer().notNull().default(0),
    deposit: bigint({ mode: "number" }).notNull().default(0),
    carpetSqft: integer().notNull(),
    floor: smallint().notNull(),
    totalFloors: smallint().notNull(),
    furnishing: furnishing().notNull(),
    facing: text().notNull(),
    ageYears: smallint().notNull(),
    availableFrom: date({ mode: "string" }), // null = now
    tenants: text().array().notNull().default(sql`'{}'::text[]`), // empty = anyone
    pets: boolean().notNull(),
    nonVeg: boolean().notNull(),
    parking: parking().notNull(),
    bathrooms: smallint().notNull(),
    balconies: smallint().notNull(),
    amenities: text().array().notNull().default(sql`'{}'::text[]`),
    description: text().notNull(),
    saleCondition: saleCondition(), // sales only
    videoUrl: text(), // YouTube link; we embed it rather than host video
    visitVerifiedAt: timestamp({ withTimezone: true }), // our staff saw the home in person
    featuredUntil: timestamp({ withTimezone: true }), // shown first, with a "Featured" badge, until then
    projectId: text().references((): AnyPgColumn => projects.id, { onDelete: "set null" }), // a unit of a builder's project
    ownerVerified: boolean().notNull().default(false),
    proofKey: text(), // private upload; deleted 30 days after review
    riskFlags: text().array().notNull().default(sql`'{}'::text[]`), // e.g. duplicate-photos, for the review queue
    rejectReason: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: now(),
    confirmedAt: now(), // owner last said "still available"
    expiresAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
  },
  (t) => [
    index("listings_location_gist").using("gist", t.location),
    index("listings_search_idx").on(t.status, t.type, t.city, t.bhk),
    index("listings_owner_idx").on(t.ownerId),
  ],
);

/** A builder's project. Its units are ordinary sale listings (condition "new") that point here. */
export const projects = pgTable("projects", {
  id: text().primaryKey(), // slug, e.g. prestige-lakeside-whitefield
  name: text().notNull(),
  builder: text().notNull(),
  rera: text().notNull(), // Karnataka RERA registration number, shown on the page as the law expects
  possession: date({ mode: "string" }), // expected handover; null = ready
  locality: text().notNull(),
  description: text().notNull(),
  published: boolean().notNull().default(false),
  createdAt: now(),
});

export const listingPhotos = pgTable(
  "listing_photos",
  {
    id: serial().primaryKey(),
    listingId: text()
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    src: text().notNull(), // absolute URL (stock) or storage key (uploads)
    room: room().notNull(),
    credit: text(),
    dhash: bigint({ mode: "bigint" }), // 64-bit difference hash; near-equal hashes across owners flag reused photos
  },
  (t) => [index("listing_photos_listing_idx").on(t.listingId, t.position)],
);

export const uploadKind = pgEnum("upload_kind", ["photo", "proof"]);

/** Every file someone uploaded. The post action only accepts keys found here for the same owner. */
export const uploads = pgTable("uploads", {
  key: text().primaryKey(),
  ownerId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: uploadKind().notNull(),
  dhash: bigint({ mode: "bigint" }),
  ext: text().notNull(), // proof files keep their type (pdf, jpg)
  createdAt: now(),
});

const userRef = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const listingRef = () =>
  text()
    .notNull()
    .references(() => listings.id, { onDelete: "cascade" });

/** Every time someone saw an owner's number. Caps scraping and tells owners who's interested. */
export const contactReveals = pgTable(
  "contact_reveals",
  { id: serial().primaryKey(), userId: userRef(), listingId: listingRef(), createdAt: now() },
  (t) => [index("contact_reveals_user_idx").on(t.userId, t.createdAt), index("contact_reveals_listing_idx").on(t.listingId)],
);

export const leadKind = pgEnum("lead_kind", ["callback", "visit"]);
export const leadStatus = pgEnum("lead_status", ["new", "confirmed", "declined", "done"]);
// The sales team's own pipeline for each request, separate from the owner's answer above.
export const crmStage = pgEnum("crm_stage", ["new", "contacted", "visited", "negotiating", "won", "lost"]);

/** A buyer asking the owner to call back, or to visit. The owner answers from their dashboard. */
export const leads = pgTable(
  "leads",
  {
    id: serial().primaryKey(),
    listingId: listingRef(),
    requesterId: userRef(),
    kind: leadKind().notNull(),
    preferredDate: date({ mode: "string" }),
    preferredSlot: text(), // morning | afternoon | evening
    note: text(),
    status: leadStatus().notNull().default("new"),
    crmStage: crmStage().notNull().default("new"),
    crmNote: text(), // staff only; never shown to the buyer or the owner
    crmUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("leads_listing_idx").on(t.listingId), index("leads_requester_idx").on(t.requesterId)],
);

export const savedSearches = pgTable(
  "saved_searches",
  { id: serial().primaryKey(), userId: userRef(), query: text().notNull(), label: text().notNull(), createdAt: now() },
  (t) => [index("saved_searches_user_idx").on(t.userId)],
);

export const shortlists = pgTable(
  "shortlists",
  { userId: userRef(), listingId: listingRef(), createdAt: now() },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

/** One chat per buyer and listing. The read markers say up to when each side has seen the thread. */
export const conversations = pgTable(
  "conversations",
  {
    id: serial().primaryKey(),
    listingId: listingRef(),
    buyerId: userRef(),
    ownerId: userRef(),
    buyerReadAt: now(),
    ownerReadAt: now(),
    lastMessageAt: now(),
    createdAt: now(),
  },
  (t) => [uniqueIndex("conversations_listing_buyer_idx").on(t.listingId, t.buyerId), index("conversations_owner_idx").on(t.ownerId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: serial().primaryKey(),
    conversationId: integer()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: userRef(),
    body: text().notNull(),
    createdAt: now(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.id), index("messages_sender_idx").on(t.senderId, t.createdAt)],
);

export const ticketTopic = pgEnum("ticket_topic", ["account", "listing", "report", "other"]);
// open = waiting on the team, answered = waiting on the person, closed = done (a new message reopens it)
export const ticketStatus = pgEnum("ticket_status", ["open", "answered", "closed"]);

/** A support conversation between one person and the team. */
export const tickets = pgTable(
  "tickets",
  {
    id: serial().primaryKey(),
    userId: userRef(),
    topic: ticketTopic().notNull(),
    listingId: text().references(() => listings.id, { onDelete: "set null" }),
    status: ticketStatus().notNull().default("open"),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [index("tickets_user_idx").on(t.userId), index("tickets_status_idx").on(t.status, t.updatedAt)],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: serial().primaryKey(),
    ticketId: integer()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: userRef(),
    fromStaff: boolean().notNull().default(false),
    body: text().notNull(),
    createdAt: now(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.id)],
);

/** What the team sells to owners. Prices are edited by admins; payment happens offline until online payments go live. */
export const plans = pgTable("plans", {
  id: serial().primaryKey(),
  name: text().notNull(),
  price: integer().notNull(), // rupees, GST included
  days: smallint().notNull(), // how long a listing stays featured
  perks: text().array().notNull().default(sql`'{}'::text[]`),
  active: boolean().notNull().default(true),
  position: smallint().notNull().default(0),
  updatedAt: now(),
});

/** In-app alerts: a line of text and where it leads. WhatsApp copies go out too once the client's account is set up. */
export const notifications = pgTable(
  "notifications",
  { id: serial().primaryKey(), userId: userRef(), text: text().notNull(), href: text().notNull(), readAt: timestamp({ withTimezone: true }), createdAt: now() },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const pageKind = pgEnum("page_kind", ["post", "area"]);

/** Blog posts and area guides, written by the team. An area page's slug is its locality's slug. */
export const pages = pgTable(
  "pages",
  {
    id: serial().primaryKey(),
    kind: pageKind().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    summary: text().notNull().default(""),
    body: text().notNull(), // plain text: blank lines between paragraphs, "## " headings, "- " list items
    published: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    updatedAt: now(),
  },
  (t) => [uniqueIndex("pages_kind_slug_idx").on(t.kind, t.slug)],
);

/** DPDP consent records: logs user acceptance of terms & privacy notices. */
export const consents = pgTable(
  "consents",
  {
    id: serial().primaryKey(),
    userId: userRef(),
    policyVersion: text().notNull().default("2026-10"),
    consentedAt: now(),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

/** What the team writes down about a client: a call, a promise, a worry. Staff only; the client never sees it. */
export const clientNotes = pgTable(
  "client_notes",
  {
    id: serial().primaryKey(),
    clientId: userRef(),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdAt: now(),
  },
  (t) => [index("client_notes_client_idx").on(t.clientId, t.createdAt)],
);

export const docketStatus = pgEnum("docket_status", ["open", "doing", "waiting", "done", "dropped"]);
export const docketPriority = pgEnum("docket_priority", ["low", "normal", "high", "urgent"]); // in this order, so sorting by it works
export const docketRepeat = pgEnum("docket_repeat", ["none", "daily", "weekly", "monthly"]);
export const docketSubject = pgEnum("docket_subject", ["client", "listing", "lead", "ticket"]);

/**
 * The team's docket: a piece of work with an owner, a due date and a next step, handed between staff. It belongs to one
 * person, or to a role's shared pool that anyone in that role may claim, and can point at the client, listing, request or
 * ticket it is about.
 */
export const docketItems = pgTable(
  "docket_items",
  {
    id: serial().primaryKey(),
    title: text().notNull(),
    detail: text(),
    status: docketStatus().notNull().default("open"),
    priority: docketPriority().notNull().default("normal"),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    assigneeRole: text(), // the pool: set while nobody has claimed it, null once someone does
    assignedAt: now(),
    dueAt: timestamp({ withTimezone: true }),
    remindedAt: timestamp({ withTimezone: true }), // when the assignee was last told it is due, so they hear it once
    repeat: docketRepeat().notNull().default("none"), // finishing a repeating item opens the next one
    subjectKind: docketSubject(),
    subjectId: text(), // a user id, listing id, or the number of a lead or ticket
    doneAt: timestamp({ withTimezone: true }),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [
    index("docket_assignee_idx").on(t.assigneeId, t.status, t.dueAt),
    index("docket_pool_idx").on(t.assigneeRole, t.status),
    index("docket_subject_idx").on(t.subjectKind, t.subjectId),
    check("docket_one_owner", sql`not (${t.assigneeId} is not null and ${t.assigneeRole} is not null)`),
  ],
);

/** What happened on an item: notes and logged calls written by people, and events the system records. */
export const docketNotes = pgTable(
  "docket_notes",
  {
    id: serial().primaryKey(),
    itemId: integer()
      .notNull()
      .references(() => docketItems.id, { onDelete: "cascade" }),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    kind: text().notNull(), // note | call | whatsapp | visit | event
    body: text().notNull(),
    createdAt: now(),
  },
  (t) => [index("docket_notes_item_idx").on(t.itemId, t.createdAt)],
);

/** A staff role waiting for whoever signs in with this email (Google or Apple). Claimed once, at their first verified sign-in. */
export const staffInvites = pgTable("staff_invites", {
  email: text().primaryKey(), // lowercase
  role: text().notNull(),
  invitedBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: now(),
});

/** Security audit trail: immutable logs for administrative actions, account deletions, and auth milestones. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial().primaryKey(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetId: text(),
    ipAddress: text(),
    userAgent: text(),
    details: text(), // JSON-stringified sanitized metadata
    createdAt: now(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt), index("audit_logs_action_idx").on(t.action, t.createdAt)],
);

export const listingsRelations = relations(listings, ({ one, many }) => ({
  owner: one(user, { fields: [listings.ownerId], references: [user.id] }),
  photos: many(listingPhotos),
  project: one(projects, { fields: [listings.projectId], references: [projects.id] }),
}));

export const listingPhotosRelations = relations(listingPhotos, ({ one }) => ({
  listing: one(listings, { fields: [listingPhotos.listingId], references: [listings.id] }),
}));
