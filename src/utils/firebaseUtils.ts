import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  limit, 
  writeBatch, 
  where,
  orderBy,
  getDoc,
  updateDoc,
  arrayUnion,
  increment
} from 'firebase/firestore';
import type { SongRequest, BlacklistedSong } from '../types';
import { getCanonicalUrl } from './spotify';

const REQUESTS_COLL = 'requests';
const BLACKLIST_COLL = 'blacklist';
const FORBIDDEN_WORDS_COLL = 'forbidden_words';
const ARCHIVE_COLL = 'archive';
const HISTORY_COLL = 'history';
const BANNED_DEVICES_COLL = 'banned_devices';

export const submitSongRequest = async (song: Omit<SongRequest, 'id' | 'timestamp' | 'status' | 'senderUid' | 'votes' | 'voteCount'>) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");

  const isBanned = await checkIsDeviceBanned(user.uid);
  if (isBanned) throw new Error("DEVICE_BANNED");

  const canonicalUrl = getCanonicalUrl(song.spotifyUrl);

  const blockStatus = await checkIsBlocked(canonicalUrl, song.title + " " + song.artist);
  if (blockStatus.blocked) {
    throw new Error(blockStatus.reason === 'word' ? 'FORBIDDEN_WORD' : 'BLACKLISTED');
  }

  const qActive = query(collection(db, REQUESTS_COLL), where('spotifyUrl', '==', canonicalUrl));
  const activeSnap = await getDocs(qActive);
  
  if (!activeSnap.empty) {
      const existingDoc = activeSnap.docs[0];
      const data = existingDoc.data();
      const votes = data.votes || [];

      if (votes.includes(user.uid)) {
          return { type: 'already_voted', id: existingDoc.id };
      }

      await updateDoc(doc(db, REQUESTS_COLL, existingDoc.id), {
          votes: arrayUnion(user.uid),
          voteCount: increment(1)
      });
      return { type: 'voted', id: existingDoc.id };
  }

  const qHistory = query(collection(db, HISTORY_COLL), where('spotifyUrl', '==', canonicalUrl));
  const historySnap = await getDocs(qHistory);
  if (!historySnap.empty) throw new Error("ALREADY_ACCEPTED");

  const docRef = await addDoc(collection(db, REQUESTS_COLL), {
    ...song,
    spotifyUrl: canonicalUrl,
    timestamp: Date.now(),
    status: 'pending',
    senderUid: user.uid,
    votes: [user.uid],
    voteCount: 1
  });
  return { type: 'created', id: docRef.id };
};

export const subscribeToRequests = (callback: (requests: SongRequest[]) => void) => {
  const q = query(collection(db, REQUESTS_COLL), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SongRequest[];
    callback(requests);
  });
};

export const subscribeToTopRequests = (callback: (requests: SongRequest[]) => void) => {
  const q = query(collection(db, REQUESTS_COLL), orderBy('voteCount', 'desc'), limit(10));
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SongRequest[];
    callback(requests);
  });
};

export const subscribeToArchive = (callback: (requests: SongRequest[]) => void) => {
  const q = query(collection(db, ARCHIVE_COLL), orderBy('playedAt', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SongRequest[];
    callback(requests);
  });
};

export const subscribeToBlacklist = (callback: (songs: BlacklistedSong[]) => void) => {
  const q = query(collection(db, BLACKLIST_COLL));
  return onSnapshot(q, (snapshot) => {
    const songs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as BlacklistedSong[];
    callback(songs);
  });
};

export const subscribeToForbiddenWords = (callback: (words: string[]) => void) => {
  return onSnapshot(collection(db, FORBIDDEN_WORDS_COLL), (snapshot) => {
    const words = snapshot.docs.map(d => d.data().word);
    console.log("Forbidden words updated:", words);
    callback(words);
  });
};

export const addForbiddenWord = async (word: string) => {
  const id = word.toLowerCase().trim();
  if (!id) return;
  await setDoc(doc(db, FORBIDDEN_WORDS_COLL, id), { word: id });
};

export const removeForbiddenWord = async (word: string) => {
  await deleteDoc(doc(db, FORBIDDEN_WORDS_COLL, word.toLowerCase().trim()));
};

export const banDevice = async (uid: string) => {
  await setDoc(doc(db, BANNED_DEVICES_COLL, uid), {
    uid,
    bannedAt: Date.now()
  });
};

