import { FormEvent, useEffect, useState } from "react";

type FeedMode = "following" | "discover";

type FeedPost = {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  record?: {
    text?: string;
    createdAt?: string;
  };
  embed?: {
    images?: Array<{ thumb?: string; fullsize?: string; alt?: string }>;
    external?: { uri?: string; title?: string; description?: string; thumb?: string };
  };
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
};

type FeedItem = {
  post: FeedPost;
  reason?: {
    by?: { handle: string; displayName?: string };
  };
};

type FeedResponse = {
  feed?: FeedItem[];
};

type FollowsResponse = {
  follows?: Array<{ did: string; handle: string; displayName?: string }>;
};

type CaptureState = Record<string, "saving" | "saved" | "error">;
type CaptureMessage = Record<string, string>;

const apiBase = "https://public.api.bsky.app/xrpc";
const discoverFeedUri = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const storedHandle = localStorage.getItem("hermes-bluesky-handle");
const defaultHandle = storedHandle && storedHandle !== "bsky.app" ? storedHandle : "rswitz.bsky.social";
const defaultHermesApiBaseUrl = localStorage.getItem("hermes-api-base-url") || "http://127.0.0.1:3217";
const defaultHermesApiKey = localStorage.getItem("hermes-api-key") || "";

function formatDate(value?: string): string {
  if (!value) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function postUrl(post: FeedPost): string {
  const postId = post.uri.split("/").pop() || post.cid;
  return `https://bsky.app/profile/${post.author.handle}/post/${postId}`;
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "");
}

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}

function byNewestPost(left: FeedItem, right: FeedItem): number {
  const leftTime = Date.parse(left.post.record?.createdAt || "") || 0;
  const rightTime = Date.parse(right.post.record?.createdAt || "") || 0;
  return rightTime - leftTime;
}

