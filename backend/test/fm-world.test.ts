import { describe, expect, it } from "vitest";
import { FmWorldError, normalizeFmWorldRadios } from "../src/fm-world.js";

// Campi rilevanti della risposta reale di FM-World per Radio 105.
const radio = {
  id: 2626,
  name: "Radio 105",
  logo: "https://drr6gieappuhq.cloudfront.net/logos/2626/2626_logo.png",
  country: { name: "Italy" },
  categories: [{ value: "Contemporary" }, { value: "Pop" }],
  streams: [
    {
      url: "https://icecast.unitedradio.it/Radio105rp.aac",
      is_video: false,
      is_online: true,
    },
    {
      url: "https://live02-seg.msr.cdn.mediaset.net/live/ch-ec/ec-clr.isml/index.m3u8",
      is_video: true,
      is_online: true,
    },
  ],
};

describe("Normalizzazione FM-World", () => {
  it("estrae items, converte gli ID e sceglie l'audio evitando il video", () => {
    expect(normalizeFmWorldRadios({ count: 141, items: [radio] }, 3)).toEqual([
      {
        id: "2626",
        name: radio.name,
        logo: radio.logo,
        country: "Italy",
        genre: "Contemporary, Pop",
        streamUrl: radio.streams[0]!.url,
      },
    ]);
  });
  it("rispetta limit e gestisce ricerche vuote", () => {
    expect(normalizeFmWorldRadios({ items: [radio, radio] }, 1)).toHaveLength(
      1,
    );
    expect(normalizeFmWorldRadios({ count: 0, items: [] }, 10)).toEqual([]);
  });
  it("esclude radio senza audio online e mantiene gli stream HLS audio", () => {
    const video = { ...radio, streams: [radio.streams[1]!] };
    const offline = {
      ...radio,
      streams: [{ ...radio.streams[0]!, is_online: false }],
    };
    const hls = {
      ...radio,
      streams: [{ ...radio.streams[1]!, is_video: false }],
    };
    expect(normalizeFmWorldRadios({ items: [video, offline] }, 10)).toEqual([]);
    expect(
      normalizeFmWorldRadios({ items: [hls] }, 10)[0]?.streamUrl,
    ).toContain(".m3u8");
  });
  it("rifiuta risposte con uno schema diverso da quello reale", () => {
    expect(() => normalizeFmWorldRadios({ data: [] }, 10)).toThrow(
      FmWorldError,
    );
  });
});
