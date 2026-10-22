export type Session = { token: string; user: { id: string; email: string } };
let session: Session | null = null;
let renewal: Promise<Session | null> | undefined;
let ending = false;

export function saveSession(value: Session | null) {
  session = value;
}

export function renewSession() {
  if (ending) return Promise.resolve(null);
  renewal ??= fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  })
    .then(async (response) => {
      if (response.status === 401) return (session = null);
      if (!response.ok) throw new Error("Impossibile rinnovare la sessione");
      return (session = (await response.json()) as Session);
    })
    .finally(() => {
      renewal = undefined;
    });
  return renewal;
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  const send = () => {
    const headers = new Headers(options.headers);
    if (session) headers.set("Authorization", `Bearer ${session.token}`);
    return fetch(url, { ...options, headers });
  };
  const response = await send();
  return response.status === 401 && (await renewSession()) ? send() : response;
}

export async function endSession() {
  ending = true;
  try {
    await renewal?.catch(() => null);
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Impossibile terminare la sessione");
    session = null;
  } finally {
    ending = false;
  }
}
