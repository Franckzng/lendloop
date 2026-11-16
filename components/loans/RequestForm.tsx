"use client";

import { useMutation } from "convex/react";
import { useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localToday } from "@/lib/dates";
import {
  buttonPrimary,
  buttonSecondary,
  fieldClass,
  labelClass,
} from "@/lib/styles";
import { useAsyncAction } from "@/lib/useAsyncAction";

type RequestFormProps = {
  toolId: Id<"tools">;
  onSent: () => void;
  onCancel: () => void;
};

export function RequestForm({ toolId, onSent, onCancel }: RequestFormProps) {
  const id = useId();
  const requestLoan = useMutation(api.loans.requestLoan);
  const { run, pending, error } = useAsyncAction();
  const [today] = useState(localToday);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  async function send() {
    const sent = await run(() => requestLoan({ toolId, startDate, endDate }));
    if (sent) {
      onSent();
    }
  }

  return (
    <form
      className="grid grid-cols-2 gap-3 border-t border-zinc-200 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div>
        <label htmlFor={`${id}-start`} className={labelClass}>
          From
        </label>
        <input
          id={`${id}-start`}
          type="date"
          className={fieldClass}
          value={startDate}
          min={today}
          onChange={(event) => {
            setStartDate(event.target.value);
            if (endDate < event.target.value) {
              setEndDate(event.target.value);
            }
          }}
          required
        />
      </div>
      <div>
        <label htmlFor={`${id}-end`} className={labelClass}>
          Until
        </label>
        <input
          id={`${id}-end`}
          type="date"
          className={fieldClass}
          value={endDate}
          min={startDate}
          onChange={(event) => setEndDate(event.target.value)}
          required
        />
      </div>

      {error !== null && (
        <p role="alert" className="col-span-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="col-span-2 flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          className={buttonSecondary}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
