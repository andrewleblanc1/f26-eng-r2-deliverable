import { createServerSupabaseClient } from "@/lib/server-utils";
import { redirect } from "next/navigation";
import SpeciesList from "./species-list";

export default async function SpeciesPage() {
  // Create supabase server component client and obtain user session from stored cookie
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // this is a protected route - only users who are signed in can view this route
    redirect("/");
  }

  // Obtain the ID of the currently signed-in user
  const sessionId = session.user.id;

  // Join each species to its author's profile. The `species.author` column is only a user id, so the
  // embedded resource is what lets the detailed view show who added the species. The relationship is
  // named explicitly (species_author_fkey) because it is the foreign key linking the two tables.
  const { data: species } = await supabase
    .from("species")
    .select("*, author_profile:profiles!species_author_fkey(id, display_name, email, biography)")
    .order("id", { ascending: false });

  // The list itself is rendered by a client component so that searching can be handled in the browser
  // without refetching from the database on every keystroke.
  return <SpeciesList species={species ?? []} userId={sessionId} />;
}
