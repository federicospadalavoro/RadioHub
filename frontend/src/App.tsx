import { useEffect, useState, type FormEvent } from "react";
import RadioAudio from "./RadioAudio";
import {
  authenticatedFetch,
  endSession,
  renewSession,
  saveSession,
} from "./session";

type Radio = {
  id: string;
  name: string;
  logo: string | null;
  genre: string;
  country: string;
  streamUrl: string;
};

type Post = {
  id: string;
  title: string;
  publishedAt: string | null;
  summary: string | null;
};

type Favorite = {
  radioId: string;
  radioName: string;
  logoUrl: string | null;
  streamUrl: string | null;
};

export default function App() {
  const [userEmail, setUserEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [page, setPage] = useState<"home" | "favorites">("home");
  const [query, setQuery] = useState("");
  const [radioLimit, setRadioLimit] = useState(10);
  const [radios, setRadios] = useState<Radio[]>([]);
  const [loading, setLoading] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postCount, setPostCount] = useState(10);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [postsVersion, setPostsVersion] = useState(0);
  const [newsNotice, setNewsNotice] = useState("");
  const [openSummaries, setOpenSummaries] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    sources: { id: string; title: string; publishedAt: string | null }[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [questionError, setQuestionError] = useState("");

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
    events.onopen = () => setPostsVersion((version) => version + 1);
    events.addEventListener("news", (event) => {
      setNewsNotice(`Nuove notizie: ${JSON.parse(event.data).inserted}`);
      setPostsVersion((version) => version + 1);
    });
    return () => events.close();
  }, []);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
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
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Errore di rete");
    }
  }

  async function logout() {
    try {
      await endSession();
      setUserEmail("");
      setFavorites([]);
      setPage("home");
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
          setPage("home");
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
        setPage("home");
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
    } catch (err) {
      setFavoriteError(err instanceof Error ? err.message : "Errore di rete");
    }
  }

  async function searchWithAi() {
    setInterpreting(true);
    setError("");
    try {
      const response = await fetch("/api/radios/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Ricerca AI non riuscita");
      setQuery(data.query);
      setRadioLimit(data.limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setInterpreting(false);
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
          query,
          limit: String(radioLimit),
        });
        const response = await fetch(`/api/radios?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Errore nella ricerca");
        setRadios(
          data.sort((a: Radio, b: Radio) => a.name.localeCompare(b.name)),
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
  }, [query, radioLimit]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPostsLoading(true);
      setPostsError("");
      try {
        const params = new URLSearchParams({ title, items: String(postCount) });
        const response = await fetch(`/api/posts?${params}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Errore nel caricamento delle notizie");
        setPosts(data);
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
  }, [title, postCount, postsVersion]);

  return (
    <main>
      <h1>RadioHub</h1>
      <section>
        <h2>Account</h2>
        {userEmail ? (
          <p>
            Accesso: {userEmail} <button onClick={logout}>Esci</button>
          </p>
        ) : (
          <form onSubmit={authenticate}>
            <h3>{authMode === "login" ? "Accedi" : "Registrati"}</h3>
            <label htmlFor="email">Email</label>{" "}
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />{" "}
            <label htmlFor="password">Password</label>{" "}
            <input
              id="password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />{" "}
            <button type="submit" disabled={!sessionReady}>
              {authMode === "login" ? "Accedi" : "Crea account"}
            </button>{" "}
            <button
              type="button"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login"
                ? "Vai alla registrazione"
                : "Vai all'accesso"}
            </button>
          </form>
        )}
        {authError && <p role="alert">{authError}</p>}
      </section>
      <nav>
        <button onClick={() => setPage("home")}>Radio e notizie</button>{" "}
        <button disabled={!userEmail} onClick={() => setPage("favorites")}>
          Preferiti
        </button>
      </nav>
      {favoriteError && <p role="alert">{favoriteError}</p>}
      {page === "favorites" ? (
        <section>
          <h2>Le mie radio preferite</h2>
          {favorites.length === 0 && <p>Nessuna radio preferita.</p>}
          <ul>
            {favorites.map((favorite) => (
              <li key={favorite.radioId} data-favorite-id={favorite.radioId}>
                {favorite.logoUrl && (
                  <img src={favorite.logoUrl} alt="" width="40" />
                )}{" "}
                {favorite.radioName}{" "}
                {favorite.streamUrl && (
                  <RadioAudio
                    src={favorite.streamUrl}
                    name={favorite.radioName}
                  />
                )}{" "}
                <button
                  onClick={() =>
                    toggleFavorite({
                      id: favorite.radioId,
                      name: favorite.radioName,
                      logo: favorite.logoUrl,
                      streamUrl: favorite.streamUrl ?? "",
                      genre: "",
                      country: "",
                    })
                  }
                >
                  Rimuovi
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <label htmlFor="search">Cerca una radio</label>{" "}
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Es. una radio rock italiana"
          />
          <button
            onClick={searchWithAi}
            disabled={!query.trim() || interpreting}
          >
            {interpreting ? "Interpreto…" : "Cerca con AI"}
          </button>
          {loading && <p>Ricerca…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && query.trim() && !error && radios.length === 0 && (
            <p>Nessuna radio trovata.</p>
          )}
          <ul>
            {radios.map((radio) => (
              <li key={radio.id} data-radio-id={radio.id}>
                {radio.logo && <img src={radio.logo} alt="" width="40" />}{" "}
                {radio.name} — {radio.country}, {radio.genre}{" "}
                <RadioAudio src={radio.streamUrl} name={radio.name} />
                {userEmail && (
                  <button onClick={() => toggleFavorite(radio)}>
                    {favorites.some((favorite) => favorite.radioId === radio.id)
                      ? "Rimuovi dai preferiti"
                      : "Aggiungi ai preferiti"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <section>
            <h2>Notizie</h2>
            {newsNotice && <p role="status">{newsNotice}</p>}
            <form onSubmit={askNews}>
              <label htmlFor="news-question">
                Fai una domanda sulle notizie
              </label>{" "}
              <input
                id="news-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />{" "}
              <button disabled={!question.trim() || asking}>
                {asking ? "Cerco…" : "Chiedi"}
              </button>
            </form>
            {questionError && <p role="alert">{questionError}</p>}
            {answer && (
              <>
                <p>{answer.answer}</p>
                <ul>
                  {answer.sources.map((source) => (
                    <li key={source.id}>{source.title}</li>
                  ))}
                </ul>
              </>
            )}
            <label htmlFor="news-search">Filtra per titolo</label>{" "}
            <input
              id="news-search"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setPostCount(10);
              }}
            />
            {postsLoading && <p>Caricamento…</p>}
            {postsError && <p role="alert">{postsError}</p>}
            {!postsLoading && !postsError && posts.length === 0 && (
              <p>Nessuna notizia trovata.</p>
            )}
            <ul>
              {posts.map((post) => (
                <li key={post.id}>
                  <h3>{post.title}</h3>
                  {post.publishedAt && (
                    <p>
                      {new Date(post.publishedAt).toLocaleDateString("it-IT")}
                    </p>
                  )}
                  <button
                    onClick={() =>
                      setOpenSummaries((open) =>
                        open.includes(post.id)
                          ? open.filter((id) => id !== post.id)
                          : [...open, post.id],
                      )
                    }
                  >
                    {openSummaries.includes(post.id)
                      ? "Nascondi riassunto"
                      : "Riassumi"}
                  </button>
                  {openSummaries.includes(post.id) && (
                    <p>{post.summary || "Riassunto non disponibile."}</p>
                  )}
                </li>
              ))}
            </ul>
            {posts.length === postCount && postCount < 50 && (
              <button
                onClick={() =>
                  setPostCount((count) => Math.min(count + 10, 50))
                }
              >
                Carica altre
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
