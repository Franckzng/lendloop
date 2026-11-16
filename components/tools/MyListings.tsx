"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { buttonDanger, buttonSecondary, cardClass } from "@/lib/styles";
import { AvailabilityBadge, CategoryBadge } from "./Badges";
import { ToolForm } from "./ToolForm";

type Listing = FunctionReturnType<typeof api.tools.myListings>[number];

type RowMode = "view" | "edit" | "confirm-delete";

function ListingRow({ tool }: { tool: Listing }) {
  const updateTool = useMutation(api.tools.update);
  const removeTool = useMutation(api.tools.remove);
  const [mode, setMode] = useState<RowMode>("view");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await removeTool({ toolId: tool._id });
    } catch (cause) {
      setError(errorMessage(cause));
      setMode("view");
      setDeleting(false);
    }
  }

  if (mode === "edit") {
    return (
      <li className={cardClass}>
        <ToolForm
          initialValues={{
            name: tool.name,
            category: tool.category,
            condition: tool.condition,
            description: tool.description,
          }}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            await updateTool({ toolId: tool._id, ...values });
            setMode("view");
          }}
          onCancel={() => setMode("view")}
        />
      </li>
    );
  }

  return (
    <li className={`${cardClass} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-900">{tool.name}</h3>
        <AvailabilityBadge available={tool.available} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <CategoryBadge category={tool.category} />
        <span className="capitalize">{tool.condition}</span>
      </div>
      {tool.description !== "" && (
        <p className="text-sm text-zinc-700">{tool.description}</p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {mode === "view" ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setError(null);
              setMode("edit");
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className={buttonDanger}
            onClick={() => {
              setError(null);
              setMode("confirm-delete");
            }}
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <p className="text-sm text-zinc-700">Delete this tool?</p>
          <button
            type="button"
            className={buttonDanger}
            onClick={() => void confirmDelete()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => setMode("view")}
            disabled={deleting}
          >
            Keep it
          </button>
        </div>
      )}
    </li>
  );
}

export function MyListings() {
  const tools = useQuery(api.tools.myListings);
  const createTool = useMutation(api.tools.create);

  return (
    <section className="flex flex-col gap-6">
      <div className={cardClass}>
        <h2 className="mb-4 font-medium text-zinc-900">Add a tool</h2>
        <ToolForm
          submitLabel="Add tool"
          onSubmit={async (values) => {
            await createTool(values);
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium text-zinc-900">Your tools</h2>
        {tools === undefined && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
        {tools !== undefined && tools.length === 0 && (
          <p className={`${cardClass} text-sm text-zinc-600`}>
            You have not listed any tools yet. Use the form above to add one.
          </p>
        )}
        {tools !== undefined && tools.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <ListingRow key={tool._id} tool={tool} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
