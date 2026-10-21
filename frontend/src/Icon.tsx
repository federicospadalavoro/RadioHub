import type { CSSProperties } from "react";
import files from "./icon-assets";

const names = {
  moon: "moon",
  sun: "sun.max",
  radio: "radio",
  news: "newspaper",
  document: "text.document",
  share: "square.and.arrow.up",
  chevron: "chevron.down",
  spark: "sparkle",
  play: "play",
  pause: "pause",
  next: "forward.end",
  previous: "backward.end",
  heart: "heart",
  search: "magnifyingglass",
  arrow: "arrow.right",
  volume: "speaker.wave.2",
  mute: "speaker.slash",
  close: "xmark",
  user: "person",
};
export default function Icon({
  name,
  size = 20,
  filled = ["play", "pause", "previous", "next"].includes(name),
}: {
  name: keyof typeof names;
  size?: number;
  filled?: boolean;
}) {
  const base = `./icons/${names[name]}`;
  const url =
    files[`${base}${filled ? ".fill" : ""}.svg`] ?? files[`${base}.svg`];
  return (
    <span
      className="icon"
      aria-hidden="true"
      style={
        {
          "--icon-size": `${size}px`,
          maskImage: `url("${url}")`,
          WebkitMaskImage: `url("${url}")`,
        } as CSSProperties
      }
    />
  );
}
