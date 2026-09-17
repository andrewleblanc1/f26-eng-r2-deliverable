import { Separator } from "@/components/ui/separator";
import { TypographyH2 } from "@/components/ui/typography";
import { createServerSupabaseClient } from "@/lib/server-utils";
import { redirect } from "next/navigation";
import UserCard from "./user-card";

export default async function UsersList() {
  // Create supabase server component client and obtain user session from stored cookie
  const supabase = createServerSupabaseClient();
  // getUser revalidates the token with the Supabase auth server, unlike getSession, which only reads
  // the cookie. Since this page exposes other users' email addresses, it is worth the extra check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // this is a protected route - only users who are signed in can view this route
    redirect("/");
  }

  // Only the three public-facing profile fields are selected; the id is used solely as a React key.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, biography")
    .order("display_name", { ascending: true });

  return (
    <>
      <TypographyH2>Users</TypographyH2>
      <Separator className="my-4" />
      {/* A grid rather than a centered flex row, so each row spans the full width of the page and
      the cards stretch to fill it instead of leaving gaps at the edges. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {profiles?.map((profile) => <UserCard key={profile.id} profile={profile} />)}
      </div>
    </>
  );
}
