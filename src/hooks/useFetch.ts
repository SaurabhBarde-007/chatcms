"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

/**
 * GET `url` (null = skip). Keeps the previous data while reloading, so screens don't flash.
 * `refreshMs` re-fetches on an interval (used while a campaign is sending).
 */
export function useFetch<T>(url: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(url);

  const load = useCallback(async () => {
    const target = latest.current;
    if (!target) return;
    setLoading(true);
    try {
      const result = await api.get<T>(target);
      if (latest.current === target) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (latest.current === target) setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      if (latest.current === target) setLoading(false);
    }
  }, []);

  useEffect(() => {
    latest.current = url;
    load();
  }, [url, load]);

  useEffect(() => {
    if (!refreshMs || !url) return;
    const timer = setInterval(load, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, url, load]);

  return { data, error, loading, reload: load };
}
