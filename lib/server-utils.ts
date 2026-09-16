// Add util functions that should only be run in server components. Importing these in client components will throw an error.
// For more info on how to avoid poisoning your server/client components: https://www.youtube.com/watch?v=BZlwtR9pDp4
import { env } from "@/env.mjs";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import "server-only";
import { type Database } from "./schema";

// Note: cookies() is asynchronous as of Next.js 15, so it has to be awaited before the store
// can be read. That makes this factory async too, so callers must `await` it.
export const createServerSupabaseClient = cache(async () => {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components get a read-only cookie store, so writes throw here. Ignoring is safe
          // because the middleware refreshes the session cookies on every request.
        }
      },
    },
  });
  return supabase;
});
