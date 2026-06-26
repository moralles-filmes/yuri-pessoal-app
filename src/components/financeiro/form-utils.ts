import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Aplica os fieldErrors retornados por uma Server Action ao react-hook-form. */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors?: Record<string, string[]>,
) {
  if (!fieldErrors) return;
  for (const [name, msgs] of Object.entries(fieldErrors)) {
    if (msgs?.length) setError(name as Path<T>, { message: msgs[0] });
  }
}
