import { afterEach, describe, expect, it, vi } from "vitest";
import {
  summarizePosts,
  SummaryProviderError,
} from "../src/summary-provider.js";

const posts = [{ sourceId: "1", title: "Titolo", content: "Contenuto" }];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("summarizePosts", () => {
  it("non chiama il provider se non ci sono post", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(summarizePosts([])).resolves.toEqual(new Map());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("nel mock non chiama OpenAI", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(summarizePosts(posts)).resolves.toEqual(new Map());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("converte gli errori di rete in un errore leggibile", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(summarizePosts(posts)).rejects.toThrow(
      "Provider AI non raggiungibile",
    );
  });

  it("riconosce il timeout", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );

    await expect(summarizePosts(posts)).rejects.toThrow(
      "Timeout del provider AI dopo 30 secondi",
    );
  });

  it("riferisce gli errori HTTP del provider", async () => {
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

    await expect(summarizePosts(posts)).rejects.toThrow("Limite raggiunto");
  });

  it("rifiuta una risposta non JSON", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );

    await expect(summarizePosts(posts)).rejects.toThrow(
      "Il provider AI ha restituito JSON non valido",
    );
  });

  it("tronca contenuti lunghi prima di inviarli e accetta i riassunti", async () => {
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
                  text: JSON.stringify({
                    summaries: [{ sourceId: "1", summary: "Riassunto." }],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const longPosts = [{ ...posts[0], content: "x".repeat(20_000) }];
    await expect(summarizePosts(longPosts)).resolves.toEqual(
      new Map([["1", "Riassunto."]]),
    );
    const request = JSON.parse(fetch.mock.calls[0][1].body as string);
    const sentPost = JSON.parse(request.input)[0];
    expect(sentPost.content.length).toBeLessThan(13_000);
    expect(sentPost.content).toContain("[contenuto troncato]");
  });

  it("rifiuta una risposta che omette un post", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ summaries: [] }),
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(summarizePosts(posts)).rejects.toBeInstanceOf(
      SummaryProviderError,
    );
  });
});
