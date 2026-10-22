import { readFileSync } from "node:fs";

const catalog = JSON.parse(
  readFileSync(new URL("../data/popular-radios.json", import.meta.url), "utf8"),
) as { radios: { fmWorldId?: string | null }[] } & Record<string, unknown>;

export const radioCatalog = {
  ...catalog,
  radios: catalog.radios.filter((radio) => radio.fmWorldId),
};
