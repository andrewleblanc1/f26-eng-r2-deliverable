"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Database } from "@/lib/schema";
import Image from "next/image";
type Species = Database["public"]["Tables"]["species"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// species/page.tsx joins each species row to its author's profile, so the row's `author` id arrives
// alongside the profile it points at.
type SpeciesWithAuthor = Species & { author_profile: Profile | null };

// Small helper so that every field renders the same way, with a fallback for the nullable columns.
function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p>{value ?? "Unknown"}</p>
    </div>
  );
}

export default function ViewSpeciesDialog({ species }: { species: SpeciesWithAuthor }) {
  const author = species.author_profile;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="mt-3 w-full">Learn More</Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{species.scientific_name}</DialogTitle>
          <DialogDescription>Detailed information about this species.</DialogDescription>
        </DialogHeader>
        {species.image && (
          <div className="relative h-60 w-full">
            <Image src={species.image} alt={species.scientific_name} fill style={{ objectFit: "cover" }} />
          </div>
        )}
        <div className="grid w-full gap-4">
          <DetailRow label="Scientific Name" value={species.scientific_name} />
          <DetailRow label="Common Name" value={species.common_name} />
          <DetailRow label="Kingdom" value={species.kingdom} />
          <DetailRow
            label="Total Population"
            value={species.total_population !== null ? species.total_population.toLocaleString() : null}
          />
          {/* The column is NOT NULL, so this is always a definite yes or no rather than "Unknown". */}
          <DetailRow label="Endangered" value={species.endangered ? "Yes" : "No"} />
          <DetailRow label="Description" value={species.description} />
          {/* Author details come from the joined profiles row. A species always has an author, but the
          profile is rendered defensively in case the join returns nothing. */}
          <div className="rounded-md border p-4">
            <p className="text-sm font-semibold text-muted-foreground">Added By</p>
            {author ? (
              <div className="mt-1 space-y-1">
                <p className="font-semibold">{author.display_name}</p>
                <p className="text-sm text-muted-foreground">{author.email}</p>
                {author.biography && <p className="text-sm">{author.biography}</p>}
              </div>
            ) : (
              <p className="mt-1">Unknown</p>
            )}
          </div>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
