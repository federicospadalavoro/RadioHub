import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretRadioSearch } from "../src/radio-search.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("interpretRadioSearch", () => {
  it("estrae parole chiave dal testo con la risposta strutturata", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ query: "rock Italia", limit: 3 }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      interpretRadioSearch("Vorrei una radio rock italiana"),
    ).resolves.toEqual({ query: "rock Italia", limit: 3 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("propaga un errore HTTP del provider", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Limite raggiunto" } }),
          {
            status: 429,
          },
        ),
      ),
    );

    await expect(interpretRadioSearch("radio rock")).rejects.toThrow(
      "Limite raggiunto",
    );
  });
});
