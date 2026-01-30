import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Loader2, Minus, Search, Plus, User } from 'lucide-react';
import { parseSpotifyId, fetchSpotifyMetadata, getCanonicalUrl, searchSpotify } from '../utils/spotify';
import { submitSongRequest, checkIsDeviceBanned, checkIsBlocked, subscribeToTopRequests } from '../utils/firebaseUtils';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { SongRequest } from '../types';

type CheckStatus = 'idle' | 'loading' | 'ok' | 'error' | 'none';

export function PublicRequestPage() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualData, setManualData] = useState({ title: '', artist: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [topRequests, setTopRequests] = useState<SongRequest[]>([]);
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(true);

  const [isBanned, setIsBanned] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  const [cooldownEnd, setCooldownEnd] = useState<number>(Number(localStorage.getItem('cooldown_end') || 0));
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const keyTimerRef = useRef<any>(null);

  // Checks Status (Split Blocked -> Blocked + Forbidden)
  const [checks, setChecks] = useState<{
      blocked: CheckStatus,
      forbidden: CheckStatus,
      metadata: CheckStatus,
      explicit: CheckStatus
  }>({
      blocked: 'idle',
      forbidden: 'idle',
      metadata: 'idle',
      explicit: 'idle'
  });

  // Auth & Ban Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const banned = await checkIsDeviceBanned(user.uid);
          setIsBanned(banned);
        } catch (e) {
          console.error("Error checking ban status:", e);
        }
      }
      setCheckingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Timer Tick
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  useEffect(() => {
    const unsubscribe = subscribeToTopRequests((data) => {
        setTopRequests(data);
    });
    return () => unsubscribe();
  }, []);

  // Secret Reset Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '9' && !keyTimerRef.current) {
        keyTimerRef.current = setTimeout(() => {
          localStorage.removeItem('cooldown_end');
          setCooldownEnd(0);
          setTimeLeft(0);
          setMessage({ type: 'success', text: 'Cooldown wurde zurückgesetzt!' });
          keyTimerRef.current = null;
        }, 5000);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '9' && keyTimerRef.current) {
        clearTimeout(keyTimerRef.current);
        keyTimerRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Analysis Effect
  useEffect(() => {
    let active = true;
    const runAnalysis = async () => {
      const id = parseSpotifyId(url);
      
      // Reset states
      setMessage(null);
      
      if (!id) {
          if (url.length > 2 && !url.includes('http')) {
              // Search Mode
              setChecks({ blocked: 'idle', forbidden: 'idle', metadata: 'idle', explicit: 'idle' });
              setPreview(null);
              setManualMode(false);
              setLoading(true);
              setSearchOffset(0); // Reset offset on new search
              
              try {
                  const results = await searchSpotify(url, 0); // initial fetch
                  if (active) {
                      setSearchResults(results);
                      setHasMoreResults(results.length >= 3); // Assume more if we got full page
                  }
              } catch (e) {
                  console.error("Search failed", e);
              } finally {
                  if (active) {
                      setLoading(false);
                  }
              }
          } else {
              // Not a search, not an ID
              setPreview(null);
              setManualMode(false);
              setChecks({ blocked: 'idle', forbidden: 'idle', metadata: 'idle', explicit: 'idle' });
              setSearchResults([]);
          }
          return;
      }

      // ID Found -> Metadata Fetch Mode
      setSearchResults([]); // Clear search results
      setChecks({ blocked: 'loading', forbidden: 'loading', metadata: 'loading', explicit: 'loading' });
      setLoading(true);
      
      try {
        const canonical = getCanonicalUrl(url);
        
        // 1. Metadata (Fetch first to get title/artist for Block Check)
        const meta = await fetchSpotifyMetadata(id);
        if (!active) return;

        if (meta) {
            setPreview(meta);
            setManualMode(false);
            setChecks(prev => ({ ...prev, metadata: 'ok' }));
            setChecks(prev => ({ ...prev, explicit: meta.explicit ? 'error' : 'ok' }));

            // 2. Block Check (needs title/artist)
            const blockStatus = await checkIsBlocked(canonical, meta.title + " " + meta.artist);
            if (!active) return;
            
            // Interpret Block Status
            if (blockStatus.blocked) {
                if (blockStatus.reason === 'word') {
                    setChecks(prev => ({ ...prev, blocked: 'ok', forbidden: 'error' }));
                } else {
                    setChecks(prev => ({ ...prev, blocked: 'error', forbidden: 'ok' })); // or 'none' if we want to skip
                }
            } else {
                setChecks(prev => ({ ...prev, blocked: 'ok', forbidden: 'ok' }));
            }

        } else {
            // Metadata failed -> Manual Mode
            setPreview(null);
            setManualMode(true);
            setChecks(prev => ({ ...prev, metadata: 'error', explicit: 'none' }));

            // Check blocked only on URL if metadata fails (less effective but fallback)
            const blockStatus = await checkIsBlocked(canonical, "");
             if (blockStatus.blocked) {
                setChecks(prev => ({ ...prev, blocked: 'error', forbidden: 'none' }));
            } else {
                 setChecks(prev => ({ ...prev, blocked: 'ok', forbidden: 'none' }));
            }
        }
      } catch (e) {
        if (active) {
            console.error("Analysis Error:", e);
            setManualMode(true);
            setChecks({ blocked: 'error', forbidden: 'error', metadata: 'error', explicit: 'none' });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timeoutId = setTimeout(runAnalysis, 800); 
    return () => {
        active = false;
        clearTimeout(timeoutId);
    };
  }, [url]);

  const loadMoreResults = async () => {
    if (loading || searchResults.length >= 10) return;
    setLoading(true);
    try {
        const nextOffset = searchOffset + 3;
        const newResults = await searchSpotify(url, nextOffset);
        setSearchResults(prev => [...prev, ...newResults]);
        setSearchOffset(nextOffset);
        if (newResults.length < 3 || searchResults.length + newResults.length >= 10) {
            setHasMoreResults(false);
        }
    } catch (e) {
        console.error("Load more failed", e);
    } finally {
        setLoading(false);
    }
  };

  const handleSelectResult = (track: any) => {
      setUrl(track.spotifyUrl);
      setSearchResults([]); // Clear results to trigger the ID analysis flow
  };

  const handleSubmit = async () => {
    const canSubmit = !isBanned && !checkingAuth && (preview || manualMode) && 
                      checks.blocked === 'ok' && checks.forbidden !== 'error' && checks.explicit !== 'error' && timeLeft === 0;

    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const songData = manualMode ? {
          spotifyUrl: url,
          title: manualData.title,
          artist: manualData.artist,
          coverUrl: "https://placehold.co/300x300?text=Song",
          durationMs: 0,
          isExplicit: false
      } : {
        spotifyUrl: url,
        title: preview.title,
        artist: preview.artist,
        coverUrl: preview.coverUrl,
        durationMs: preview.durationMs,
        isExplicit: preview.explicit || false
      };

      const result = await submitSongRequest(songData);
      
      const end = Date.now() + 10 * 60 * 1000; // 10 Minutes

      if (result.type === 'created') {
          setMessage({ type: 'success', text: 'Wunsch erfolgreich gesendet!' });
          localStorage.setItem('cooldown_end', end.toString());
          setCooldownEnd(end);
      } else if (result.type === 'voted') {
          setMessage({ type: 'success', text: 'Stimme abgegeben! (+1)' });
          localStorage.setItem('cooldown_end', end.toString());
          setCooldownEnd(end);
      } else if (result.type === 'already_voted') {
          setMessage({ type: 'error', text: 'Du hast für diesen Song bereits abgestimmt.' });
          // Do not trigger cooldown for duplicate vote attempt
      }

      setUrl('');
      setPreview(null);
      setManualMode(false);
      setChecks({ blocked: 'idle', forbidden: 'idle', metadata: 'idle', explicit: 'idle' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Fehler beim Senden.' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatus = (status: CheckStatus) => {
      if (status === 'loading') return <Loader2 size={16} className="animate-spin text-blue-400" />;
      if (status === 'ok') return <CheckCircle size={16} className="text-green-500" />;
      if (status === 'error') return <XCircle size={16} className="text-red-500" />;
      if (status === 'none') return <Minus size={16} className="text-yellow-500" />;
      return <div className="w-4 h-4 border border-gray-700 rounded-full" />;
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-lg bg-red-900/30 border border-red-500/50 p-4 rounded-lg mb-8 flex gap-3 items-start backdrop-blur-sm">
        <AlertTriangle className="text-red-500 shrink-0 mt-1" />
        <div>
          <h3 className="font-bold text-red-400">Regeln & Sperren</h3>
          <p className="text-sm text-gray-300 italic">Unangemessene Lieder führen zur sofortigen Gerätesperre.</p>
        </div>
      </div>

      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 animate-gradient">Musikwünsche</h1>
          {timeLeft > 0 && !isBanned && <div className="mt-2 text-yellow-500 font-mono text-xl animate-pulse">Cooldown: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>}
        </div>

        <div className="relative">
            <input
            type="text"
            disabled={isBanned || checkingAuth}
            className={`block w-full px-4 py-4 bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all shadow-inner placeholder-gray-500 text-white pl-12 ${isBanned ? 'opacity-50 border-red-500/50 grayscale' : ''}`}
            placeholder={checkingAuth ? "Initialisierung..." : isBanned ? "GERÄT GESPERRT" : "Spotify Link oder Songtitel..."}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && !preview && (
            <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-700 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-4">
                <div className="p-3 text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-900/50 border-b border-gray-700">Suchergebnisse</div>
                
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {searchResults.map((track) => (
                        <button 
                            key={track.id}
                            onClick={() => handleSelectResult(track)}
                            className="w-full flex items-center gap-4 p-4 hover:bg-gray-700/50 transition-colors border-b border-gray-700/50 last:border-0 text-left"
                        >
                            <img src={track.coverUrl} className="w-12 h-12 rounded shadow-md object-cover" alt={track.title} />
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-white truncate">{track.title}</h4>
                                <p className="text-gray-400 text-sm truncate">{track.artist}</p>
                            </div>
                            {track.explicit && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-600 text-gray-300">E</span>}
                        </button>
                    ))}
                    
                    {hasMoreResults && searchResults.length < 10 && (
                        <button 
                            onClick={loadMoreResults}
                            disabled={loading}
                            className="w-full p-3 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Mehr laden
                        </button>
                    )}
                </div>
            </div>
        )}

        {manualMode && !loading && (
            <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3 shadow-lg animate-in slide-in-from-top-2">
                <p className="text-sm text-yellow-500 flex items-center gap-2 font-medium">
                    <AlertTriangle size={16} /> Vorschau fehlgeschlagen. Bitte manuell:
                </p>
                <input 
                    type="text" placeholder="Songtitel"
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                    value={manualData.title}
                    onChange={e => setManualData(prev => ({...prev, title: e.target.value}))}
                />
                <input 
                    type="text" placeholder="Interpret"
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-green-500 outline-none"
                    value={manualData.artist}
                    onChange={e => setManualData(prev => ({...prev, artist: e.target.value}))}
                />
            </div>
        )}

        {preview && (
          <div className="bg-gray-800/80 backdrop-blur-sm p-4 rounded-xl flex gap-4 border border-gray-700 shadow-xl animate-in zoom-in-95">
            <img src={preview.coverUrl} className="w-20 h-20 rounded-lg shadow-2xl object-cover" alt="Cover" />
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h3 className="font-bold text-lg truncate text-white leading-tight">{preview.title}</h3>
              <p className="text-gray-400 truncate text-sm">{preview.artist}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || checkingAuth || isBanned || (!preview && !manualMode) || checks.blocked === 'loading'}
          className={`w-full py-4 rounded-xl font-black text-xl transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-[0.97]
            ${isBanned ? 'bg-red-600 animate-pulse' : (timeLeft > 0 || checks.blocked === 'error' || checks.explicit === 'error' || checks.forbidden === 'error') ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white'}
          `}
        >
          {submitting ? <Loader2 className="animate-spin" /> : isBanned ? 'GESPERRT' : 'Wunsch absenden'}
        </button>

        {preview && !checkingAuth && (
            <div className="bg-black/20 backdrop-blur-md border border-gray-800 p-5 rounded-xl flex flex-col gap-4 shadow-inner w-full">
                <div className="flex items-center gap-4 text-sm md:text-base font-medium text-gray-300">
                    {renderStatus(checks.blocked)} <span>Nicht blockiert</span>
                </div>
                 <div className="flex items-center gap-4 text-sm md:text-base font-medium text-gray-300">
                    {renderStatus(checks.forbidden)} <span>Keine verbotenen Wörter</span>
                </div>
                <div className="flex items-center gap-4 text-sm md:text-base font-medium text-gray-300">
                    {renderStatus(checks.metadata)} <span>Songdaten geladen</span>
                </div>
                <div className="flex items-center gap-4 text-sm md:text-base font-medium text-gray-300">
                    {renderStatus(checks.explicit)} <span>Jugendschutz (Explicit)</span>
                </div>
            </div>
        )}

        {message && (
          <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-lg animate-in zoom-in-95 ${message.type === 'success' ? 'bg-green-900/20 text-green-400 border-green-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}>
            <span className="font-bold text-sm">{message.text}</span>
          </div>
        )}
      </div>

      {/* Top 10 Charts */}
      {topRequests.length > 0 && (
          <div className="w-full max-w-lg mt-12 animate-in slide-in-from-bottom-10 fade-in duration-700">
              <h2 className="text-2xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                  🔥 Top 10 Warteschlange
              </h2>
              <div className="space-y-3">
                  {topRequests.map((req, index) => (
                      <div key={req.id} className="bg-gray-800/60 backdrop-blur-sm p-3 rounded-lg flex items-center gap-4 border border-gray-700/50 shadow-lg">
                          <div className="font-mono text-xl font-bold text-gray-500 w-8 text-center">#{index + 1}</div>
                          <img src={req.coverUrl} className="w-12 h-12 rounded shadow object-cover" alt="Cover" />
                          <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-200 truncate">{req.title}</h3>
                              <p className="text-gray-400 text-xs truncate">{req.artist}</p>
                          </div>
                          <div title={`${req.voteCount || 1} Personen wünschen sich das`} className="flex items-center gap-1.5 bg-gray-700/50 px-2 py-1 rounded-full text-yellow-400 border border-yellow-500/20 cursor-help">
                              <User size={14} />
                              <span className="font-bold text-sm">{req.voteCount || 1}</span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
}