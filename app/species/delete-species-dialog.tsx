"use client";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/client-utils";
import type { Database } from "@/lib/schema";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Species = Database["public"]["Tables"]["species"]["Row"];

export default function DeleteSpeciesDialog({ species }: { species: Species }) {
  const router = useRouter();

  // Control open/closed state of the dialog
  const [open, setOpen] = useState<boolean>(false);

  // Deleting is irreversible, so the button is disabled while the request is in flight to avoid
  // firing a second delete on a double click.
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    // The delete is scoped with .eq("id", ...) so that only this species row is removed. Supabase
    // row-level security additionally rejects deletes from anyone who isn't the author.
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("species").delete().eq("id", species.id);

    setIsDeleting(false);

    // Catch and report errors from Supabase and exit the handler with an early 'return' if an error occurred.
    if (error) {
      return toast({
        title: "Something went wrong.",
        description: error.message,
        variant: "destructive",
      });
    }

    // Because Supabase errors were caught above, the remainder of the function will only execute upon a successful delete

    setOpen(false);

    // Refresh all server components in the current route. Species are fetched in a server component,
    // species/page.tsx, so refreshing is what removes the deleted card from the list.
    router.refresh();

    return toast({
      title: "Species deleted!",
      description: "Successfully deleted " + species.scientific_name + ".",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="mt-3 w-full">
          <Icons.trash className="mr-3 h-5 w-5" />
          Delete Species
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Delete Species</DialogTitle>
          {/* Naming the species in the confirmation makes it obvious if the wrong card's button was clicked. */}
          <DialogDescription>
            Are you sure you want to delete {species.scientific_name}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex">
          <Button
            type="button"
            variant="destructive"
            className="ml-1 mr-1 flex-auto"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "Deleting..." : "Delete Species"}
          </Button>
          <Button type="button" variant="secondary" className="ml-1 mr-1 flex-auto" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
