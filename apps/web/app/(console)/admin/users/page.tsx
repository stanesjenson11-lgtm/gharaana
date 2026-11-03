import { redirect } from "next/navigation";

// Clients moved to /admin/clients; old links and bookmarks land there.
export default function UsersPage() {
  redirect("/admin/clients");
}
