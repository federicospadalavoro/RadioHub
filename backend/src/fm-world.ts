import { config } from "./config.js";

type FmRadio = {
  id: number | string;
  name: string;
  logo?: string | null;
  country?: { name: string } | null;
  categories?: { value: string }[];
  streams?: {
    url: string;
    is_video: boolean;
    is_online: boolean;
    priority?: number;
  }[];
};

// Identificativi delle categorie restituiti da FM-World.
export const radioCategories = {
  3: "Contemporary",
  4: "Thematic",
  5: "News",
  7: "Oldies",
  10: "Local",
  12: "Pop",
  14: "Rock",
  15: "Talk",
  16: "Classica",
  20: "Jazz",
  21: "Classic hit",
  22: "Folk/Musica popolare/Liscio",
  24: "Hip Hop RNB",
  25: "Funky/Soul",
  26: "Electronica",
  31: "Lounge",
  40: "Dance",
  41: "Musica Italiana",
  42: "Anni 80/90",
};

export class FmWorldError extends Error {
  constructor(
    message: string,
    public status = 502,
    public sourceStatus?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function normalizeFmWorldRadios(data: unknown, limit: number) {
  if (
    !data ||
    typeof data !== "object" ||
    !("items" in data) ||
    !Array.isArray(data.items)
  ) {
    throw new FmWorldError("Formato della risposta FM-World non valido");
  }
  return (data.items as FmRadio[])
    .flatMap((radio) => {
      if (
        !radio ||
        !["number", "string"].includes(typeof radio.id) ||
        typeof radio.name !== "string"
      ) {
        throw new FmWorldError("Metadati radio non validi");
      }
      const stream = (radio.streams ?? [])
        .filter(
          (item) =>
            !item.is_video &&
            item.is_online !== false &&
            /^https?:\/\//i.test(item.url),
        )
        .sort(
          (a, b) =>
            Number(b.url.startsWith("https:")) -
              Number(a.url.startsWith("https:")) ||
            Number(/\.m3u8(?:\?|$)/i.test(a.url)) -
              Number(/\.m3u8(?:\?|$)/i.test(b.url)) ||
            (a.priority ?? 0) - (b.priority ?? 0),
        )[0];
      if (!stream) return [];
      return [
        {
          id: String(radio.id),
          name: radio.name,
          logo: radio.logo ?? null,
          genre: (radio.categories ?? [])
            .map((category) => category.value)
            .join(", "),
          country: radio.country?.name ?? "",
          streamUrl: stream.url,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(/^(italy|italia|it)$/i.test(b.country.trim())) -
        Number(/^(italy|italia|it)$/i.test(a.country.trim())),
    )
    .slice(0, limit);
}

export async function searchFmWorldRadios(
  query: string,
  limit: number,
  token: string,
  category: number | null = null,
  country = "",
) {
  const url = new URL(config.fmWorldUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "50");
  if (category !== null) url.searchParams.set("categories", String(category));
  if (country) url.searchParams.set("countries", country);
  return normalizeFmWorldRadios(await fetchFmWorld(url, token), limit);
}

export async function getFmWorldRadio(id: string, token: string) {
  const url = new URL(`${config.fmWorldUrl.replace(/\/$/, "")}/${id}`);
  try {
    const data = await fetchFmWorld(url, token);
    if (!data) return null;
    const radio = normalizeFmWorldRadios({ items: [data] }, 1)[0];
    return radio?.id === id ? radio : null;
  } catch (error) {
    if (error instanceof FmWorldError && error.sourceStatus === 404)
      return null;
    throw error;
  }
}

async function fetchFmWorld(url: URL, token: string) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    if (!response.ok)
      throw new FmWorldError(
        "FM-World ha rifiutato la richiesta",
        502,
        response.status,
      );
    return await response.json();
  } catch (error) {
    if (error instanceof FmWorldError) throw error;
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new FmWorldError(
      timeout
        ? "Timeout di FM-World"
        : "FM-World non raggiungibile o risposta non valida",
      timeout ? 504 : 502,
      undefined,
      { cause: error },
    );
  }
}
