import type { Metadata } from "next";
import { Suspense } from "react";
import { PostForm } from "@/components/post/post-form";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Post your property for free | Gharaana",
  description: "List your flat or house for rent or sale in Bengaluru. Free for owners, reviewed by a person, no broker calls.",
};

export default function PostPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        <SignedInForm />
      </Suspense>
    </main>
  );
}

async function SignedInForm() {
  const me = await requireUser("/post");
  const phone = me.phoneNumber ? `${me.phoneNumber.slice(0, 3)} ${me.phoneNumber.slice(3, 8)} ${me.phoneNumber.slice(8)}` : null;
  return <PostForm name={me.name} phone={phone} />;
}
