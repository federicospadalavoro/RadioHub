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
    .slice(0, limit);
}

export async function searchFmWorldRadios(
  query: string,
  limit: number,
  token: string,
) {
  const url = new URL("https://connect.fm-world.com/client2/radios");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new FmWorldError(
        "FM-World ha rifiutato la richiesta",
        502,
        response.status,
      );
    return normalizeFmWorldRadios(await response.json(), limit);
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
