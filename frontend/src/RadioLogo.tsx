import { useState } from "react";
import type { Radio } from "./types";

export default function RadioLogo({
  radio,
}: {
  radio: Pick<Radio, "name" | "logo">;
}) {
  const [failed, setFailed] = useState("");
  return radio.logo && failed !== radio.logo ? (
    <img
      src={radio.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(radio.logo!)}
    />
  ) : (
    <span className="logo-initials" aria-hidden="true">
      {radio.name.replace(/^radio\s*/i, "").slice(0, 3)}
    </span>
  );
}
