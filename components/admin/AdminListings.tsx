"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { CategoryBadge } from "@/components/tools/Badges";
import { api } from "@/convex/_generated/api";
import { buttonDanger, buttonSecondary, cardClass } from "@/lib/styles";
import { useAsyncAction } from "@/lib/useAsyncAction";

type Listing = FunctionReturnType<typeof api.admin.listAllListings>[number];

function ListingRow({ listing }: { listing: Listing }) {
  const removeAnyListing = useMutation(api.admin.removeAnyListing);
  const { run, pending, error } = useAsyncAction();
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    const removed = await run(() => removeAnyListing({ toolId: listing._id }));
    if (!removed) {
      setConfirming(false);
    }
  }

  return (
    <li className={`${cardClass} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-900">{listing.name}</h3>
        <CategoryBadge category={listing.category} />
      </div>
      <p className="text-xs text-zinc-500">Listed by {listing.ownerName}</p>
      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <p className="text-sm text-zinc-700">Remove this listing?</p>
          <button
            type="button"
            className={buttonDanger}
            disabled={pending}
            onClick={() => void remove()}
          >
            {pending ? "Removing…" : "Yes, remove"}
          </button>
          <button
            type="button"
            className={buttonSecondary}
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
        </div>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            className={buttonDanger}
            onClick={() => setConfirming(true)}
          >
            Remove listing
          </button>
        </div>
      )}
    </li>
  );
}

export function AdminListings() {
  const listings = useQuery(api.admin.listAllListings);

  if (listings === undefined) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (listings.length === 0) {
    return (
      <p className={`${cardClass} text-sm text-zinc-600`}>
        No tools have been listed yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {listings.map((listing) => (
        <ListingRow key={listing._id} listing={listing} />
      ))}
    </ul>
  );
}
