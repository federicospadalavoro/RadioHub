import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import type Hls from "hls.js";
import Icon from "./Icon";
import RadioLogo from "./RadioLogo";
import type { Radio } from "./types";
import VolumeControl from "./VolumeControl";
import { playbackLabels, type PlaybackStatus } from "./playback";
import { useAppDispatch, useAppSelector } from "./hooks";
import {
  setPlaybackActive,
  setPlaybackStatus,
  setVolume,
  toggleMute,
} from "./store";

export default function RadioAudio({
  radio,
  favorite,
  onFavorite,
  onNext,
  onPrevious,
}: {
  radio: Radio | null;
  favorite: boolean;
  onFavorite: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const dispatch = useAppDispatch();
  const {
    request,
    status,
    active: playbackActive,
    volume,
    muted,
  } = useAppSelector((state) => state.player);
  const statusRef = useRef(status);
  statusRef.current = status;
  const setStatus = useCallback(
    (next: SetStateAction<PlaybackStatus>) => {
      const value = typeof next === "function" ? next(statusRef.current) : next;
      statusRef.current = value;
      dispatch(setPlaybackStatus(value));
    },
    [dispatch],
  );
  const setActive = useCallback(
    (active: boolean) => dispatch(setPlaybackActive(active)),
    [dispatch],
  );
  const volumeControls = {
    volume,
    muted,
    onVolume: (value: number) => dispatch(setVolume(value)),
    onMute: () => dispatch(toggleMute()),
  };
  const audio = useRef<HTMLAudioElement>(null);
  const consumedRequest = useRef(0);
  const latestRequest = useRef(request);
  const engineRef = useRef<Hls | null>(null);
  const streamReady = useRef(false);
  const wantsPlay = useRef(false);
  const [shared, setShared] = useState("");
  const playing = status === "playing";
  const fail = useCallback(() => {
    wantsPlay.current = false;
    setStatus("error");
    audio.current?.pause();
    engineRef.current?.stopLoad();
    setActive(false);
  }, [setActive, setStatus]);
  const play = useCallback(() => {
    wantsPlay.current = true;
    setActive(true);
    setStatus("loading");
    if (!streamReady.current) return;
    engineRef.current?.startLoad();
    return audio.current?.play().catch((error: Error) => {
      if (error.name !== "AbortError" && wantsPlay.current) fail();
    });
  }, [fail, setActive, setStatus]);

  const togglePlayback = useCallback(() => {
    if (wantsPlay.current) {
      wantsPlay.current = false;
      setActive(false);
      audio.current!.pause();
      setStatus("paused");
    } else void play();
  }, [play, setActive, setStatus]);

  useEffect(() => {
    latestRequest.current = request;
  }, [request]);

  useEffect(() => {
    audio.current!.volume = volume;
    audio.current!.muted = muted;
  }, [volume, muted]);
  useEffect(() => {
    if (status !== "loading" && status !== "buffering") return;
    const timer = setTimeout(() => {
      if (wantsPlay.current) fail();
    }, 20_000);
    return () => clearTimeout(timer);
  }, [status, radio?.id, fail]);

  function waiting() {
    if (!wantsPlay.current) return;
    setStatus((status) =>
      status === "playing" || status === "buffering" ? "buffering" : "loading",
    );
  }

  useEffect(() => {
    function handleSpace(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented ||
        !radio
      )
        return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], dialog"))
        return;
      if (
        target.closest("button") &&
        !target.closest(".station-select, .player-play")
      )
        return;
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
    document.addEventListener("keydown", handleSpace);
    return () => document.removeEventListener("keydown", handleSpace);
  }, [radio, togglePlayback]);

  useEffect(() => {
    const element = audio.current!;
    if (!radio) return;
    const currentRequest = latestRequest.current;
    consumedRequest.current = currentRequest;
    setStatus(currentRequest > 0 ? "loading" : "idle");
    setShared("");
    let engine: Hls | undefined;
    let disposed = false;
    const autoplay = currentRequest > 0;
    wantsPlay.current = autoplay;
    setActive(autoplay);
    streamReady.current = false;
    if (
      /\.m3u8(?:[?#]|$)/i.test(radio.streamUrl) &&
      !element.canPlayType("application/vnd.apple.mpegurl")
    ) {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) {
            fail();
            return;
          }
          engine = new Hls({
            autoStartLoad: false,
          });
          engineRef.current = engine;
          engine.loadSource(radio.streamUrl);
          engine.attachMedia(element);
          engine.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!disposed) {
              streamReady.current = true;
              if (wantsPlay.current) void play();
            }
          });
          engine.on(Hls.Events.ERROR, (_event, data) => {
            if (!disposed && data.fatal) {
              fail();
              engine?.destroy();
            }
          });
        })
        .catch(() => {
          if (!disposed) fail();
        });
    } else {
      streamReady.current = true;
      element.src = radio.streamUrl;
      if (autoplay) void play();
    }
    const startLoading = () => engine?.startLoad();
    element.addEventListener("play", startLoading);
    return () => {
      disposed = true;
      element.removeEventListener("play", startLoading);
      engine?.destroy();
      engineRef.current = null;
      streamReady.current = false;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [radio, play, fail, setActive, setStatus]);

  useEffect(() => {
    if (radio && request !== consumedRequest.current) {
      consumedRequest.current = request;
      togglePlayback();
    }
  }, [request, radio, togglePlayback]);
  useEffect(() => {
    if (!radio || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: radio.name,
      artist: "RadioHub · Radio in diretta",
    });
    navigator.mediaSession.setActionHandler("play", () => {
      void play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      wantsPlay.current = false;
      setActive(false);
      audio.current!.pause();
      setStatus("paused");
    });
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
    navigator.mediaSession.setActionHandler("previoustrack", onPrevious);
    return () => {
      for (const action of [
        "play",
        "pause",
        "nexttrack",
        "previoustrack",
      ] as const)
        navigator.mediaSession.setActionHandler(action, null);
    };
  }, [radio, onNext, onPrevious, setActive, setStatus, play]);

  async function share() {
    if (!radio) return;
    const url = new URL(location.href);
    url.hash = new URLSearchParams({ radio: radio.id }).toString();
    try {
      if (navigator.share)
        await navigator.share({ title: radio.name, url: url.href });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url.href);
        setShared("Link copiato");
      } else setShared(url.href);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setShared("Condivisione non disponibile");
    }
  }
  return (
    <section
      className="panel player-panel"
      aria-label="Player radio"
      data-playback-status={status}
    >
      <audio
        ref={audio}
        preload="none"
        aria-label={radio ? `Ascolta ${radio.name}` : "Audio radio"}
        onPlaying={() => {
          if (audio.current?.paused || !wantsPlay.current) return;
          setStatus("playing");
          wantsPlay.current = true;
          setActive(true);
        }}
        onPause={() => {
          if (
            wantsPlay.current &&
            (status === "loading" ||
              status === "buffering" ||
              !streamReady.current ||
              !audio.current?.paused)
          )
            return;
          if (!audio.current?.getAttribute("src") && !engineRef.current) return;
          wantsPlay.current = false;
          setActive(false);
          setStatus((s) => (s === "error" ? s : "paused"));
        }}
        onWaiting={waiting}
        onStalled={() => {
          if (audio.current!.readyState < 3) waiting();
        }}
        onEnded={() => {
          if (wantsPlay.current) fail();
        }}
        onError={() => {
          if (audio.current?.getAttribute("src")) {
            fail();
          }
        }}
      />
      <div className="player-artwork">
        <div className="player-logo">
          {radio ? (
            <RadioLogo radio={radio} />
          ) : (
            <Icon name="radio" size={72} />
          )}
        </div>
      </div>
      <div className="player-heading">
        <h1>{radio?.name ?? "La tua prossima radio"}</h1>
        <p>
          {radio
            ? /deejay/i.test(radio.name)
              ? "One Nation One Station"
              : radio.genre.split(",").slice(0, 2).join(" · ") ||
                "Radio in diretta"
            : "Scegli una stazione e premi play"}
        </p>
      </div>
      <div className="player-details">
        <div className="player-actions">
          <button
            className={`round-button ${favorite ? "is-favorite" : ""}`}
            aria-label={
              favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"
            }
            aria-pressed={favorite}
            onClick={onFavorite}
            disabled={!radio}
          >
            <Icon name="heart" size={24} filled={favorite} />
          </button>
          <button
            className="round-button"
            aria-label="Condividi radio"
            onClick={share}
            disabled={!radio}
          >
            <Icon name="share" size={23} />
          </button>
        </div>
      </div>
      {shared && (
        <p className="share-notice" role="status">
          {shared}
        </p>
      )}
      <div
        className={`live-wave ${playing ? "wave-playing" : ""}`}
        aria-hidden="true"
      >
        {Array.from({ length: 60 }, (_, i) => (
          <i
            key={i}
            style={{
              height: `${12 + ((i * 13 + i * i * 7) % 31)}px`,
              animationDelay: `${(i % 8) * 0.1}s`,
            }}
          />
        ))}
      </div>
      <p
        className={`player-status ${status === "error" ? "error" : ""}`}
        aria-live="polite"
      >
        <i
          className={
            status === "loading" || status === "buffering"
              ? "buffering-dot"
              : playing
                ? "live-dot"
                : "idle-dot"
          }
        />
        {playbackLabels[status]}
      </p>
      <div className="transport">
        <button
          className="transport-step"
          aria-label="Radio precedente"
          onClick={onPrevious}
          disabled={!radio}
        >
          <Icon name="previous" size={25} />
        </button>
        <button
          className="player-play"
          aria-label={playbackActive ? "Metti in pausa" : "Riproduci radio"}
          disabled={!radio}
          onClick={togglePlayback}
        >
          <Icon name={playbackActive ? "pause" : "play"} size={30} />
        </button>
        <button
          className="transport-step"
          aria-label="Radio successiva"
          onClick={onNext}
          disabled={!radio}
        >
          <Icon name="next" size={25} />
        </button>
      </div>
      <VolumeControl {...volumeControls} />
    </section>
  );
}
