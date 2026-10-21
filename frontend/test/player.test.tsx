import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RadioAudio from "../src/RadioAudio";
import type { Radio } from "../src/types";

const radio: Radio = {
  id: "r1",
  name: "Rock FM",
  genre: "Rock",
  country: "Italia",
  logo: null,
  streamUrl: "https://stream.test/rock.mp3",
};
const callbacks = {
  onFavorite: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onStatus: vi.fn(),
};
function Player({
  station = radio,
  request = 0,
}: {
  station?: Radio | null;
  request?: number;
}) {
  const [active, setActive] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  return (
    <RadioAudio
      radio={station}
      request={request}
      favorite={false}
      {...callbacks}
      playbackActive={active}
      onPlaybackActive={setActive}
      volumeControls={{
        volume,
        muted,
        onVolume: setVolume,
        onMute: () => setMuted((value) => !value),
      }}
    />
  );
}
const audio = () =>
  screen.getByLabelText("Ascolta Rock FM") as HTMLAudioElement;

describe("Player radio", () => {
  it("disabilita il play finché non è selezionata una radio", () => {
    render(<Player station={null} />);
    expect(
      screen.getByRole("button", { name: "Riproduci radio" }),
    ).toBeDisabled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("avvia, distingue buffering e diretta, poi mette in pausa", async () => {
    const user = userEvent.setup();
    render(<Player />);
    await user.click(screen.getByRole("button", { name: "Riproduci radio" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Metti in pausa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connessione alla radio…")).toBeInTheDocument();
    fireEvent.playing(audio());
    expect(screen.getByText("In diretta")).toBeInTheDocument();
    fireEvent.waiting(audio());
    expect(screen.getByText("Buffering…")).toBeInTheDocument();
    fireEvent.playing(audio());
    await user.click(screen.getByRole("button", { name: "Metti in pausa" }));
    expect(audio().paused).toBe(true);
    expect(screen.getByText("In pausa")).toBeInTheDocument();
  });

  it("applica volume e muto al vero elemento audio", async () => {
    const user = userEvent.setup();
    render(<Player />);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.35" },
    });
    expect(audio().volume).toBe(0.35);
    await user.click(screen.getByRole("button", { name: "Disattiva audio" }));
    expect(audio().muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Riattiva audio" }));
    expect(audio().muted).toBe(false);
    expect(audio().volume).toBe(0.35);
  });

  it("cambia radio usando un solo audio, fermando lo stream precedente", () => {
    const { rerender } = render(<Player request={1} />);
    const element = audio();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    rerender(
      <Player
        station={{
          ...radio,
          id: "r2",
          name: "Jazz FM",
          streamUrl: "https://stream.test/jazz.mp3",
        }}
        request={2}
      />,
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByLabelText("Ascolta Jazz FM")).toBe(element);
    expect(document.querySelectorAll("audio")).toHaveLength(1);
    expect(element.src).toBe("https://stream.test/jazz.mp3");
  });

  it("il nuovo comando play/pausa non ricrea la sorgente dello stream", () => {
    const { rerender } = render(<Player request={1} />);
    vi.mocked(HTMLMediaElement.prototype.load).mockClear();
    rerender(<Player request={2} />);
    expect(screen.getByText("In pausa")).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
    rerender(<Player request={3} />);
    expect(
      screen.getByRole("button", { name: "Metti in pausa" }),
    ).toBeInTheDocument();
  });

  it("mostra un errore se lo stream fallisce e consente di riprovare", async () => {
    const user = userEvent.setup();
    render(<Player request={1} />);
    fireEvent.error(audio());
    expect(screen.getByText(/Stream non disponibile/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Riproduci radio" }));
    expect(screen.getByText("Connessione alla radio…")).toBeInTheDocument();
  });

  it("interrompe il buffering dopo 20 secondi senza audio", async () => {
    vi.useFakeTimers();
    render(<Player request={1} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByText(/Stream non disponibile/)).toBeInTheDocument();
    expect(audio().paused).toBe(true);
  });

  it("Spazio controlla l'ascolto ma non interferisce con i campi di testo", () => {
    render(
      <>
        <input aria-label="Ricerca" />
        <Player />
      </>,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Ricerca" }), {
      code: "Space",
    });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { code: "Space" });
    expect(
      screen.getByRole("button", { name: "Metti in pausa" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { code: "Space" });
    expect(screen.getByText("In pausa")).toBeInTheDocument();
  });
});
