import { useEffect, useState } from "react";
import type { NasaData } from "../types";
export function useNasaData() {
  const [data, setData] = useState<NasaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${import.meta.env.BASE_URL}data/nasa-experiments.json`, {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error(
            "O snapshot NASA ainda não está disponível nesta instalação.",
          );
        return response.json();
      })
      .then((value: NasaData) => {
        if (
          !Array.isArray(value.investigations) ||
          !Array.isArray(value.errors) ||
          !Number.isFinite(Date.parse(value.retrievedAt)) ||
          !value.investigations.every(
            (investigation) =>
              typeof investigation.id === "string" &&
              Array.isArray(investigation.tests) &&
              Array.isArray(investigation.limitations) &&
              investigation.testCount === investigation.tests.length &&
              investigation.tests.every(
                (test) =>
                  typeof test.id === "string" &&
                  test.raw &&
                  typeof test.raw === "object" &&
                  [test.oxygenPct, test.pressureKpa, test.flowCmS].every(
                    (value) =>
                      value === null ||
                      (typeof value === "number" && Number.isFinite(value)),
                  ),
              ),
          )
        )
          throw new Error(
            "O arquivo de dados não corresponde ao contrato esperado.",
          );
        setData(value);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setError(reason.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
