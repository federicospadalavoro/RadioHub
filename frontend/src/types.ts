export type Radio = {
  id: string;
  name: string;
  logo: string | null;
  genre: string;
  country: string;
  streamUrl: string;
  rank?: number;
  listeners?: number;
  area?: string;
};

export type RadioCatalog = {
  source: string;
  sourceUrl: string;
  period: string;
  metric: string;
  note: string;
  radios: Radio[];
};
