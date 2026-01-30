# Musikwünsche Web-App (Spotify Integration) - Projektstatus

## Projektübersicht
Eine Webanwendung, die es Nutzern ermöglicht, Musikwünsche via Spotify-Link einzureichen, und DJs eine moderne Verwaltungsoberfläche bietet.

## Aktueller Fortschritt & Implementierte Features

### 1. Öffentliche Ansicht (User)
- **Modernes UI:** Dunkles Design mit Tailwind CSS und Animationen.
- **Spotify Integration:**
  - Automatisches Auslesen von Song-Metadaten (Titel, Interpret, Cover) via Spotify-Link.
  - Unterstützung von Links mit Tracking-Parametern (z. B. `?si=...`) durch URL-Bereinigung (Canonical URLs).
  - Manueller Fallback, falls der automatische Abruf fehlschlägt.
- **Sicherheits- & Filter-System:**
  - **Auto-Filter:** Songs, die verbotene Begriffe (aus den DJ-Einstellungen) enthalten, werden blockiert.
  - **Blacklist:** Manuell vom DJ abgelehnte Songs können nicht erneut gewünscht werden.
  - **Duplikat-Prüfung:** Verhindert, dass Songs, die bereits in der Warteschlange stehen oder bereits gespielt wurden, erneut gesendet werden.
  - **Spam-Schutz:** 20-minütiger Cooldown pro Gerät (gespeichert im LocalStorage).
  - **Geheimer Reset:** Cooldown kann durch Halten der Taste `9` (5 Sek.) zurückgesetzt werden.
  - **Gerätesperre:** Permanent gesperrte Geräte (UID-basiert) sehen einen pulsierenden roten "GESPERRT"-Button.
- **Feedback:** Klare Statusmeldungen (Grün für Erfolg, Gelb für Hinweise wie Duplikate, Rot für Fehler/Sperren).

### 2. DJ / Admin Bereich
- **Hidden Login:** Zugriff via `6` gedrückt halten (2 Sek.) und Code-Eingabe (`BT_2025!`).
- **Dashboard:**
  - **Warteschlange:** Echtzeit-Liste aller neuen Wünsche.
  - **Drag & Drop:** Umsortieren der Warteschlange per Maus/Touch.
  - **Aktionen:** Akzeptieren (verschiebt ins Archiv), Ablehnen (löscht Song), Gerät sperren (bannt UID und löscht Song).
  - **Zensur:** Songs mit Filter-Treffern werden für den DJ ausgeblurrt dargestellt ("FILTER TREFFER"), können aber per Klick angezeigt werden.
- **Archiv:**
  - Speichert die letzten 50 gespielten Songs.
  - Älteste Songs werden automatisch rotiert.
  - Funktionen: Link kopieren, Song wieder ganz oben in die Warteschlange schieben.
- **Einstellungen (Management):**
  - **Wort-Filter:** Verbotene Wörter als Tags hinzufügen/löschen (standardmäßig zensiert in der Admin-Ansicht).
  - **Blacklist-Verwaltung:** Liste aller manuell abgelehnten Songs mit Freigabe-Option.
  - **Bann-Liste:** Chronologische Liste aller gesperrten Geräte (UIDs) mit Entsperr-Funktion.

### 3. Technische Infrastruktur
- **Frontend:** React + TypeScript + Vite + Lucide Icons.
- **Backend:** Firebase (Firestore & Authentication).
- **Hosting:** Firebase Hosting.
- **Sicherheit:** Firebase Security Rules für alle Kollektionen (`requests`, `archive`, `history`, `blacklist`, `banned_devices`, `settings`).
- **Persistenz:** Permanente Historie (`history`) für Duplikat-Checks, auch wenn das Archiv rotiert.

## Tech Stack
- **Framework:** React 19 (TypeScript)
- **Styling:** Tailwind CSS 4
- **Database:** Firebase Firestore
- **Auth:** Firebase Anonymous Auth
- **Icons:** Lucide React
- **Date-Handling:** date-fns

## Offene Punkte / Bekannte Probleme

- **Metadata Proxy:** Der aktuelle Proxy (`allorigins`) ist teils instabil. Wechsel auf offizielle Spotify API geplant.

- **Fehlermeldungen:** Gelegentliche Probleme beim Absenden (muss auf DB-Kommunikationsfehler geprüft werden).



## Geplante Features: Song-Analyse & Spotify API Integration



### Konzept: 4-Punkt-Check vor dem Absenden

Unter dem Sende-Button erscheinen 4 Indikatoren mit Ladeanimationen:

1. **Block-Status:** Ist der Song auf der Blacklist oder das Gerät gesperrt?

2. **Metadaten:** Wurden Titel, Interpret und Cover erfolgreich geladen?

3. **Jugendschutz (Explicit):** Ist der Song bei Spotify als "explicit" markiert? (Parental Advisory)

4. **Songtext-Check:** Enthält der Songtext verbotene Wörter? (Gelber Strich `-` wenn keine Lyrics gefunden).



**Status-Icons:**

- 🔄 Ladeanimation (Prüfung läuft)

- ✅ Grüner Haken (Alles OK)

- ❌ Rotes Kreuz (Song blockiert / Nicht erlaubt)

- ➖ Gelber Strich (Nicht verfügbar / Nicht zutreffend)



### Taskliste für die nächsten Schritte:

- [x] **Spotify API Setup:** Client Credentials Flow implementieren.
- [x] **Erweiterte Metadaten:** `explicit` Flag aus der Spotify API auslesen.
- [ ] **Song-Suche:** Suche nach Songtiteln ermöglichen (Top 3 Ergebnisse anzeigen).
- [ ] **Lyrics Integration:** Suche nach einer Lösung für Songtexte (z.B. Genius API oder alternative Dienste).

- [ ] **Analyse-Logik:** Songtext gegen die `forbidden_words` Collection prüfen.

- [ ] **Frontend UI:** Implementierung der 4 Status-Indikatoren unter dem Absenden-Button.

- [ ] **Sperr-Logik:** Absenden verhindern, wenn einer der kritischen Punkte (Block, Explicit, Lyrics-Filter) fehlschlägt.
