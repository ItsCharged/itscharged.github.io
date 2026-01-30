import { useState, useEffect } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Check, X, GripVertical, Settings, Ban, Clock, Archive, RotateCcw, XCircle, UserX, Eye, EyeOff, User, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

import { 
    subscribeToRequests, 
    updateRequestStatus, 
    addToBlacklist, 
    subscribeToArchive, 
    restoreFromArchive, 
    subscribeToBlacklist, 
    removeFromBlacklist, 
    banDevice, 
    unbanDevice, 
    subscribeToBannedDevices,
    subscribeToForbiddenWords,
    addForbiddenWord,
    removeForbiddenWord
} from '../utils/firebaseUtils';
import type { SongRequest, BlacklistedSong } from '../types';

// Sortable Item Component
function SortableRequestItem({ request, onAccept, onReject, onBan, isDragMode, forbiddenWords }: any) {
  const [showCensored, setShowCensored] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: request.id, disabled: !isDragMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const containsForbidden = forbiddenWords.some((word: string) => 
    request.title.toLowerCase().includes(word.toLowerCase()) || 
    request.artist.toLowerCase().includes(word.toLowerCase())
  );

  const copyLink = () => {
    navigator.clipboard.writeText(request.spotifyUrl);
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-gray-800 p-4 rounded-lg flex items-center gap-4 mb-3 border border-gray-700 ${request.status === 'rejected' ? 'opacity-50' : ''}`}>
      {isDragMode && (
        <div {...attributes} {...listeners} className="cursor-grab text-gray-500 hover:text-white">
          <GripVertical />
        </div>
      )}
      
      <div className="relative group">
          <img src={request.coverUrl} alt="Cover" className={`w-16 h-16 rounded object-cover transition-all ${containsForbidden && !showCensored ? 'blur-md' : ''}`} />
          {containsForbidden && !showCensored && (
              <button 
                onClick={() => setShowCensored(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  Anzeigen
              </button>
          )}
          {(request.voteCount || 0) > 0 && (
              <div className="absolute -top-2 -right-2 bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm border border-yellow-600 z-10" title={`${request.voteCount} Personen wünschen sich das`}>
                  <User size={10} /> {request.voteCount}
              </div>
          )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className={`font-bold text-white truncate transition-all ${containsForbidden && !showCensored ? 'blur-sm select-none' : ''}`}>
            {request.title}
        </h3>
        <p className={`text-gray-400 truncate transition-all ${containsForbidden && !showCensored ? 'blur-sm select-none' : ''}`}>
            {request.artist}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
            <Clock size={12} />
            {formatDistanceToNow(request.timestamp, { addSuffix: true, locale: de })}
            {containsForbidden && (
                <span className="bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold ml-2">
                    FILTER TREFFER
                </span>
            )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={copyLink} className="p-2 hover:bg-gray-700 rounded text-blue-400" title="Link kopieren">
            <Copy size={20} />
        </button>
        
        {request.status !== 'accepted' && (
            <button onClick={() => onAccept(request.id)} className="p-2 hover:bg-gray-700 rounded text-green-500" title="Akzeptieren">
                <Check size={20} />
            </button>
        )}
        
        {request.status !== 'rejected' && (
            <button onClick={() => onReject(request.id, request.title, request.spotifyUrl)} className="p-2 hover:bg-gray-700 rounded text-red-500" title="Ablehnen & Blockieren">
                <X size={20} />
            </button>
        )}

        <button onClick={() => onBan(request.senderUid, request.title, request.id)} className="p-2 hover:bg-gray-700 rounded text-red-600" title="Gerät sperren (UID)">
            <UserX size={20} />
        </button>
      </div>
    </div>
  );
}

export function AdminDashboardPage() {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [archive, setArchive] = useState<SongRequest[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistedSong[]>([]);
  const [bannedDevices, setBannedDevices] = useState<{uid: string, bannedAt: number}[]>([]);
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<'queue' | 'archive'>('queue');
  const [isDragMode, setIsDragMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [wordInput, setWordInput] = useState("");
  const [showWords, setShowWords] = useState(false);
  
  const [sortBy, setSortBy] = useState<'date' | 'votes'>('date');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const sortedRequests = [...requests].sort((a, b) => {
    if (sortBy === 'votes') {
        const diff = (b.voteCount || 0) - (a.voteCount || 0);
        if (diff !== 0) return diff;
    }
    // Default: Newest first (assuming timestamp is "created at")
    // Note: requests are already sorted by timestamp desc from firestore usually, 
    // but explicit sort here is safer if we mix things.
    return b.timestamp - a.timestamp; 
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        
        const first = sortedRequests[0];
        if (!first || activeTab !== 'queue') return;

        if (e.key === 'a' || e.key === 'A') {
            handleAccept(first.id);
        } else if (e.key === 'd' || e.key === 'D') {
            handleReject(first.id, first.title, first.spotifyUrl);
        } else if (e.key === 'b' || e.key === 'B') {
            handleBan(first.senderUid, first.title, first.id);
        }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [sortedRequests, activeTab]);

  useEffect(() => {
    const unsubscribeReq = subscribeToRequests((data: SongRequest[]) => {
        if (!isDragMode) setRequests(data);
    });
    const unsubscribeArch = subscribeToArchive((data: SongRequest[]) => {
        setArchive(data);
    });
    const unsubscribeBlack = subscribeToBlacklist((data: BlacklistedSong[]) => {
        setBlacklist(data);
    });
    const unsubscribeBanned = subscribeToBannedDevices((data) => {
        setBannedDevices(data);
    });
    const unsubscribeWords = subscribeToForbiddenWords((data) => {
        setForbiddenWords(data);
    });
    return () => {
        unsubscribeReq();
        unsubscribeArch();
        unsubscribeBlack();
        unsubscribeBanned();
        unsubscribeWords();
    };
  }, [isDragMode]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRequests((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAccept = async (id: string) => {
    await updateRequestStatus(id, 'accepted');
  };

  const handleReject = async (id: string, title: string, spotifyUrl: string) => {
    if (confirm(`Möchtest du "${title}" wirklich ablehnen und für die Zukunft blockieren?`)) {
        await updateRequestStatus(id, 'rejected');
        await addToBlacklist(spotifyUrl, title, "Manually rejected by DJ");
    }
  };

  const handleBan = async (uid: string, title: string, requestId: string) => {
      if (confirm(`Möchtest du das Gerät, das "${title}" gesendet hat, komplett sperren? Der Wunsch wird sofort gelöscht.`)) {
          await banDevice(uid);
          await updateRequestStatus(requestId, 'rejected'); // Deletes the request
      }
  };

  const handleRestore = async (id: string) => {
      await restoreFromArchive(id);
  };

  const handleAddWord = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wordInput.trim()) return;
      await addForbiddenWord(wordInput);
      setWordInput("");
  };

  return (
    <div className="min-h-screen text-white p-6">
      <header className="flex justify-between items-center mb-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            DJ Dashboard
        </h1>
        <div className="flex gap-4">
            <div className="relative group">
                <button className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 flex items-center gap-2 font-medium">
                    <ArrowUpDown size={18} /> {sortBy === 'date' ? 'Neueste' : 'Beliebteste'}
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded shadow-xl overflow-hidden hidden group-hover:block z-50">
                    <button 
                        onClick={() => setSortBy('date')}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 ${sortBy === 'date' ? 'text-blue-400 font-bold' : 'text-gray-300'}`}
                    >
                        <Clock size={16} /> Neueste zuerst
                    </button>
                    <button 
                        onClick={() => setSortBy('votes')}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2 ${sortBy === 'votes' ? 'text-blue-400 font-bold' : 'text-gray-300'}`}
                    >
                        <User size={16} /> Meiste Stimmen
                    </button>
                </div>
            </div>

            <button 
                onClick={() => setIsDragMode(!isDragMode)}
                disabled={sortBy === 'votes'}
                className={`px-4 py-2 rounded font-bold transition-colors ${sortBy === 'votes' ? 'opacity-50 cursor-not-allowed bg-gray-700' : isDragMode ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                title={sortBy === 'votes' ? "Drag & Drop im Voting-Modus deaktiviert" : ""}
            >
                {isDragMode ? 'Drag & Drop: AN' : 'Drag & Drop Starten'}
            </button>
            <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 bg-gray-700 rounded hover:bg-gray-600"
            >
                <Settings />
            </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto flex gap-4 mb-6 border-b border-gray-800 pb-2">
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t transition-all ${activeTab === 'queue' ? 'border-b-2 border-blue-500 text-blue-400 bg-gray-800/50' : 'text-gray-500 hover:text-white'}`}
          >
              <Clock size={18} /> Warteschlange
          </button>
          <button 
            onClick={() => setActiveTab('archive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t transition-all ${activeTab === 'archive' ? 'border-b-2 border-purple-500 text-purple-400 bg-gray-800/50' : 'text-gray-500 hover:text-white'}`}
          >
              <Archive size={18} /> Archiv (Gespielt)
          </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
          <div className="max-w-5xl mx-auto mb-8 bg-gray-800 p-6 rounded border border-gray-700 shadow-2xl animate-in fade-in slide-in-from-top-4">
              <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Ban className="text-red-500"/> Auto-Reject Filter</div>
                  <button 
                    onClick={() => setShowWords(!showWords)}
                    className="text-xs flex items-center gap-1 text-gray-400 hover:text-white bg-gray-700 px-2 py-1 rounded"
                  >
                      {showWords ? <EyeOff size={14} /> : <Eye size={14} />} {showWords ? 'Verstecken' : 'Anzeigen'}
                  </button>
              </h2>
              
              <form onSubmit={handleAddWord} className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white"
                    placeholder="Neues verbotenes Wort hinzufügen..."
                    value={wordInput}
                    onChange={(e) => setWordInput(e.target.value)}
                  />
                  <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 rounded font-bold text-sm transition-colors">Hinzufügen</button>
              </form>

              <div className="flex flex-wrap gap-2 mb-8">
                  {forbiddenWords.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">Keine Filter definiert.</p>
                  ) : (
                      forbiddenWords.map((word) => (
                          <div key={word} className="flex items-center gap-2 bg-gray-700 px-3 py-1 rounded-full group">
                              <span className={`text-sm ${!showWords ? 'blur-sm select-none' : ''}`}>{word}</span>
                              <button onClick={() => removeForbiddenWord(word)} className="text-gray-400 hover:text-red-500">
                                  <X size={14} />
                              </button>
                          </div>
                      ))
                  )}
              </div>

              <div className="pt-6 border-t border-gray-700">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <XCircle className="text-red-500"/> Abgelehnte Songs (Blacklist)
                  </h2>
                  <div className="flex flex-wrap gap-2 mb-8">
                      {blacklist.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">Keine manuell abgelehnten Songs.</p>
                      ) : (
                          blacklist.map((song) => (
                              <div key={song.id} className="flex items-center gap-2 bg-red-900/40 border border-red-500/50 px-3 py-1.5 rounded-full">
                                  <span className="text-sm font-medium text-red-200">{song.title}</span>
                                  <button onClick={() => removeFromBlacklist(song.id)} className="text-red-400 hover:text-white">
                                      <X size={16} />
                                  </button>
                              </div>
                          ))
                      )}
                  </div>
              </div>

              <div className="pt-6 border-t border-gray-700">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <UserX className="text-red-600"/> Gesperrte Geräte (UIDs)
                  </h2>
                  <div className="flex flex-col gap-2">
                      {bannedDevices.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">Keine gesperrten Geräte.</p>
                      ) : (
                          bannedDevices.map((device) => (
                              <div key={device.uid} className="flex items-center justify-between bg-gray-900 border border-red-500/30 p-3 rounded-lg group">
                                  <div className="flex flex-col">
                                      <span className="text-xs font-mono text-red-200">{device.uid}</span>
                                      <span className="text-[10px] text-gray-500">
                                          Gesperrt am: {new Date(device.bannedAt).toLocaleString('de-DE')}
                                      </span>
                                  </div>
                                  <button 
                                    onClick={() => unbanDevice(device.uid)}
                                    className="p-2 text-gray-500 hover:text-white hover:bg-red-600 rounded transition-all"
                                    title="Gerät entsperren"
                                  >
                                      <RotateCcw size={16} />
                                  </button>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      <div className="max-w-5xl mx-auto">
        {activeTab === 'queue' ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedRequests.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {sortedRequests.length === 0 ? (
                        <p className="text-center text-gray-500 mt-10">Keine offenen Wünsche.</p>
                    ) : (
                        sortedRequests.map((req) => (
                            <SortableRequestItem 
                                key={req.id} 
                                request={req} 
                                onAccept={handleAccept}
                                onReject={handleReject}
                                onBan={handleBan}
                                isDragMode={isDragMode && sortBy === 'date'}
                                forbiddenWords={forbiddenWords}
                            />
                        ))
                    )}
                </SortableContext>
            </DndContext>
        ) : (
            <div className="grid gap-3">
                {archive.length === 0 ? (
                    <p className="text-center text-gray-500 mt-10">Noch keine gespielten Songs.</p>
                ) : (
                    archive.map((req) => (
                        <div key={req.id} className="bg-gray-800/50 p-4 rounded-lg flex items-center gap-4 border border-gray-700">
                            <img src={req.coverUrl} alt="Cover" className="w-16 h-16 rounded object-cover grayscale opacity-50" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-300 truncate">{req.title}</h3>
                                <p className="text-gray-500 truncate">{req.artist}</p>
                                <div className="text-xs text-gray-600 mt-1">
                                    Gespielt am {(req as any).playedAt ? new Date((req as any).playedAt).toLocaleTimeString('de-DE') : 'Unbekannt'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => navigator.clipboard.writeText(req.spotifyUrl)} className="p-2 hover:bg-gray-700 rounded text-blue-400" title="Link kopieren">
                                    <Copy size={20} />
                                </button>
                                <button onClick={() => handleRestore(req.id)} className="p-2 hover:bg-gray-700 rounded text-purple-400" title="Wiederherstellen">
                                    <RotateCcw size={20} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        )}
      </div>
    </div>
  );
}
