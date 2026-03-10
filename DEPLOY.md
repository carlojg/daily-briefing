# Carlotta Daily Briefing — Deploy Anleitung

## Schritt 1: Supabase Datenbank einrichten (2 Min)

1. supabase.com → dein Projekt → **SQL Editor** (links in der Sidebar)
2. "New query" klicken
3. Inhalt von `SUPABASE_SETUP.sql` komplett einfügen
4. **Run** klicken → grüne Bestätigung abwarten

Fertig — die Datenbank ist bereit.

---

## Schritt 2: Code auf GitHub hochladen (5 Min)

1. github.com → einloggen → **"New repository"**
2. Name: `daily-briefing` → **Public** → **"Create repository"**
3. Du siehst jetzt eine leere Repository-Seite
4. Klick auf **"uploading an existing file"**
5. Lade diese Dateien hoch (alle auf einmal per Drag & Drop):
   - `package.json`
   - `vercel.json`
   - Ordner `public/` (index.html, manifest.json, sw.js)
   - Ordner `src/` (App.jsx, index.js, supabase.js)
6. **"Commit changes"** klicken

---

## Schritt 3: Vercel deployen (3 Min)

1. vercel.com → einloggen mit GitHub
2. **"Add New Project"** → dein `daily-briefing` Repository auswählen
3. Framework: **Create React App** (wird auto-erkannt)
4. **Deploy** klicken → 2–3 Min warten
5. Du bekommst eine URL wie `daily-briefing-xxx.vercel.app`

---

## Schritt 4: iPhone Homescreen (1 Min)

1. Safari → deine Vercel URL öffnen
2. Teilen-Button (Quadrat mit Pfeil nach oben) tippen
3. **"Zum Home-Bildschirm"** → "Hinzufügen"
4. Die App erscheint als Icon auf deinem Homescreen

---

## Fertig! 

Ab jetzt werden alle Eingaben automatisch in Supabase gespeichert.
Kein manueller Export mehr nötig. Daten bleiben für immer erhalten.
