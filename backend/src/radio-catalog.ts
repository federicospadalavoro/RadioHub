import { readFileSync } from "node:fs";

// Catalogo verificato: l'ordine viene dagli ascolti, gli ID dai singoli abbinamenti.
export const radioCatalog = JSON.parse(
  readFileSync(new URL("../data/popular-radios.json", import.meta.url), "utf8"),
);
