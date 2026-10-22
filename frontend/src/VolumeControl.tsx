export type VolumeProps = {
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onMute: () => void;
};

import Icon from "./Icon";
const hardwareVolume =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function VolumeControl({
  volume,
  muted,
  onVolume,
  onMute,
}: VolumeProps) {
  return (
    <div className="volume-control">
      <button
        className="icon-button"
        onClick={onMute}
        aria-label={muted ? "Riattiva audio" : "Disattiva audio"}
        aria-pressed={muted}
      >
        <Icon name={muted || volume === 0 ? "mute" : "volume"} />
      </button>
      {hardwareVolume ? (
        <span className="volume-hint">Volume: tasti del dispositivo</span>
      ) : (
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          aria-label="Volume"
          aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      )}
    </div>
  );
}