async function fetchJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const response = await fetch(`${apiBase}/${path}?${params}`);

  if (!response.ok) {
    throw new Error(`Bluesky returned ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function fetchAuthorFeed(handle: string, limit = 5): Promise<FeedItem[]> {
  const payload = await fetchJson<FeedResponse>(
    "app.bsky.feed.getAuthorFeed",
    new URLSearchParams({ actor: handle, filter: "posts_no_replies", limit: String(limit) }),
  );

  return payload.feed || [];
}

async function fetchFollowingFeed(handle: string): Promise<FeedItem[]> {
  const followsPayload = await fetchJson<FollowsResponse>(
    "app.bsky.graph.getFollows",
    new URLSearchParams({ actor: handle, limit: "28" }),
  );
  const follows = followsPayload.follows || [];

  if (!follows.length) {
    return [];
  }

  const batches = await Promise.allSettled(follows.map((follow) => fetchAuthorFeed(follow.handle, 4)));
  const posts = batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []));
  const uniquePosts = new Map(posts.map((item) => [item.post.uri, item]));

  return Array.from(uniquePosts.values()).sort(byNewestPost).slice(0, 60);
}

async function fetchDiscoverFeed(): Promise<FeedItem[]> {
  const payload = await fetchJson<FeedResponse>(
    "app.bsky.feed.getFeed",
    new URLSearchParams({ feed: discoverFeedUri, limit: "60" }),
  );

  return payload.feed || [];
}

function HermesIcon() {
  return (
    <span className="hermes-icon" aria-hidden="true">
      <span>H</span>
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
        <path d="M6 20h12" />
      </svg>
    </span>
  );
}

function App() {
  const [handle, setHandle] = useState(defaultHandle);
  const [activeHandle, setActiveHandle] = useState(defaultHandle);
  const [feedMode, setFeedMode] = useState<FeedMode>("following");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [hermesApiBaseUrl, setHermesApiBaseUrl] = useState(defaultHermesApiBaseUrl);
  const [hermesApiKey, setHermesApiKey] = useState(defaultHermesApiKey);
  const [captureState, setCaptureState] = useState<CaptureState>({});
  const [captureMessage, setCaptureMessage] = useState<CaptureMessage>({});

  useEffect(() => {
    let ignore = false;

    async function loadFeed() {
      setIsLoading(true);
      setError("");

      try {
        const items = feedMode === "following" ? await fetchFollowingFeed(activeHandle) : await fetchDiscoverFeed();
        if (!ignore) {
          setFeed(items);
          localStorage.setItem("hermes-bluesky-handle", activeHandle);
        }
      } catch (caught) {
        if (!ignore) {
          setFeed([]);
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadFeed();
    return () => {
      ignore = true;
    };
  }, [activeHandle, feedMode, refreshCount]);

  function submitHandle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHandle = normalizeHandle(handle);
    if (nextHandle) {
      setActiveHandle(nextHandle);
      setHandle(nextHandle);
      setFeedMode("following");
    }
  }

  function saveHermesSettings() {
    const nextApiBaseUrl = normalizeApiBaseUrl(hermesApiBaseUrl);
    const nextApiKey = hermesApiKey.trim();
    setHermesApiBaseUrl(nextApiBaseUrl);
    setHermesApiKey(nextApiKey);
    localStorage.setItem("hermes-api-base-url", nextApiBaseUrl);
    localStorage.setItem("hermes-api-key", nextApiKey);
  }

  function submitHermesSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveHermesSettings();
  }

  async function addToHermes(post: FeedPost) {
    const url = postUrl(post);
    const apiBaseUrl = normalizeApiBaseUrl(hermesApiBaseUrl);
    const apiKey = hermesApiKey.trim();

    if (!apiBaseUrl || !apiKey) {
      setCaptureState((current) => ({ ...current, [post.uri]: "error" }));
      setCaptureMessage((current) => ({ ...current, [post.uri]: "Add your Hermes API URL and key in settings first." }));
      return;
    }

    setCaptureState((current) => ({ ...current, [post.uri]: "saving" }));
    setCaptureMessage((current) => ({ ...current, [post.uri]: "Saving to Hermes..." }));
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`);
      }

      setCaptureState((current) => ({ ...current, [post.uri]: "saved" }));
      setCaptureMessage((current) => ({ ...current, [post.uri]: "Saved to Hermes." }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setCaptureState((current) => ({ ...current, [post.uri]: "error" }));
      setCaptureMessage((current) => ({
        ...current,
        [post.uri]: message === "Failed to fetch" ? `Could not reach Hermes API at ${apiBaseUrl}. Keep Hermes running locally, or use a LAN/tunnel URL on mobile.` : message,
      }));
      setError(message);
    }
  }

  return (
    <main className="app-shell">
      <section className="masthead">
        <p className="eyebrow">AT Protocol</p>
        <h1>Hermes Bluesky</h1>
        <p className="intro">Following and Discover, tuned for quick mobile reading and Hermes capture.</p>
        <form className="handle-form" onSubmit={submitHandle}>
          <label htmlFor="handle">Bluesky account</label>
          <div className="handle-row">
            <input id="handle" value={handle} onChange={(event) => setHandle(event.target.value)} spellCheck="false" />
            <button type="submit">Load</button>
          </div>
        </form>
      </section>

      <section className="feed-toolbar" aria-live="polite">
        <div>
          <span className="label">{feedMode}</span>
          <strong>{feedMode === "following" ? `@${activeHandle}` : "Bluesky Discover"}</strong>
        </div>
        <button className="ghost-button" type="button" onClick={() => setRefreshCount((value) => value + 1)} disabled={isLoading}>
          Refresh
        </button>
      </section>

      <nav className="feed-tabs" aria-label="Feed tabs">
        <button className={feedMode === "following" ? "active" : ""} type="button" onClick={() => setFeedMode("following")}>
          Following
        </button>
        <button className={feedMode === "discover" ? "active" : ""} type="button" onClick={() => setFeedMode("discover")}>
          Discover
        </button>
      </nav>

      <details className="hermes-settings">
        <summary>Hermes capture settings</summary>
        <form onSubmit={submitHermesSettings}>
          <label htmlFor="hermesApiBaseUrl">Hermes API URL</label>
          <input id="hermesApiBaseUrl" value={hermesApiBaseUrl} onChange={(event) => setHermesApiBaseUrl(event.target.value)} autoComplete="url" spellCheck="false" />
          <label htmlFor="hermesApiKey">Hermes API key</label>
          <input id="hermesApiKey" value={hermesApiKey} onChange={(event) => setHermesApiKey(event.target.value)} type="password" autoComplete="current-password" spellCheck="false" />
          <button className="settings-button" type="submit">Save Hermes settings</button>
        </form>
      </details>

      {feedMode === "following" ? <p className="notice subtle">Public preview of accounts followed by @{activeHandle}. OAuth will make this match Bluesky's signed-in Following timeline exactly.</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
      {isLoading ? <p className="notice">Loading {feedMode} feed...</p> : null}

      <section className="feed-list" aria-label="Bluesky posts">
        {feed.map(({ post, reason }) => {
          const state = captureState[post.uri];
          const message = captureMessage[post.uri];

          return (
            <article className="post-card" key={post.uri}>
              {reason?.by ? <p className="reason">Reposted by {reason.by.displayName || reason.by.handle}</p> : null}
              <header className="post-header">
                {post.author.avatar ? <img className="avatar" src={post.author.avatar} alt="" /> : <div className="avatar placeholder" />}
                <div>
                  <h2>{post.author.displayName || post.author.handle}</h2>
                  <p>@{post.author.handle} · {formatDate(post.record?.createdAt)}</p>
                </div>
              </header>
              <p className="post-text">{post.record?.text || "Post has no text."}</p>
              {post.embed?.images?.length ? (
                <div className="image-grid">
                  {post.embed.images.slice(0, 4).map((image) => (
                    <img key={image.thumb || image.fullsize} src={image.thumb || image.fullsize} alt={image.alt || "Bluesky post image"} />
                  ))}
                </div>
              ) : null}
              {post.embed?.external ? (
                <a className="external-card" href={post.embed.external.uri} target="_blank" rel="noreferrer">
                  {post.embed.external.thumb ? <img src={post.embed.external.thumb} alt="" /> : null}
                  <span>{post.embed.external.title || post.embed.external.uri}</span>
                  <small>{post.embed.external.description}</small>
                </a>
              ) : null}
              <footer className="post-footer">
                <span>{post.replyCount || 0} replies</span>
                <span>{post.repostCount || 0} reposts</span>
                <span>{post.likeCount || 0} likes</span>
                <button className={`hermes-button ${state || ""}`} type="button" onClick={() => addToHermes(post)} disabled={state === "saving"} aria-label="Add post to Hermes">
                  <HermesIcon />
                </button>
                <a href={postUrl(post)} target="_blank" rel="noreferrer">Open</a>
              </footer>
              {message ? <p className={`capture-feedback ${state || ""}`}>{message}</p> : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}

export default App;
