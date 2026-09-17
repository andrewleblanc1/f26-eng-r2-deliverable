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

// Small helper so that every field renders the same way, with a fallback for the nullable columns.
function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p>{value ?? "Unknown"}</p>
    </div>
  );
}

export default function ViewSpeciesDialog({ species }: { species: Species }) {
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
          <DetailRow label="Description" value={species.description} />
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
