import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "../src/App";

vi.mock("../src/RadioAudio", () => ({ default: () => null }));
vi.mock("../src/session", () => ({
  renewSession: vi.fn().mockResolvedValue(null),
  saveSession: vi.fn(),
  authenticatedFetch: vi.fn(),
  endSession: vi.fn(),
}));

const radio = {
  id: "r1",
  name: "Rock FM",
  genre: "Rock",
  country: "Italia",
  logo: null,
  streamUrl: "https://stream.test/live",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
let search: Mock<(url: URL, options?: RequestInit) => Promise<Response>>;
let posts: Mock<(url: URL, options?: RequestInit) => Promise<Response>>;

beforeEach(() => {
  vi.useFakeTimers();
  search = vi.fn().mockResolvedValue(json([radio]));
  posts = vi.fn().mockImplementation(async () => json([]));
  const fetchMock = vi.fn((input: string, options?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/radios/popular")
      return Promise.resolve(json({ radios: [] }));
    if (url.pathname === "/api/posts") return posts(url, options);
    if (url.pathname === "/api/radios/interpret")
      return Promise.resolve(
        json({ query: "", category: 14, country: "IT", limit: 10 }),
      );
    if (url.pathname === "/api/radios") return search(url, options);
    throw new Error(`Richiesta imprevista: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

async function advance(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Ricerca radio", () => {
  it("aspetta 300 ms, invia testo e limite e mostra le radio restituite", async () => {
    render(<App />);
    const input = screen.getByRole("textbox", { name: "Cerca una radio" });
    fireEvent.change(input, { target: { value: "Rock & Pop" } });
    await advance(299);
    expect(search).not.toHaveBeenCalled();
    await advance(1);
    expect(search).toHaveBeenCalledOnce();
    const [url] = search.mock.calls[0] as [URL];
    expect(url.searchParams.get("query")).toBe("Rock & Pop");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(
      screen.getByRole("button", { name: "Ascolta Rock FM" }),
    ).toBeInTheDocument();
  });

  it("annulla la ricerca precedente e ignora anche una risposta tardiva", async () => {
    let resolveOld!: (response: Response) => void;
    search.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(<App />);
    const input = screen.getByRole("textbox", { name: "Cerca una radio" });
    fireEvent.change(input, { target: { value: "vecchia" } });
    await advance();
    const signal = search.mock.calls[0][1]!.signal as AbortSignal;
    fireEvent.change(input, { target: { value: "nuova" } });
    expect(signal.aborted).toBe(true);
    await advance();
    await act(async () => {
      resolveOld(json([{ ...radio, id: "old", name: "Radio vecchia" }]));
    });
    expect(
      screen.queryByRole("button", { name: "Ascolta Radio vecchia" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ascolta Rock FM" }),
    ).toBeInTheDocument();
  });

  it("pulisce risultati e query senza una nuova richiesta quando cancelli", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca una radio" }), {
      target: { value: "rock" },
    });
    await advance();
    fireEvent.click(screen.getByRole("button", { name: "Cancella ricerca" }));
    await advance();
    expect(
      screen.getByRole("textbox", { name: "Cerca una radio" }),
    ).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Ascolta Rock FM" }),
    ).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledOnce();
  });

  it("mostra gli errori del backend invece di risultati finti", async () => {
    search.mockResolvedValue(json({ error: "FM-World non disponibile" }, 502));
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca una radio" }), {
      target: { value: "rock" },
    });
    await advance();
    expect(screen.getByText("FM-World non disponibile")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ascolta Rock FM" }),
    ).not.toBeInTheDocument();
  });

  it("usa paese e genere interpretati dall'AI al posto della ricerca per nome", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca una radio" }), {
      target: { value: "rock italiana" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cerca con AI/ }));
    });
    await advance();
    const [url] = search.mock.calls.at(-1) as [URL];
    expect(url.searchParams.get("query")).toBe("");
    expect(url.searchParams.get("country")).toBe("IT");
    expect(url.searchParams.get("category")).toBe("14");
    expect(screen.getByText("Risultati AI")).toBeInTheDocument();
  });

  it("filtra le notizie per titolo e ignora la risposta del filtro precedente", async () => {
    let resolveOld!: (response: Response) => void;
    const post = {
      id: "p1",
      title: "Notizia nuova",
      summary: null,
      publishedAt: null,
      content: "Testo",
    };
    posts.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    posts.mockImplementation(async () => json([post]));
    render(<App />);
    await advance();
    const signal = posts.mock.calls[0][1]!.signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Vedi tutte" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Filtra per titolo" }),
      { target: { value: "nuova" } },
    );
    expect(signal.aborted).toBe(true);
    await advance();
    const [url] = posts.mock.calls.at(-1) as [URL];
    expect(url.searchParams.get("title")).toBe("nuova");
    expect(url.searchParams.get("items")).toBe("10");
    expect(url.searchParams.get("skip")).toBe("0");
    await act(async () => {
      resolveOld(json([{ ...post, id: "old", title: "Notizia vecchia" }]));
    });
    expect(
      screen.getByRole("button", { name: "Leggi la notizia: Notizia nuova" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Leggi la notizia: Notizia vecchia",
      }),
    ).not.toBeInTheDocument();
  });
});
