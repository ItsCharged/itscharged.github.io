export interface SongRequest {
  id: string;
  spotifyUrl: string;
  title: string;
  artist: string;
  coverUrl: string;
  durationMs: number;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
  senderUid: string;
  isExplicit: boolean;
  votes: string[];
  voteCount: number;
}

export interface ForbiddenWord {
  id: string;
  word: string;
}

export interface BlacklistedSong {
  id: string; // Spotify ID
  title: string;
  reason: string;
}
