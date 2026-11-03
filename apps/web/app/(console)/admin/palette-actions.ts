"use server";

import { findUsers } from "@/lib/admin";
import { requireAdmin } from "@/lib/session";

/** For the console's search box: clients by name or part of a phone number. Short, so a quick typist sends little. */
export async function searchClients(query: string) {
  await requireAdmin("users");
  const q = String(query).trim();
  if (q.length < 2) return [];
  return (await findUsers(q)).slice(0, 6).map((p) => ({ id: p.id, name: p.name, phone: p.phone }));
}
