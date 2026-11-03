// Runs against the dev database, like admin.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { setBanned } from "./admin.ts";
import { db, pool } from "./db.ts";
import { staffInvites, twoFactor, user } from "./schema.ts";
import { claimInvite, inviteStaff, listInvites, listStaff, revokeInvite, setRole } from "./staff.ts";

after(() => pool.end());

test("a super admin gives, changes and takes away staff access", async () => {
  const t = `test-staff-${Date.now()}`;
  const [admin, person, suspended] = [`${t}-a`, `${t}-p`, `${t}-s`];
  // Random, not timestamp-based: test files run in parallel and phone numbers are unique.
  const rand = () => `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
  const [adminPhone, personPhone, suspendedPhone, nobody] = [rand(), rand(), rand(), rand()];
  const roleOf = async (id: string) => (await db.select({ role: user.role, two: user.twoFactorEnabled }).from(user).where(eq(user.id, id)))[0];
  await db.insert(user).values([
    { id: admin, name: "Boss", email: `${admin}@test.invalid`, role: "admin", phoneNumber: adminPhone },
    { id: person, name: "Person", email: `${person}@test.invalid`, phoneNumber: personPhone },
    { id: suspended, name: "Suspended", email: `${suspended}@test.invalid`, phoneNumber: suspendedPhone, banned: true },
  ]);
  try {
    assert.equal(await setRole(admin, "12345", "sales"), "bad-phone");
    assert.equal(await setRole(admin, nobody, "sales"), "no-account", "they must have signed in once");
    assert.equal(await setRole(admin, suspendedPhone, "sales"), "banned");
    assert.equal(await setRole(admin, adminPhone, "member"), "self", "nobody changes their own role");

    assert.equal(await setRole(admin, personPhone, "reviewer"), "ok");
    assert.equal((await roleOf(person)).role, "reviewer");
    assert.ok((await listStaff()).some((s) => s.id === person), "listed once they have a role");
    assert.equal(await setBanned(admin, person, true), false, "staff can't be banned from the users page");
    assert.equal(await setRole(admin, personPhone, "support"), "ok", "and can be moved to another role");

    // Taking the role away takes the authenticator with it, so a later promotion enrols a fresh one.
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, person));
    await db.insert(twoFactor).values({ id: `${t}-tf`, secret: "x", backupCodes: "x", userId: person });
    assert.equal(await setRole(admin, personPhone, "member"), "ok");
    assert.deepEqual(await roleOf(person), { role: "member", two: false });
    assert.equal((await db.select().from(twoFactor).where(eq(twoFactor.userId, person))).length, 0);
    assert.ok(!(await listStaff()).some((s) => s.id === person));
  } finally {
    await db.delete(user).where(inArray(user.id, [admin, person, suspended]));
  }
});

test("an email invite becomes a role once, for the verified address only", async () => {
  const t = `test-invite-${Date.now()}`;
  const [admin, google, phoneOnly, staffer] = [`${t}-a`, `${t}-g`, `${t}-p`, `${t}-s`];
  const email = `${t}@example.test`;
  await db.insert(user).values([
    { id: admin, name: "Boss", email: `${admin}@test.invalid`, role: "admin" },
    { id: google, name: "Asha", email: email.toUpperCase().replace("@EXAMPLE.TEST", "@example.test"), emailVerified: true },
    { id: phoneOnly, name: "Ravi", email: `${t}-ph@phone.directnest.invalid` },
    { id: staffer, name: "Old hand", email: `${t}-old@example.test`, emailVerified: true, role: "support" },
  ]);
  try {
    assert.equal(await inviteStaff(admin, "not an email", "sales"), "bad-email");
    assert.equal(await inviteStaff(admin, `${admin}@test.invalid`, "sales"), "self");
    assert.equal(await inviteStaff(admin, `${t}-old@example.test`, "sales"), "has-role");

    assert.equal(await inviteStaff(admin, `  ${email.toUpperCase()}  `, "reviewer"), "ok");
    assert.equal(await inviteStaff(admin, email, "sales"), "ok", "inviting again replaces the role");
    assert.deepEqual((await listInvites()).filter((i) => i.email === email).map((i) => i.role), ["sales"]);

    // An unverified address can't claim, so typing someone else's email at sign-up gets nothing.
    assert.equal(await claimInvite({ id: google, email, emailVerified: false }), null);
    assert.equal(await claimInvite({ id: phoneOnly, email: `${t}-ph@phone.directnest.invalid`, emailVerified: false }), null);
    assert.equal(await claimInvite({ id: staffer, email: `${t}-old@example.test`, emailVerified: true, role: "support" }), null);

    assert.equal(await claimInvite({ id: google, email: email.toUpperCase(), emailVerified: true, role: "member" }), "sales", "case doesn't matter");
    assert.equal((await db.select({ role: user.role }).from(user).where(eq(user.id, google)))[0].role, "sales");
    assert.equal(await claimInvite({ id: google, email, emailVerified: true, role: "member" }), null, "claimed once");
    assert.ok(!(await listInvites()).some((i) => i.email === email));

    await inviteStaff(admin, `${t}-2@example.test`, "support");
    await revokeInvite(admin, `${t}-2@example.test`.toUpperCase());
    assert.ok(!(await listInvites()).some((i) => i.email.startsWith(`${t}-2`)));
  } finally {
    await db.delete(staffInvites).where(inArray(staffInvites.email, [email, `${t}-2@example.test`]));
    await db.delete(user).where(inArray(user.id, [admin, google, phoneOnly, staffer]));
  }
});
