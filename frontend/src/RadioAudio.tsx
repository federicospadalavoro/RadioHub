import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

let playing: HTMLAudioElement | null = null;

export default function RadioAudio({
  src,
  name,
}: {
  src: string;
  name: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const hls = useRef<Hls | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = audio.current!;
    setError(false);
    if (
      /\.m3u8(?:[?#]|$)/i.test(src) &&
      !element.canPlayType("application/vnd.apple.mpegurl") &&
      Hls.isSupported()
    ) {
      const engine = new Hls({ autoStartLoad: false });
      hls.current = engine;
      engine.attachMedia(element);
      engine.loadSource(src);
      engine.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
    } else element.src = src;
    return () => {
      if (playing === element) playing = null;
      hls.current?.destroy();
      hls.current = null;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [src]);
  return (
    <>
      <audio
        ref={audio}
        aria-label={`Ascolta ${name}`}
        controls
        preload="none"
        onPlay={(event) => {
          if (playing && playing !== event.currentTarget) playing.pause();
          playing = event.currentTarget;
          hls.current?.startLoad();
        }}
        onError={() => setError(true)}
      />
      {error && <span role="alert">Stream di {name} non disponibile.</span>}
    </>
  );
}
