import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

const mobileQuery =
  "(max-width: 760px), (max-width: 1000px) and (max-height: 520px)";

export default function useMobilePlayer() {
  const [isMobile, setIsMobile] = useState(
    () => matchMedia(mobileQuery).matches,
  );
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ y: number; x: number; time: number } | null>(null);
  const finishClose = () => {
    setOpen(false);
    setClosing(false);
    setDrag(null);
    gesture.current = null;
  };
  const close = useCallback(() => {
    if (!open) return;
    setClosing(true);
    setDrag(null);
    gesture.current = null;
  }, [open]);
  useEffect(() => {
    if (!closing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    const timer = setTimeout(finishClose, 450);
    return () => clearTimeout(timer);
  }, [closing]);
  function show() {
    setClosing(false);
    const mini = trigger.current
      ?.closest(".mobile-now-playing")
      ?.getBoundingClientRect();
    if (mini && sheet.current) {
      const style = sheet.current.style;
      style.setProperty(
        "--player-start-y",
        `${mini.y + mini.height / 2 - innerHeight / 2}px`,
      );
      style.setProperty(
        "--player-start-x",
        `${mini.x + mini.width / 2 - innerWidth / 2}px`,
      );
      style.setProperty("--player-scale-x", `${mini.width / innerWidth}`);
      style.setProperty("--player-scale-y", `${mini.height / innerHeight}`);
      sheet.current.getBoundingClientRect(); // Fissa il rettangolo iniziale prima dell'espansione.
    }
    setOpen(true);
  }

  useEffect(() => {
    const media = matchMedia(mobileQuery);
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) finishClose();
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !isMobile) return;
    const returnFocus = trigger.current;
    sheet.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function keyboard(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("dialog")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const buttons = sheet.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
      );
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (matchMedia(mobileQuery).matches) returnFocus?.focus();
    };
  }, [open, isMobile, close]);

  const pointerProps = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (
        !isMobile ||
        !open ||
        closing ||
        !event.isPrimary ||
        event.button !== 0 ||
        (event.target as HTMLElement).closest("button, input, a")
      )
        return;
      gesture.current = {
        y: event.clientY,
        x: event.clientX,
        time: performance.now(),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (!gesture.current) return;
      const distance = event.clientY - gesture.current.y;
      if (Math.abs(event.clientX - gesture.current.x) < Math.abs(distance))
        setDrag(Math.max(0, distance));
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (!gesture.current) return;
      const distance = event.clientY - gesture.current.y;
      const elapsed = performance.now() - gesture.current.time;
      const vertical = distance > Math.abs(event.clientX - gesture.current.x);
      if (vertical && (distance > 100 || (distance > 40 && elapsed < 250)))
        close();
      gesture.current = null;
      setDrag(null);
    },
    onPointerCancel() {
      gesture.current = null;
      setDrag(null);
    },
  };
  return {
    isMobile,
    open,
    closing,
    show,
    close,
    sheet,
    trigger,
    drag,
    pointerProps,
  };
}
