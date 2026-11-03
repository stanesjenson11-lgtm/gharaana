// Alerts: an in-app notification always, and a WhatsApp message once the client's WhatsApp Business account is set up.
// The client asked for WhatsApp and app alerts, not email.
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { notifications, user } from "./schema.ts";

export async function notify(userIds: string | string[], text: string, href: string) {
  const ids = [...new Set([userIds].flat())];
  if (!ids.length) return;
  await db.insert(notifications).values(ids.map((userId) => ({ userId, text: text.slice(0, 300), href })));
  if (whatsappConfigured()) {
    const people = await db.select({ phone: user.phoneNumber }).from(user).where(inArray(user.id, ids));
    // Best effort: a WhatsApp outage must never fail the action that caused the alert.
    await Promise.allSettled(people.filter((p) => p.phone).map((p) => sendWhatsApp(p.phone!, text).catch((e) => console.error("[whatsapp]", e.message))));
  }
}

export const unreadCount = async (userId: string) =>
  (await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))))[0].n;

export const latestNotifications = (userId: string, limit = 50) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit);

export const markAllRead = (userId: string) =>
  db.update(notifications).set({ readAt: sql`now()` }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

// WhatsApp Cloud API. Business-initiated messages must use a Meta-approved template; ours has one body variable ({{1}})
// that carries the alert text. ponytail: one generic template; separate templates per alert type if Meta asks for them.
export const whatsappConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE);

export async function sendWhatsApp(phone: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/^\+/, ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
        components: [{ type: "body", parameters: [{ type: "text", text }] }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`WhatsApp answered ${res.status}`);
}
