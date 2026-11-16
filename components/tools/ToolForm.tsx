"use client";

import { useId, useState } from "react";
import {
  isToolCategory,
  isToolCondition,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  type ToolCategory,
  type ToolCondition,
} from "@/convex/toolOptions";
import { errorMessage } from "@/lib/errors";
import {
  buttonPrimary,
  buttonSecondary,
  fieldClass,
  labelClass,
} from "@/lib/styles";

export type ToolFormValues = {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
};

const EMPTY_VALUES: ToolFormValues = {
  name: "",
  category: "other",
  condition: "good",
  description: "",
};

type ToolFormProps = {
  /** Existing values when editing; omitted when adding a new tool. */
  initialValues?: ToolFormValues;
  submitLabel: string;
  onSubmit: (values: ToolFormValues) => Promise<void>;
  onCancel?: () => void;
};

export function ToolForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: ToolFormProps) {
  const id = useId();
  const [values, setValues] = useState(initialValues ?? EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      if (initialValues === undefined) {
        setValues(EMPTY_VALUES);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-name`} className={labelClass}>
          Name
        </label>
        <input
          id={`${id}-name`}
          className={fieldClass}
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Cordless drill"
          required
        />
      </div>

      <div>
        <label htmlFor={`${id}-category`} className={labelClass}>
          Category
        </label>
        <select
          id={`${id}-category`}
          className={`${fieldClass} capitalize`}
          value={values.category}
          onChange={(event) => {
            const category = event.target.value;
            if (isToolCategory(category)) {
              setValues({ ...values, category });
            }
          }}
        >
          {TOOL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${id}-condition`} className={labelClass}>
          Condition
        </label>
        <select
          id={`${id}-condition`}
          className={`${fieldClass} capitalize`}
          value={values.condition}
          onChange={(event) => {
            const condition = event.target.value;
            if (isToolCondition(condition)) {
              setValues({ ...values, condition });
            }
          }}
        >
          {TOOL_CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {condition}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={`${id}-description`} className={labelClass}>
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          className={fieldClass}
          rows={3}
          value={values.description}
          onChange={(event) =>
            setValues({ ...values, description: event.target.value })
          }
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="What is included, anything a borrower should know"
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={buttonPrimary} disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel !== undefined && (
          <button
            type="button"
            className={buttonSecondary}
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
