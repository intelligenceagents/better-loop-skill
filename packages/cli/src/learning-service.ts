import { parseJson } from "@better-loop/contracts";
import { parseLearningQuery, parseLearningServiceOrigin, retrieveLearningLessons } from "@better-loop/core";
import type { LearningQuery } from "@better-loop/core";

/** An explicit public GET only. No auth, cookies, source text, task goal, or evidence can enter the request. */
export async function learnFromService(queryInput: unknown, selectedOrigin: string) {
  const query = parseLearningQuery(queryInput);
  const origin = parseLearningServiceOrigin(selectedOrigin);
  return retrieveLearningLessons(query, {
    async retrieve(controlled: LearningQuery) {
      const url = new URL("/api/lessons", origin);
      url.searchParams.set("task_family", controlled.task_family);
      url.searchParams.set("problem_type", controlled.problem_type);
      url.searchParams.set("objective", controlled.objective);
      for (const constraint of controlled.constraints) url.searchParams.append("constraints", constraint);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
          headers: { Accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok || response.status !== 200 ||
            !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") ||
            !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get("cache-control") ?? "") ||
            !response.body) throw new Error("learning_service_unavailable");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > 65536) throw new Error("learning_response_too_large");
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        return parseJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      } finally { clearTimeout(timer); controller.abort(); }
    },
  }, { service_origin: origin });
}
