import catalog from "./catalog.en.json" with { type: "json" };
import saffire from "./saffire.en.json" with { type: "json" };
import experiments from "./experiments.en.json" with { type: "json" };
import flare from "./flare.en.json" with { type: "json" };

// Presentation-only translations. Never rewrite the source artifacts: their
// original values and hashes remain part of the scientific audit trail.
const translations: Readonly<Record<string, string>> = {
  ...catalog,
  ...saffire,
  ...experiments,
  ...flare,
  "Alumínio": "Aluminum",
  "Algodão": "Cotton",
  "Algodão jersey": "Cotton jersey",
};

export function englishText(value: string): string {
  return Object.hasOwn(translations, value) ? translations[value] : value;
}

// Use only for a presentation copy, never for model matching, verification,
// dossier construction or export. Raw cells and all property names stay intact.
export function englishDisplayData<T>(value: T): T {
  if (typeof value === "string") return englishText(value) as T;
  if (Array.isArray(value)) return value.map(englishDisplayData) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === "raw" ? item : englishDisplayData(item),
    ])) as T;
  }
  return value;
}
