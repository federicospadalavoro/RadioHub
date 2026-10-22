import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import RadioAudio from "./RadioAudio";
import { useAppDispatch, useAppSelector } from "./hooks";
import {
  loadRadio,
  playRadio as startRadio,
  setVolume,
  toggleMute,
  toggleRequested,
} from "./store";
import Icon from "./Icon";
import { iconAssets } from "./icon-assets";
import RadioLogo from "./RadioLogo";
import type { Radio, RadioCatalog } from "./types";
import { decodeText } from "./text";
import "./style.css";
import useTheme from "./useTheme";
import useMobilePlayer from "./useMobilePlayer";
import VolumeControl from "./VolumeControl";
import { playbackLabels } from "./playback";
import newsFallback from "./news-placeholder.svg";
import {
  authenticatedFetch,
  endSession,
  renewSession,
  saveSession,
} from "./session";

type Post = {
  id: string;
  title: string;
  publishedAt: string | null;
  summary: string | null;
  imageUrl?: string | null;
  excerpt?: string | null;
  content?: string;
};

type Favorite = {
  radioId: string;
  radioName: string;
  logoUrl: string | null;
  streamUrl: string | null;
};

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const dispatch = useAppDispatch();
  const {
    radio: activeRadio,
    status: playbackStatus,
    active: playbackActive,
    volume,
    muted,
  } = useAppSelector((state) => state.player);
  const player = useMobilePlayer();
  const playerOpen = player.isMobile && player.open;
  const [mobileView, setMobileView] = useState<"radios" | "news">("radios");
  const [libraryView, setLibraryView] = useState<"radios" | "favorites">(
    "radios",
  );
  const [separateFavorites, setSeparateFavorites] = useState(
    () => localStorage.getItem("radiohub-separate-favorites") === "true",
  );
  const activeMobileView =
    mobileView === "radios" && separateFavorites ? libraryView : mobileView;
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [startupPhase, setStartupPhase] = useState<
    "loading" | "moving" | "done"
  >("loading");
  const [startupTarget, setStartupTarget] = useState<CSSProperties>();
  const brand = useRef<HTMLButtonElement>(null);
  const startupStarted = useRef(performance.now());
  const [authOpen, setAuthOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [catalog, setCatalog] = useState<RadioCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [sharedRadio, setSharedRadio] = useState<Radio | null>(null);
  const [sharedRadioToPlay, setSharedRadioToPlay] = useState<Radio | null>(
    null,
  );
  const isPlaying = playbackStatus === "playing";
  function toggleSeparateFavorites() {
    const enabled = !separateFavorites;
    localStorage.setItem("radiohub-separate-favorites", String(enabled));
    setSeparateFavorites(enabled);
  }
  const volumeControls = {
    volume,
    muted,
    onVolume: (value: number) => dispatch(setVolume(value)),
    onMute: () => dispatch(toggleMute()),
  };
  const stationList = useRef<HTMLDivElement>(null);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [newsMode, setNewsMode] = useState<"search" | "ai">("search");

  const [userEmail, setUserEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [query, setQuery] = useState("");
  const [radioLimit, setRadioLimit] = useState(10);
  const [radios, setRadios] = useState<Radio[]>([]);
  const [loading, setLoading] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [radioAi, setRadioAi] = useState<{
    query: string;
    category: number | null;
    country: string;
  } | null>(null);
  const radioAiRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postPage, setPostPage] = useState(0);
  const [postsTotal, setPostsTotal] = useState<number | null>(null);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [postsVersion, setPostsVersion] = useState(0);
  const [newsNotice, setNewsNotice] = useState("");
  const [openSummaries, setOpenSummaries] = useState<string[]>([]);
  const [summaryLoading, setSummaryLoading] = useState<string[]>([]);
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>(
    {},
  );
  const [openArticles, setOpenArticles] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    sources: { id: string; title: string; publishedAt: string | null }[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [questionError, setQuestionError] = useState("");

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      const menu = accountMenu.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("click", dismiss, true);
    return () => document.removeEventListener("click", dismiss, true);
  }, []);

  useEffect(() => {
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    function revealScrollbar(event: Event) {
      const element = event.target;
      if (
        !(element instanceof HTMLElement) ||
        !element.matches(".station-list, .news-list, .answer, .auth-dialog")
      )
        return;
      element.classList.add("is-scrolling");
      clearTimeout(timers.get(element));
      timers.set(
        element,
        setTimeout(() => {
          element.classList.remove("is-scrolling");
          timers.delete(element);
        }, 900),
      );
    }
    document.addEventListener("scroll", revealScrollbar, true);
    return () => {
      document.removeEventListener("scroll", revealScrollbar, true);
      timers.forEach((timer, element) => {
        clearTimeout(timer);
        element.classList.remove("is-scrolling");
      });
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/radios/popular", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Catalogo non disponibile. Prova la ricerca.");
        const data: RadioCatalog = await response.json();
        if (controller.signal.aborted) return;
        setCatalog(data);
        dispatch(
          loadRadio(
            data.radios.find((r) => /deejay/i.test(r.name)) ??
              data.radios[0] ??
              null,
          ),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error.message);
      });
    return () => controller.abort();
  }, [dispatch]);

  useEffect(() => {
    if (
      startupPhase !== "loading" ||
      (!catalog && !catalogError) ||
      postsLoading ||
      !sessionReady
    )
      return;
    let active = true;
    const preload = (src: string) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        const finish = () => {
          clearTimeout(timer);
          resolve();
        };
        image.onload = finish;
        image.onerror = finish;
        const timer = setTimeout(finish, 3500);
        image.src = src;
        if (image.complete) finish();
      });
    const images = [
      ...iconAssets,
      ...(catalog?.radios.slice(0, 10).map((radio) => radio.logo) ?? []),
      ...posts.slice(0, 5).map((post) => post.imageUrl ?? newsFallback),
    ];
    void Promise.all(
      [...new Set(images.filter((src): src is string => Boolean(src)))].map(
        preload,
      ),
    ).then(() => {
      if (!active) return;
      const rect = brand.current?.getBoundingClientRect();
      if (!rect || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setStartupPhase("done");
        return;
      }
      const style = getComputedStyle(brand.current!);
      setStartupTarget({
        "--startup-left": `${rect.left + rect.width / 2}px`,
        "--startup-top": `${rect.top + rect.height / 2}px`,
        "--startup-size": style.fontSize,
      } as CSSProperties);
      setTimeout(
        () => {
          if (active) setStartupPhase("moving");
        },
        Math.max(0, 350 - (performance.now() - startupStarted.current)),
      );
    });
    return () => {
      active = false;
    };
  }, [catalog, catalogError, posts, postsLoading, sessionReady, startupPhase]);

  useEffect(() => {
    if (!catalog) return;
    let controller: AbortController | undefined;
    async function openSharedRadio() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const id = new URLSearchParams(location.hash.slice(1)).get("radio");
      if (!id) return;
      setError("");
      try {
        let radio = catalog!.radios.find((item) => item.id === id);
        if (!radio) {
          const response = await fetch(
            `/api/radios/${encodeURIComponent(id)}`,
            { signal },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Radio non disponibile");
          radio = data as Radio;
        }
        if (signal.aborted) return;
        setSharedRadio(radio);
        dispatch(loadRadio(radio));
        setSharedRadioToPlay(radio);
      } catch (err) {
        if (!signal.aborted)
          setError(
            err instanceof Error ? err.message : "Radio non disponibile",
          );
      }
    }
    void openSharedRadio();
    window.addEventListener("hashchange", openSharedRadio);
    return () => {
      controller?.abort();
      window.removeEventListener("hashchange", openSharedRadio);
    };
  }, [catalog, dispatch]);

  useEffect(() => {
    if (startupPhase !== "done" || !sharedRadioToPlay) return;
    dispatch(startRadio(sharedRadioToPlay));
    setSharedRadioToPlay(null);
  }, [dispatch, sharedRadioToPlay, startupPhase]);

  useEffect(() => {
    let active = true;
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    renewSession()
      .then((session) => {
        if (active && session) setUserEmail(session.user.email);
      })
      .catch(() => {
        if (active) setAuthError("Impossibile recuperare la sessione");
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const events = new EventSource("/api/posts/events");
    const refresh = () => {
      setPostPage(0);
      setPostsVersion((version) => version + 1);
    };
    events.onopen = refresh;
    events.addEventListener("news", (event) => {
      setNewsNotice(`Nuove notizie: ${JSON.parse(event.data).inserted}`);
      refresh();
    });
    return () => events.close();
  }, []);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const response = await fetch(
        `/api/auth/${authMode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Accesso non riuscito");
      saveSession(data);
      setUserEmail(data.user.email);
      setPassword("");
      setAuthOpen(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      await endSession();
      setUserEmail("");
      setFavorites([]);
      setAuthError("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Errore di rete");
    }
  }

  useEffect(() => {
    if (!userEmail) {
      setFavorites([]);
      return;
    }
    const controller = new AbortController();
    authenticatedFetch("/api/favorites", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setUserEmail("");
        }
        if (!response.ok) throw new Error("Impossibile caricare i preferiti");
        setFavorites(await response.json());
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setFavoriteError(
            err instanceof Error ? err.message : "Errore di rete",
          );
      });
    return () => controller.abort();
  }, [userEmail]);

  async function toggleFavorite(radio: Radio) {
    if (!userEmail) {
      setAuthOpen(true);
      return;
    }
    const favorite = favorites.some((item) => item.radioId === radio.id);
    try {
      const response = await authenticatedFetch(
        favorite
          ? `/api/favorites/${encodeURIComponent(radio.id)}`
          : "/api/favorites",
        {
          method: favorite ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          ...(!favorite && {
            body: JSON.stringify({
              radioId: radio.id,
              radioName: radio.name,
              streamUrl: radio.streamUrl,
              logoUrl: radio.logo,
            }),
          }),
        },
      );
      if (response.status === 401) {
        setUserEmail("");
      }
      if (!response.ok) throw new Error("Impossibile aggiornare i preferiti");
      setFavorites((items) =>
        favorite
          ? items.filter((item) => item.radioId !== radio.id)
          : [
              ...items,
              {
                radioId: radio.id,
                radioName: radio.name,
                logoUrl: radio.logo,
                streamUrl: radio.streamUrl,
              },
            ],
      );
      setFavoriteError("");
      if (!favorite)
        requestAnimationFrame(() => stationList.current?.scrollTo({ top: 0 }));
    } catch (err) {
      setFavoriteError(err instanceof Error ? err.message : "Errore di rete");
    }
  }

  function changeRadioQuery(value: string) {
    radioAiRequest.current?.abort();
    setInterpreting(false);
    setRadioAi(null);
    setQuery(value);
  }

  useEffect(() => () => radioAiRequest.current?.abort(), []);

  async function searchWithAi() {
    radioAiRequest.current?.abort();
    const controller = new AbortController();
    radioAiRequest.current = controller;
    setInterpreting(true);
    setError("");
    setMobileView("radios");
    setNewsExpanded(false);
    try {
      const response = await fetch("/api/radios/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Ricerca AI non riuscita");
      if (controller.signal.aborted) return;
      setRadioAi({
        query: data.query,
        category: data.category,
        country: data.country,
      });
      setRadioLimit(data.limit);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      if (!controller.signal.aborted) setInterpreting(false);
    }
  }

  async function toggleSummary(id: string) {
    if (openSummaries.includes(id)) {
      setOpenSummaries((open) => open.filter((postId) => postId !== id));
      return;
    }
    setSummaryLoading((loading) => [...loading, id]);
    setSummaryErrors((errors) => ({ ...errors, [id]: "" }));
    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(id)}/summary`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Riassunto non disponibile");
      setPosts((posts) =>
        posts.map((post) =>
          post.id === id ? { ...post, summary: data.summary } : post,
        ),
      );
      setOpenSummaries((open) => [...new Set([...open, id])]);
    } catch (error) {
      setSummaryErrors((errors) => ({
        ...errors,
        [id]: error instanceof Error ? error.message : "Errore di rete",
      }));
    } finally {
      setSummaryLoading((loading) => loading.filter((postId) => postId !== id));
    }
  }

  async function askNews(event: FormEvent) {
    event.preventDefault();
    setAsking(true);
    setQuestionError("");
    try {
      const response = await fetch("/api/news/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Domanda non riuscita");
      setAnswer(data);
    } catch (err) {
      setQuestionError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setAsking(false);
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      setRadios([]);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          query: radioAi?.query ?? query,
          limit: String(radioLimit),
        });
        if (radioAi?.category != null)
          params.set("category", String(radioAi.category));
        if (radioAi?.country) params.set("country", radioAi.country);
        const response = await fetch(`/api/radios?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Errore nella ricerca");
        if (controller.signal.aborted) return;
        setRadios(
          data.sort(
            (a: Radio, b: Radio) =>
              Number(/^(italy|italia|it)$/i.test(b.country.trim())) -
                Number(/^(italy|italia|it)$/i.test(a.country.trim())) ||
              a.name.localeCompare(b.name, "it"),
          ),
        );
      } catch (err) {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Errore di rete");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, radioLimit, radioAi]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPostsLoading(true);
      setPostsError("");
      try {
        const params = new URLSearchParams({
          title,
          items: "10",
          skip: String(postPage * 10),
        });
        const response = await fetch(`/api/posts?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Errore nel caricamento delle notizie");
        if (controller.signal.aborted) return;
        setPostsTotal(
          Number(response.headers.get("X-Total-Count") ?? data.length),
        );
        setPosts((posts) =>
          postPage === 0
            ? data
            : [
                ...new Map(
                  [...posts, ...data].map((post: Post) => [post.id, post]),
                ).values(),
              ],
        );
      } catch (err) {
        if (!controller.signal.aborted)
          setPostsError(err instanceof Error ? err.message : "Errore di rete");
      } finally {
        if (!controller.signal.aborted) setPostsLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title, postPage, postsVersion]);

  const isFavorite = (id?: string) => favorites.some((f) => f.radioId === id);
  const favoriteRadios: Radio[] = favorites.map((f) => {
    const radio =
      catalog?.radios.find((r) => r.id === f.radioId) ??
      radios.find((r) => r.id === f.radioId);
    return {
      ...radio,
      id: f.radioId,
      name: f.radioName,
      logo: f.logoUrl,
      streamUrl: f.streamUrl ?? "",
      genre: radio?.genre ?? "",
      country: radio?.country ?? "",
    };
  });
  const initialRadios =
    sharedRadio && !catalog?.radios.some((r) => r.id === sharedRadio.id)
      ? [sharedRadio, ...(catalog?.radios ?? [])]
      : (catalog?.radios ?? []);
  const results = (query.trim() ? radios : initialRadios).filter((r) =>
    separateFavorites ? !isFavorite(r.id) : query.trim() || !isFavorite(r.id),
  );
  const visibleFavorites =
    separateFavorites || query.trim() ? [] : favoriteRadios;
  const visibleRadios = [...visibleFavorites, ...results];
  const displayedRadios =
    libraryView === "favorites" && separateFavorites
      ? favoriteRadios
      : visibleRadios;
  function playRadio(radio: Radio) {
    if (!radio.streamUrl) {
      setError("Stream non disponibile per questa radio.");
      return;
    }
    if (radio.id === activeRadio?.id && playbackActive) return;
    dispatch(startRadio(radio));
  }
  function changeRadio(direction: number) {
    const radiosToPlay =
      libraryView === "favorites" ? favoriteRadios : visibleRadios;
    if (!radiosToPlay.length) return;
    const index = radiosToPlay.findIndex((r) => r.id === activeRadio?.id);
    playRadio(
      radiosToPlay[
        (index + direction + radiosToPlay.length) % radiosToPlay.length
      ],
    );
  }

  return (
    <Dialog.Root open={authOpen} onOpenChange={setAuthOpen}>
      <>
        {startupPhase !== "done" && (
          <div
            className={`startup-splash ${startupPhase}`}
            role="status"
            aria-label="Caricamento di RadioHub"
          >
            <span
              className="startup-brand"
              style={startupTarget}
              onTransitionEnd={() => setStartupPhase("done")}
            >
              RadioHub
            </span>
            {startupPhase === "loading" && (
              <span className="startup-caption">Preparo radio e notizie</span>
            )}
          </div>
        )}
        <div
          className={`app-shell mobile-view-${mobileView} ${playerOpen ? "mobile-player-open" : ""} ${startupPhase !== "done" ? "startup-hidden" : ""}`}
        >
          <a href="#main" className="skip-link">
            Vai al contenuto
          </a>
          <header className="topbar" inert={playerOpen}>
            <button
              ref={brand}
              className="brand"
              onClick={() => window.location.reload()}
            >
              RadioHub
            </button>
            <span className="brand-caption">
              Tutte le tue radio, sempre con te
            </span>
            <div className="radio-search-controls">
              <div className="search-bar" role="search">
                <Icon name="search" />
                <label htmlFor="search" className="sr-only">
                  Cerca una radio
                </label>
                <input
                  id="search"
                  value={query}
                  onChange={(e) => {
                    changeRadioQuery(e.target.value);
                    setLibraryView("radios");
                    setMobileView("radios");
                    setNewsExpanded(false);
                  }}
                  placeholder="Cerca una radio, un genere o una città…"
                  autoComplete="off"
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="Cancella ricerca"
                    onClick={() => changeRadioQuery("")}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
              <button
                className="ai-button"
                onClick={searchWithAi}
                disabled={!query.trim() || interpreting}
              >
                <Icon name="spark" size={18} />
                <span className="ai-label-full">
                  {interpreting ? "Interpreto…" : "Cerca con AI"}
                </span>
                <span className="ai-label-short">
                  {interpreting ? "…" : "AI"}
                </span>
              </button>
            </div>
            <button
              className="theme-toggle icon-button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Attiva modalità chiara"
                  : "Attiva modalità scura"
              }
              title={theme === "dark" ? "Modalità chiara" : "Modalità scura"}
              aria-pressed={theme === "dark"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={21} />
            </button>
            <div className="account">
              {userEmail ? (
                <details ref={accountMenu}>
                  <summary>
                    <span className="avatar">{userEmail[0].toUpperCase()}</span>
                    <span>{userEmail.split("@")[0]}</span>
                    <Icon name="chevron" size={16} />
                  </summary>
                  <div className="account-popover">
                    <p className="account-email">{userEmail}</p>
                    <button
                      className="separate-favorites-toggle"
                      role="switch"
                      aria-checked={separateFavorites}
                      onClick={toggleSeparateFavorites}
                    >
                      <span>Sezione Preferite separata</span>
                      <span className="switch-track">
                        <span />
                      </span>
                    </button>
                    <button className="account-logout" onClick={logout}>
                      Esci dall’account
                    </button>
                  </div>
                </details>
              ) : (
                <Dialog.Trigger asChild>
                  <button className="account-button">
                    <Icon name="user" />
                    Accedi
                  </button>
                </Dialog.Trigger>
              )}
            </div>
          </header>
          {favoriteError && (
            <p className="notice error" role="alert">
              {favoriteError}
            </p>
          )}
          <main
            id="main"
            className={`workspace ${newsExpanded ? "news-expanded" : ""}`}
          >
            <section
              className="panel library-panel"
              aria-label={
                libraryView === "favorites" ? "Radio preferite" : "Elenco radio"
              }
              inert={
                (player.isMobile ? mobileView !== "radios" : newsExpanded) ||
                playerOpen
              }
            >
              <div
                className="library-heading"
                hidden={visibleFavorites.length > 0}
              >
                {(!separateFavorites || query.trim() || player.isMobile) && (
                  <h2 className="list-heading">
                    {separateFavorites && libraryView === "favorites"
                      ? "Preferite"
                      : query.trim()
                        ? radioAi
                          ? "Risultati AI"
                          : "Risultati"
                        : "Le tue radio"}
                  </h2>
                )}
                {separateFavorites && !query.trim() && !player.isMobile && (
                  <div
                    className="library-switch"
                    role="group"
                    aria-label="Mostra radio preferite o tutte"
                  >
                    <button
                      className={libraryView === "favorites" ? "active" : ""}
                      aria-pressed={libraryView === "favorites"}
                      onClick={() => setLibraryView("favorites")}
                    >
                      Preferite
                    </button>
                    <button
                      className={libraryView === "radios" ? "active" : ""}
                      aria-pressed={libraryView === "radios"}
                      onClick={() => setLibraryView("radios")}
                    >
                      Altre radio
                    </button>
                  </div>
                )}
              </div>
              <div
                className="station-list"
                ref={stationList}
                aria-busy={loading || interpreting}
              >
                {(error || (!query && catalogError)) && (
                  <p className="notice error" role="alert">
                    {error || catalogError}
                  </p>
                )}
                {loading &&
                libraryView === "radios" &&
                !favoriteRadios.length ? (
                  <div
                    className="skeleton-list"
                    aria-label="Ricerca radio in corso"
                  >
                    {Array.from({ length: 7 }, (_, i) => (
                      <div className="station-skeleton" key={i} />
                    ))}
                  </div>
                ) : (
                  displayedRadios.map((radio, index) => {
                    const subtitle = [
                      radio.genre.split(",")[0],
                      radio.area ||
                        (radio.country === "Italy" ? "Italia" : radio.country),
                    ]
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <Fragment key={`${radio.rank ?? "radio"}-${radio.id}`}>
                        {visibleFavorites.length > 0 &&
                          (index === 0 ||
                            index === visibleFavorites.length) && (
                            <h2 className="list-heading">
                              {index === 0 ? "Preferite" : "Le tue radio"}
                            </h2>
                          )}
                        <article
                          className={`station-row ${isFavorite(radio.id) ? "station-pinned" : ""} ${activeRadio?.id === radio.id ? "station-selected" : ""}`}
                          data-radio-id={radio.id}
                          {...(isFavorite(radio.id)
                            ? { "data-favorite-id": radio.id }
                            : {})}
                        >
                          <button
                            className="station-select"
                            aria-label={`Ascolta ${radio.name}`}
                            onClick={() => playRadio(radio)}
                          >
                            <span className="station-logo">
                              <RadioLogo radio={radio} />
                            </span>
                            <span className="station-info">
                              <strong>{radio.name}</strong>
                              {subtitle && <span>{subtitle}</span>}
                            </span>
                          </button>
                          {activeRadio?.id === radio.id && isPlaying && (
                            <span
                              className="station-wave"
                              role="img"
                              aria-label="In riproduzione"
                            >
                              <i />
                              <i />
                              <i />
                              <i />
                            </span>
                          )}
                          <button
                            className={`icon-button favorite-button ${isFavorite(radio.id) ? "is-favorite" : ""}`}
                            aria-label={
                              isFavorite(radio.id)
                                ? "Rimuovi dai preferiti"
                                : "Aggiungi ai preferiti"
                            }
                            aria-pressed={isFavorite(radio.id)}
                            onClick={() => toggleFavorite(radio)}
                          >
                            <Icon
                              name="heart"
                              size={23}
                              filled={isFavorite(radio.id)}
                            />
                          </button>
                        </article>
                      </Fragment>
                    );
                  })
                )}
                {!loading && !displayedRadios.length && (
                  <p className="empty-state">
                    {libraryView === "favorites"
                      ? userEmail
                        ? "Non hai ancora radio preferite."
                        : "Accedi per vedere i tuoi preferiti."
                      : "Nessuna radio trovata. Prova un altro nome."}
                  </p>
                )}
              </div>
            </section>
            <div
              id="radio-player"
              ref={player.sheet}
              className={`player-slot ${player.drag !== null ? "is-dragging" : ""} ${player.closing ? "is-closing" : ""}`}
              inert={player.isMobile ? !player.open : newsExpanded}
              role={player.isMobile ? "dialog" : undefined}
              aria-modal={playerOpen || undefined}
              aria-label={player.isMobile ? "Player radio" : undefined}
              style={
                { "--player-drag": `${player.drag ?? 0}px` } as CSSProperties
              }
              {...player.pointerProps}
            >
              <div className="mobile-player-heading">
                <button
                  className="icon-button"
                  aria-label="Riduci il player"
                  onClick={player.close}
                >
                  <Icon name="chevron" size={28} />
                </button>
                <span>In ascolto</span>
              </div>
              <RadioAudio
                radio={activeRadio}
                favorite={isFavorite(activeRadio?.id)}
                onFavorite={() =>
                  activeRadio && void toggleFavorite(activeRadio)
                }
                onPrevious={() => changeRadio(-1)}
                onNext={() => changeRadio(1)}
              />
            </div>
            <section
              className="panel news-panel"
              aria-labelledby="news-heading"
              inert={playerOpen}
            >
              <div className="panel-heading">
                <h2 id="news-heading">Dal giornale</h2>
                <button
                  className="text-button news-expand"
                  aria-expanded={newsExpanded}
                  aria-controls="news-content"
                  onClick={() => {
                    if (newsExpanded) {
                      setTitle("");
                      setPostPage(0);
                      setMobileView("radios");
                    }
                    setNewsExpanded((v) => !v);
                  }}
                >
                  {newsExpanded ? (
                    <>
                      <Icon name="close" size={17} /> Chiudi notizie
                    </>
                  ) : (
                    "Vedi tutte"
                  )}
                </button>
              </div>
              {newsNotice && (
                <p className="notice" role="status">
                  {newsNotice}
                </p>
              )}
              <div id="news-content" className="news-content">
                {newsExpanded && (
                  <div className="news-tools">
                    <div
                      className={`segmented-control ${newsMode === "ai" ? "mode-ai" : ""}`}
                      role="group"
                      aria-label="Modalità ricerca notizie"
                    >
                      <button
                        aria-pressed={newsMode === "search"}
                        className={newsMode === "search" ? "selected" : ""}
                        onClick={() => {
                          setNewsMode("search");
                          setQuestionError("");
                        }}
                      >
                        Cerca
                      </button>
                      <button
                        aria-pressed={newsMode === "ai"}
                        className={newsMode === "ai" ? "selected" : ""}
                        onClick={() => {
                          setNewsMode("ai");
                          setTitle("");
                          setPostPage(0);
                        }}
                      >
                        Chiedi all’AI
                      </button>
                    </div>
                    <form
                      className="news-search-form"
                      onSubmit={(event) => {
                        if (newsMode === "ai") void askNews(event);
                        else event.preventDefault();
                      }}
                    >
                      <div className="search-bar news-search-field">
                        <Icon name="search" size={20} />
                        <label htmlFor="news-search" className="sr-only">
                          {newsMode === "search"
                            ? "Filtra per titolo"
                            : "Fai una domanda sulle notizie"}
                        </label>
                        <input
                          id="news-search"
                          value={newsMode === "search" ? title : question}
                          onChange={(event) => {
                            if (newsMode === "search") {
                              setTitle(event.target.value);
                              setPostPage(0);
                            } else setQuestion(event.target.value);
                          }}
                          placeholder={
                            newsMode === "search"
                              ? "Cerca nel titolo delle notizie…"
                              : "Che cosa vuoi sapere sulle notizie?"
                          }
                          autoComplete="off"
                        />
                      </div>
                      {newsMode === "ai" && (
                        <button
                          className="ai-button"
                          disabled={!question.trim() || asking}
                        >
                          <Icon name="spark" size={18} />
                          {asking ? "Cerco…" : "Cerca con AI"}
                        </button>
                      )}
                    </form>
                    {newsMode === "ai" && questionError && (
                      <p className="error" role="alert">
                        {questionError}
                      </p>
                    )}
                    {newsMode === "ai" && answer && (
                      <div className="answer">
                        <button
                          className="icon-button answer-close"
                          aria-label="Chiudi risposta AI"
                          onClick={() => setAnswer(null)}
                        >
                          <Icon name="close" size={18} />
                        </button>
                        <p>{answer.answer}</p>
                        <ul>
                          {answer.sources.map((source) => (
                            <li key={source.id}>{decodeText(source.title)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="news-list" aria-busy={postsLoading}>
                  {postsLoading && !posts.length && (
                    <p className="notice">Caricamento delle notizie…</p>
                  )}
                  {postsError && (
                    <p className="notice error" role="alert">
                      {postsError}
                    </p>
                  )}
                  {posts.map((post) => (
                    <article
                      className={`news-card ${openArticles.includes(post.id) ? "news-card-expanded" : ""}`}
                      key={post.id}
                    >
                      <button
                        className="news-card-toggle"
                        aria-label={`${openArticles.includes(post.id) ? "Chiudi" : "Leggi"} la notizia: ${decodeText(post.title)}`}
                        aria-expanded={openArticles.includes(post.id)}
                        aria-controls={`article-${post.id}`}
                        onClick={() => {
                          setOpenArticles((open) =>
                            open.includes(post.id)
                              ? open.filter((id) => id !== post.id)
                              : [...open, post.id],
                          );
                          setOpenSummaries((open) =>
                            open.filter((id) => id !== post.id),
                          );
                        }}
                      />
                      {post.imageUrl ? (
                        <img
                          className="news-image"
                          src={post.imageUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = newsFallback;
                          }}
                        />
                      ) : (
                        <img
                          className="news-image"
                          src={newsFallback}
                          alt="Copertina non disponibile"
                          loading="lazy"
                        />
                      )}
                      <div className="news-copy">
                        <h3>{decodeText(post.title)}</h3>
                        {openArticles.includes(post.id) && (
                          <button
                            className="summary-button"
                            aria-pressed={openSummaries.includes(post.id)}
                            aria-controls={`article-${post.id}`}
                            disabled={summaryLoading.includes(post.id)}
                            aria-busy={summaryLoading.includes(post.id)}
                            onClick={() => toggleSummary(post.id)}
                          >
                            <Icon
                              name="document"
                              size={17}
                              filled={openSummaries.includes(post.id)}
                            />
                            {summaryLoading.includes(post.id)
                              ? "Caricamento…"
                              : openSummaries.includes(post.id)
                                ? "Testo completo"
                                : "Riassumi"}
                          </button>
                        )}
                      </div>
                      {openArticles.includes(post.id) && (
                        <div
                          id={`article-${post.id}`}
                          className="news-fulltext"
                        >
                          {summaryErrors[post.id] && (
                            <p className="error" role="alert">
                              {summaryErrors[post.id]}
                            </p>
                          )}
                          {decodeText(
                            openSummaries.includes(post.id)
                              ? post.summary || "Riassunto non disponibile."
                              : post.content ||
                                  post.excerpt ||
                                  "Testo non disponibile.",
                          )
                            .split(/\n{2,}/)
                            .map((paragraph, index) => (
                              <p key={index}>{paragraph}</p>
                            ))}
                        </div>
                      )}
                    </article>
                  ))}
                  {!postsLoading && !postsError && !posts.length && (
                    <p className="empty-state">Nessuna notizia trovata.</p>
                  )}
                  {postsTotal !== null && posts.length < postsTotal && (
                    <button
                      className="load-more"
                      disabled={postsLoading}
                      onClick={() => {
                        setPostPage(Math.floor(posts.length / 10));
                        setPostsVersion((version) => version + 1);
                      }}
                    >
                      Carica altre notizie <Icon name="arrow" size={16} />
                    </button>
                  )}
                </div>
              </div>
            </section>
          </main>
          <footer
            className={`mobile-dock ${newsExpanded ? "desktop-dock-visible" : ""}`}
            inert={playerOpen}
            aria-label="Controlli radio"
          >
            <div className="mobile-now-playing">
              <button
                className="mobile-current"
                ref={player.trigger}
                aria-label={
                  player.isMobile ? "Apri il player" : "Torna al player"
                }
                aria-expanded={player.isMobile ? playerOpen : undefined}
                aria-controls="radio-player"
                onClick={() =>
                  player.isMobile ? player.show() : setNewsExpanded(false)
                }
              >
                <span className="mobile-current-logo">
                  {activeRadio ? (
                    <RadioLogo radio={activeRadio} />
                  ) : (
                    <Icon name="radio" />
                  )}
                </span>
                <span>
                  <strong>{activeRadio?.name ?? "Scegli una radio"}</strong>
                  <span>
                    <i
                      className={
                        playbackStatus === "loading" ||
                        playbackStatus === "buffering"
                          ? "buffering-dot"
                          : isPlaying
                            ? "live-dot"
                            : "idle-dot"
                      }
                    />
                    <span>{playbackLabels[playbackStatus]}</span>
                  </span>
                </span>
              </button>
              <div className="mini-volume">
                <VolumeControl {...volumeControls} />
              </div>
              <button
                className="mobile-play"
                aria-label={
                  playbackActive ? "Metti in pausa" : "Riproduci radio"
                }
                disabled={!activeRadio}
                onClick={() => {
                  dispatch(toggleRequested());
                }}
              >
                <Icon name={playbackActive ? "pause" : "play"} size={20} />
              </button>
            </div>
            <nav
              className={separateFavorites ? "with-favorites" : ""}
              aria-label="Navigazione mobile"
            >
              {(
                [
                  ...(separateFavorites
                    ? [["favorites", "Preferite", "heart"] as const]
                    : []),
                  ["radios", "Radio", "radio"],
                  ["news", "Notizie", "news"],
                ] as const
              ).map(([view, label, icon]) => (
                <button
                  key={view}
                  className={activeMobileView === view ? "active" : ""}
                  aria-current={activeMobileView === view ? "page" : undefined}
                  onClick={() => {
                    if (view === "favorites") {
                      setMobileView("radios");
                      setLibraryView("favorites");
                      setNewsExpanded(false);
                      return;
                    }
                    setMobileView(view);
                    setNewsExpanded(view === "news");
                    if (view === "radios") {
                      setLibraryView("radios");
                      changeRadioQuery("");
                      setRadioLimit(10);
                      setError("");
                      stationList.current?.scrollTo({ top: 0 });
                    }
                  }}
                >
                  <Icon
                    name={icon}
                    size={23}
                    filled={activeMobileView === view}
                  />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </footer>
          <Dialog.Portal>
            <Dialog.Overlay className="auth-overlay" />
            <Dialog.Content className="auth-dialog">
              <Dialog.Close asChild>
                <button
                  className="icon-button dialog-close"
                  aria-label="Chiudi"
                >
                  <Icon name="close" />
                </button>
              </Dialog.Close>
              <span className="dialog-mark">
                <Icon name="radio" size={30} />
              </span>
              <Dialog.Title>
                {authMode === "login" ? "Bentornato." : "La tua radio, con te."}
              </Dialog.Title>
              <Dialog.Description>
                {authMode === "login"
                  ? "Accedi per ritrovare tutte le tue radio preferite."
                  : "Crea un account per salvare e ritrovare le tue radio preferite."}
              </Dialog.Description>
              <form onSubmit={authenticate}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="primary-button"
                  disabled={!sessionReady || authBusy}
                >
                  {authBusy
                    ? "Un momento…"
                    : authMode === "login"
                      ? "Accedi"
                      : "Crea account"}
                </button>
              </form>
              {authError && (
                <p className="error" role="alert">
                  {authError}
                </p>
              )}
              <button
                className="text-button auth-switch"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login"
                  ? "Non hai un account? Registrati"
                  : "Hai già un account? Accedi"}
              </button>
            </Dialog.Content>
          </Dialog.Portal>
        </div>
      </>
    </Dialog.Root>
  );
}