export const unbanDevice = async (uid: string) => {
  await deleteDoc(doc(db, BANNED_DEVICES_COLL, uid));
};

export const checkIsDeviceBanned = async (uid: string): Promise<boolean> => {
  const docRef = doc(db, BANNED_DEVICES_COLL, uid);
  const snap = await getDoc(docRef);
  return snap.exists();
};

export const subscribeToBannedDevices = (callback: (uids: {uid: string, bannedAt: number}[]) => void) => {
  const q = query(collection(db, BANNED_DEVICES_COLL), orderBy('bannedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(d => ({ 
        uid: d.id, 
        bannedAt: d.data().bannedAt 
    })));
  });
};

const cleanupArchive = async () => {
  const q = query(collection(db, ARCHIVE_COLL), orderBy('playedAt', 'desc'));
  const snapshot = await getDocs(q);
  if (snapshot.size > 50) {
    const batch = writeBatch(db);
    snapshot.docs.slice(50).forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
};

export const updateRequestStatus = async (id: string, status: 'accepted' | 'rejected') => {
  const ref = doc(db, REQUESTS_COLL, id);
  if (status === 'accepted') {
    const snap = await getDocs(collection(db, REQUESTS_COLL));
    const target = snap.docs.find(d => d.id === id);
    if (target) {
      const data = target.data();
      const canonicalUrl = getCanonicalUrl(data.spotifyUrl);
      await addDoc(collection(db, ARCHIVE_COLL), {
        ...data,
        spotifyUrl: canonicalUrl,
        status: 'accepted',
        playedAt: Date.now()
      });
      await setDoc(doc(db, HISTORY_COLL, btoa(canonicalUrl).replace(/=/g, '')), {
        spotifyUrl: canonicalUrl,
        title: data.title,
        artist: data.artist,
        acceptedAt: Date.now()
      });
      await deleteDoc(ref);
      await cleanupArchive();
    }
  } else {
    await deleteDoc(ref);
  }
};

export const restoreFromArchive = async (id: string) => {
  const archiveRef = doc(db, ARCHIVE_COLL, id);
  const snap = await getDocs(collection(db, ARCHIVE_COLL));
  const archiveDoc = snap.docs.find(d => d.id === id);
  if (archiveDoc) {
    const data = archiveDoc.data();
    const canonicalUrl = getCanonicalUrl(data.spotifyUrl);
    await deleteDoc(doc(db, HISTORY_COLL, btoa(canonicalUrl).replace(/=/g, '')));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { playedAt, ...rest } = data;
    await addDoc(collection(db, REQUESTS_COLL), {
      ...rest,
      spotifyUrl: canonicalUrl,
      status: 'pending',
      timestamp: Date.now()
    });
    await deleteDoc(archiveRef);
  }
};

export const addToBlacklist = async (spotifyUrl: string, title: string, reason: string = "Manually Rejected") => {
  const canonicalUrl = getCanonicalUrl(spotifyUrl);
  const safeId = btoa(canonicalUrl).replace(/=/g, '');
  await setDoc(doc(db, BLACKLIST_COLL, safeId), {
    id: safeId,
    spotifyUrl: canonicalUrl,
    title,
    reason
  });
};

export const removeFromBlacklist = async (id: string) => {
  await deleteDoc(doc(db, BLACKLIST_COLL, id));
};

export const checkIsBlocked = async (spotifyUrl: string, textContent: string): Promise<{blocked: boolean, reason?: 'word' | 'blacklist'}> => {
  const canonicalUrl = getCanonicalUrl(spotifyUrl);
  const safeId = btoa(canonicalUrl).replace(/=/g, '');
  const blackSnap = await getDocs(collection(db, BLACKLIST_COLL));
  if (blackSnap.docs.some(d => d.data().spotifyUrl === canonicalUrl || d.id === safeId)) {
    return { blocked: true, reason: 'blacklist' };
  }
  
  const wordsSnap = await getDocs(collection(db, FORBIDDEN_WORDS_COLL));
  const forbiddenWords = wordsSnap.docs.map(d => d.data().word);

  const lowerText = textContent.toLowerCase();
  for (const word of forbiddenWords) {
     // Escape special regex characters in the word to prevent errors
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    if (regex.test(lowerText)) return { blocked: true, reason: 'word' };
  }
  return { blocked: false }; 
};