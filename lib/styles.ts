// Shared Tailwind class lists, so buttons and fields look the same everywhere.

const buttonBase =
  "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonPrimary = `${buttonBase} bg-zinc-900 text-white hover:bg-zinc-700`;

export const buttonSecondary = `${buttonBase} border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50`;

export const buttonDanger = `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`;

const fieldBase =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900";

export const fieldClass = `${fieldBase} w-full`;

/** Same look as a field, but only as wide as its content. */
export const fieldCompactClass = fieldBase;

export const labelClass = "mb-1 block text-sm font-medium text-zinc-700";

export const cardClass = "rounded-lg border border-zinc-200 bg-white p-4";
