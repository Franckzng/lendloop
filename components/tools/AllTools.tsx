"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  isToolCategory,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "@/convex/toolOptions";
import { cardClass, fieldCompactClass } from "@/lib/styles";
import { AvailabilityBadge, CategoryBadge } from "./Badges";

export function AllTools() {
  const [category, setCategory] = useState<ToolCategory | undefined>(undefined);
  const tools = useQuery(api.tools.listAll, { category });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="category-filter" className="text-sm text-zinc-700">
          Category
        </label>
        <select
          id="category-filter"
          className={`${fieldCompactClass} capitalize`}
          value={category ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            setCategory(isToolCategory(value) ? value : undefined);
          }}
        >
          <option value="">All</option>
          {TOOL_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {tools === undefined && <p className="text-sm text-zinc-500">Loading…</p>}

      {tools !== undefined && tools.length === 0 && (
        <p className={`${cardClass} text-sm text-zinc-600`}>
          {category === undefined
            ? "No tools have been listed yet. Add the first one from “My listings”."
            : "No tools in this category yet."}
        </p>
      )}

      {tools !== undefined && tools.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id} className={`${cardClass} flex flex-col gap-2`}>
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
              <p className="text-xs text-zinc-500">
                {tool.isMine ? "Your tool" : `Lent by ${tool.ownerName}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
