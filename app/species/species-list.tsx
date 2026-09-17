"use client";
/*
The search box needs state, and state requires a client component. Rather than making the whole route
a client component (which would give up server-side data fetching), species/page.tsx stays a server
component that fetches the list and hands it to this component, which owns the search input and
filters the list in the browser. No extra round trip per keystroke.
*/
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TypographyH2 } from "@/components/ui/typography";
import type { Database } from "@/lib/schema";
import { useState } from "react";
import AddSpeciesDialog from "./add-species-dialog";
import SpeciesCard from "./species-card";

type Species = Database["public"]["Tables"]["species"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type SpeciesWithAuthor = Species & { author_profile: Profile | null };

export default function SpeciesList({ species, userId }: { species: SpeciesWithAuthor[]; userId: string }) {
  const [query, setQuery] = useState("");

  // Lowercase both sides so the match is case-insensitive. An empty query lowercases to "", which every
  // string contains, so the unfiltered list falls out of the same code path.
  const search = query.toLowerCase().trim();
  const filteredSpecies = search
    ? species.filter((s) =>
        [s.scientific_name, s.common_name, s.description].some((field) => field?.toLowerCase().includes(search)),
      )
    : species;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <TypographyH2>Species List</TypographyH2>
        <AddSpeciesDialog userId={userId} />
      </div>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by scientific name, common name, or description..."
        aria-label="Search species"
      />
      <Separator className="my-4" />
      {filteredSpecies.length === 0 ? (
        <p className="text-center text-muted-foreground">No species match your search.</p>
      ) : (
        <div className="flex flex-wrap justify-center">
          {filteredSpecies.map((s) => (
            <SpeciesCard key={s.id} species={s} userId={userId} />
          ))}
        </div>
      )}
    </>
  );
}
