import type { Database } from "@/lib/schema";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function UserCard({ profile }: { profile: Profile }) {
  return (
    // No fixed width: the card fills its grid column so rows span the whole page. h-full keeps every
    // card in a row the same height regardless of how long its biography is.
    <div className="h-full rounded border-2 p-3 shadow">
      <h3 className="text-2xl font-semibold">{profile.display_name}</h3>
      <h4 className="text-lg font-light">{profile.email}</h4>
      <p className="mt-2">{profile.biography ?? "This user has not written a biography yet."}</p>
    </div>
  );
}
