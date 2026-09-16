import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/server-utils";
import Link from "next/link";
import UserNav from "./user-nav";

export default async function AuthStatus() {
  // Create supabase server component client and obtain user session from stored cookie
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Button asChild>
        <Link href="/login">Log in</Link>
      </Button>
    );
  }

  const { data, error } = await supabase.from("profiles").select().eq("id", user.id);

  if (error ?? data.length !== 1) {
    return;
  }

  const profileData = data[0];

  // Note: We normally wouldn't need to check this case, but because ts noUncheckedIndexedAccess is enabled in tsconfig, we have to.
  // noUncheckedIndexedAccess provides better typesafety at cost of jumping through occasional hoops.
  // Read more here: https://www.totaltypescript.com/tips/make-accessing-objects-safer-by-enabling-nouncheckedindexedaccess-in-tsconfig
  // https://github.com/microsoft/TypeScript/pull/39560
  if (!profileData) {
    return;
  }

  return <UserNav profile={profileData} />;
}
