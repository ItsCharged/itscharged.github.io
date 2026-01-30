const CLIENT_ID = "0017d4997502470a9f86747f9dd38b57";
const CLIENT_SECRET = "01990f5a06c04443a2ba9894c0c32fe4";

let accessToken: string | null = null;
let tokenExpiry: number = 0;

export const parseSpotifyId = (url: string): string | null => {
  try {
    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
};

export const getCanonicalUrl = (url: string): string => {
  const id = parseSpotifyId(url);
  return id ? `https://open.spotify.com/track/${id}` : url;
};

const getSpotifyToken = async () => {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return accessToken;
};

/**
 * Hilfsfunktion für Fetch mit Timeout
 */
const fetchWithTimeout = async (url: string, options: any = {}, timeout = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

export const fetchSpotifyMetadata = async (spotifyId: string) => {
  try {
    const token = await getSpotifyToken();
    const response = await fetchWithTimeout(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 5000);

    if (!response.ok) throw new Error("Spotify API error");
    const data = await response.json();

    return {
      title: data.name,
      artist: data.artists.map((a: any) => a.name).join(", "),
      coverUrl: data.album.images[0]?.url || "https://placehold.co/300x300?text=Spotify",
      durationMs: data.duration_ms,
      explicit: data.explicit
    };
  } catch (e) {
    console.error("Fetch Metadata Error:", e);
    return null;
  }
};

export const searchSpotify = async (query: string, offset: number = 0) => {
  try {
    const token = await getSpotifyToken();
    const response = await fetchWithTimeout(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=3&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 5000);

    if (!response.ok) throw new Error("Spotify Search API error");
    const data = await response.json();

    return data.tracks.items.map((track: any) => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map((a: any) => a.name).join(", "),
      coverUrl: track.album.images[0]?.url || "https://placehold.co/300x300?text=Spotify",
      durationMs: track.duration_ms,
      explicit: track.explicit,
      spotifyUrl: track.external_urls.spotify
    }));
  } catch (e) {
    console.error("Search Error:", e);
    return [];
  }
};
