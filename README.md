# Adelboden 2027 – Superprompt Builder

Visueller KI-Prompt-Builder für das Transfermodul **Hospitality Live Experience – Sunrise VIP Cube**, FIS Ski World Cup Adelboden 2027 (Hotelfachschule Thun).

Jedes Teammitglied kann ohne Prompt-Engineering-Kenntnisse in 3–5 Minuten einen professionellen, nach fester Struktur aufgebauten KI-Prompt erstellen (Quick Mode & Advanced Mode), inkl. Team-Intelligenz, Risiko-Modul, Live-Vorschau und Prompt Quality Score.

Die Prompt-Erstellung selbst ist eine **reine Client-Anwendung** – kein Backend nötig, keine externen Laufzeit-Abhängigkeiten. Alle Eingaben werden ausschliesslich lokal im Browser (`localStorage`) des jeweiligen Nutzers gespeichert.

Optional gibt es eine **serverseitige KI-Integration** (OpenAI): der fertige Superprompt kann direkt an eine KI gesendet werden — der OpenAI API-Key liegt dabei ausschliesslich serverseitig in einer Netlify-Umgebungsvariable und erreicht den Browser nie. Ohne konfigurierten Key funktioniert der Prompt Builder unverändert vollständig ohne KI-Aufruf.

Zusätzlich gibt es ein **Team-Board** (zweiter Tab oben): geteilte, für alle Teams sichtbare Deadlines, Aufgaben pro Team und geteilte Projektdateien — zentral gespeichert (Netlify Blobs), nicht mehr nur lokal im Browser. Lesen ist für alle offen; Bearbeiten erfordert eine Namensauswahl ("Wer bist du?") statt eines Passworts, mit rollenbasierten Rechten (Projektleitung vs. eigenes Team). Deadlines fliessen automatisch als Kontext in jede KI-Generierung ein.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Struktur, Meta-Tags, Favicon, Superprompt-Builder- und Team-Board-Seite |
| `style.css` | Design-System (Swiss Hospitality / Event-Look) |
| `data.js` | Projektdaten: Teams, Presets, Risiken, Output-Formate, Demo-Daten, KI-Konfiguration |
| `app.js` | Anwendungslogik: State, Rendering, Prompt-Generierung, Score, Export, Datei-Upload, KI-Aufrufe, Team-Board |
| `netlify/functions/generate-ai.mjs` | Netlify Function: serverseitiger, sicherer Aufruf der OpenAI Responses API (liest `OPENAI_API_KEY`, extrahiert DOCX-Text dependency-frei, reicht PDFs nativ an OpenAI weiter) |
| `netlify/functions/shared-board.mjs` | Netlify Function: CRUD für geteilte Deadlines, Aufgaben (Tasks) & Datei-Metadaten (Netlify Blobs), Lesen offen, Schreiben über Namens-/Team-Identität (Team-Roster) geprüft |
| `netlify/functions/shared-file-download.mjs` | Netlify Function: liefert geteilte Dateien zum Download aus (öffentlich lesbar) |
| `package.json` | Einzige npm-Abhängigkeit: `@netlify/blobs` (offizielles, first-party Netlify-Paket für die geteilte Speicherung) |
| `netlify.toml` | Deployment-Konfiguration für Netlify (Header, Caching, Functions-Verzeichnis) |
| `vercel.json` | Deployment-Konfiguration für Vercel (Header, Caching) — **ohne** KI-Function und Team-Board (siehe Hinweis unten) |
| `.claude/launch.json` | Nur für lokale Entwicklung: startet einen einfachen Ruby-Testserver |

**Kein manueller Build-Schritt nötig** — Netlify installiert `@netlify/blobs` beim Deploy automatisch (Standard-Verhalten, sobald ein `package.json` im Repo liegt). `generate-ai.mjs` selbst bleibt weiterhin abhängigkeitsfrei (nur `node:zlib` + globale `fetch`-API).

**Wichtig:** KI-Integration und Team-Board sind als **Netlify Functions** gebaut. Bei Deployment auf GitHub Pages (rein statisch, keine Functions) oder Vercel (anderes Function-Format, keine Blobs-Anbindung vorbereitet) steht der Prompt Builder vollständig zur Verfügung, aber „Mit KI generieren“ und das Team-Board funktionieren nur auf Netlify.

## Lokal öffnen

Die App funktioniert ohne Server – einfach `index.html` im Browser öffnen:

```bash
open index.html
```

Alternativ mit einem einfachen lokalen Server (empfohlen, falls der Browser `file://`-Einschränkungen zeigt):

```bash
# Python
python3 -m http.server 8000

# oder Node
npx serve .
```

Danach `http://localhost:8000` aufrufen.

## Deployment auf Netlify

1. Neues Netlify-Projekt erstellen → **"Deploy manually"** (Ordner per Drag & Drop hochladen) oder Git-Repository verbinden.
2. Build-Einstellungen: **kein Build-Command nötig**, Publish-Verzeichnis = `.` (Projekt-Root). Diese Einstellung ist bereits in `netlify.toml` hinterlegt.
3. Deploy auslösen → Netlify vergibt automatisch eine permanente HTTPS-URL (`https://<projektname>.netlify.app`).
4. Optional: eigene Domain unter **Domain settings** hinterlegen.

## Deployment auf GitHub Pages

1. Dateien in ein GitHub-Repository pushen (Root-Verzeichnis reicht, kein `docs/`-Ordner nötig).
2. Im Repository unter **Settings → Pages**: Branch (z. B. `main`) und Ordner `/ (root)` auswählen.
3. GitHub veröffentlicht die Seite unter `https://<username>.github.io/<repository>/` (HTTPS automatisch aktiv).
4. Hinweis: GitHub Pages erlaubt keine eigenen Response-Header. Die App funktioniert trotzdem ohne Einschränkung, auch eingebettet in Microsoft Teams, da GitHub Pages standardmässig kein `X-Frame-Options` setzt.

## Deployment auf Vercel (optional, alternative)

1. `vercel` CLI installieren oder Projekt auf [vercel.com](https://vercel.com) importieren (Git-Repository oder Ordner-Upload).
2. Framework Preset: **Other / Static**, kein Build-Command, Output-Verzeichnis = `.`.
3. Deploy auslösen → permanente HTTPS-URL (`https://<projektname>.vercel.app`).

## KI-Integration konfigurieren (OpenAI)

Der Button „Mit KI generieren“ funktioniert erst, wenn auf Netlify ein OpenAI API-Key hinterlegt ist. **Ohne diesen Schritt bleibt der Prompt Builder voll nutzbar** — der KI-Bereich zeigt dann verständlich an, dass die Funktion noch nicht konfiguriert ist.

1. **OpenAI API Key erstellen**: auf [platform.openai.com/api-keys](https://platform.openai.com/api-keys) einloggen → **Create new secret key** → Key kopieren (beginnt mit `sk-…`, wird nur einmal angezeigt).
2. **Netlify öffnen**: die Seite des Sites im Netlify-Dashboard öffnen ([app.netlify.com](https://app.netlify.com)).
3. Im Menü **Site configuration** (Project configuration) öffnen.
4. Zu **Environment variables** navigieren.
5. **Add a variable** → **Add a single variable**:
   - Key: `OPENAI_API_KEY`
   - Value: der kopierte `sk-…`-Key
6. Unter **Scopes** nur **Functions** aktivieren, falls der Netlify-Plan diese Einschränkung anbietet (der Key wird dann ausschliesslich zur Build-/Function-Laufzeit gelesen, nicht ins Frontend-Bundle eingebettet).
7. **Save** → danach im Menü **Deploys** einen **neuen Deploy auslösen** (**Trigger deploy → Deploy site**), damit die Function die neue Umgebungsvariable erhält.
8. **KI-Funktion testen**: Seite öffnen → Team wählen → Prompt erstellen → „KI-Unterstützung“ auf „Vollständige Antwort generieren“ stellen → „Mit KI generieren“ klicken. Bei Erfolg erscheint die Antwort im Bereich „KI-Ergebnis“.

**Wichtig — API-Key niemals in GitHub, `app.js`, `index.html` oder `data.js` eintragen.** Der Key gehört ausschliesslich in die Netlify-Umgebungsvariable `OPENAI_API_KEY`. `netlify/functions/generate-ai.mjs` liest ihn nur serverseitig über `process.env.OPENAI_API_KEY` — er wird nie an den Browser gesendet und taucht in keiner Antwort der Function auf.

Das verwendete Modell ist in `netlify/functions/generate-ai.mjs` als zentrale Konstante `OPENAI_MODEL` (aktuell `gpt-4o-mini`) hinterlegt und kann dort jederzeit angepasst werden.

## Team-Board: Anmeldung & Rollen

Das Team-Board (Tab „📅 Team-Board“) zeigt Deadlines, geteilte Dateien und Aufgaben für **alle** Nutzer:innen offen an — dafür ist keine Konfiguration nötig, kein Passwort mehr.

Um etwas **hinzuzufügen, zu bearbeiten oder zu löschen**, wählt jede Person oben im Team-Board einfach ihren eigenen Namen aus einer nach Team gruppierten Liste ("Wer bist du?"). Das ist **kein echtes Login** — der Name wird gegen die im Code hinterlegte Team-Roster-Liste (`TEAM_ROSTER` in `data.js`, gespiegelt in `netlify/functions/shared-board.mjs`) geprüft, rein um sinnvolles Verhalten zu führen, nicht um böswillige Zugriffe zu verhindern. Passt zum Charakter eines kursinternen Tools ohne echten Auftraggeber-Datenschutzbedarf.

**Rechte:**
- Mitglieder der **Projektleitung** dürfen überall Aufgaben/Deadlines/Dateien anlegen, bearbeiten, löschen.
- Alle anderen dürfen das nur für **ihr eigenes Team** — serverseitig geprüft, nicht nur im UI versteckt.
- Deadlines und geteilte Dateien bleiben bewusst team-übergreifend offen bearbeitbar (kein striktes Team-Scoping, da sie oft mehrere Teams betreffen).

**Team-Roster aktualisieren** (neue Mitglieder, Rollenwechsel): die Liste `TEAM_ROSTER` steht an zwei Stellen — `data.js` (Anzeige/Frontend) und `netlify/functions/shared-board.mjs` (serverseitige Rechteprüfung). Beide bei Änderungen synchron halten.

Das Passwort wird pro Browser-Tab-Sitzung gemerkt (`sessionStorage`) — nach dem Entsperren muss es nicht bei jeder Aktion erneut eingegeben werden, aber nach Schliessen des Tabs schon wieder.

## Einbindung in Microsoft Teams

Nach dem Deployment kann die permanente HTTPS-URL direkt als **Website-Tab** in einem Teams-Kanal hinzugefügt werden (Tab **„+“ → Website → URL einfügen**). `netlify.toml` / `vercel.json` setzen bewusst keine restriktive `X-Frame-Options`, sondern eine `Content-Security-Policy: frame-ancestors`, die die Einbettung durch Microsoft-Teams-Domains explizit erlaubt.

## Aktualisierung der Website

- **Netlify / Vercel (Git-verbunden):** Änderungen committen und pushen – der Dienst deployed automatisch neu.
- **Netlify / Vercel (manueller Upload):** Aktualisierten Ordner erneut per Drag & Drop hochladen.
- **GitHub Pages:** Änderungen in den verbundenen Branch pushen; GitHub aktualisiert die Seite automatisch (kann bis zu einigen Minuten dauern).
- Beim Ändern von `style.css`, `data.js` oder `app.js` empfiehlt es sich, die Versionsnummer im Query-String (`?v=`) in `index.html` zu erhöhen, damit Browser-Caches die neue Version zuverlässig laden.

## Datenschutz

Alle Prompt-Builder-Eingaben werden ausschliesslich lokal im Browser des jeweiligen Nutzers gespeichert (`localStorage`). Hochgeladene Dateien werden **nicht** in `localStorage` gespeichert — sie liegen nur im Arbeitsspeicher der aktuellen Sitzung und werden ausschliesslich bei einem KI-Aufruf einmalig an die Netlify Function und von dort an OpenAI übermittelt (keine dauerhafte Speicherung serverseitig).

Es dürfen keine echten Gäste-, Mitarbeiter-, Kunden-, Gesundheits-, Zahlungs- oder anderen sensiblen Personendaten in Prompts oder hochgeladene Dateien eingegeben werden. Vor dem ersten Datei-Upload muss dies aktiv per Checkbox bestätigt werden. KI-Ergebnisse müssen vor operativer Verwendung von einem Teammitglied geprüft werden.

Team-Board-Deadlines und geteilte Dateien sind **absichtlich für alle offen lesbar** (Transparenz-Prinzip) und dauerhaft in Netlify Blobs gespeichert — auch hier gilt: keine sensiblen Personendaten in Titel, Beschreibung oder hochgeladenen Dateien.

## Team-Board: Umfang & geplanter nächster Ausbauschritt

Die aktuelle Version deckt **Deadlines** (mit Team-Zuordnung, Status offen/erledigt, Fälligkeits-Hervorhebung) und **geteilte Projektdateien** (zentral gespeichert, für alle herunterladbar) ab — passwortgeschützte Bearbeitung, offenes Lesen, automatisch als KI-Kontext eingebunden.

Bewusst **nicht** Teil dieser Version (geplant als nächste grössere Ausbaustufe, auf derselben Netlify/Blobs-Basis, ohne zusätzlichen Fremddienst):
- Task-Management pro Team mit Phasen/Roadmap-Fortschrittsanzeige
- Entscheidungs-Journal (FAKT/ANNAHME/EMPFEHLUNG/OFFENE FRAGE)
- Projektleitung-Übersichts-Dashboard mit Organigramm
- Namen-/rollenbasierte Rechte (Lead/Stv./Mitglied) anstelle eines gemeinsamen Passworts

Diese Priorisierung war eine bewusste Entscheidung: schneller ein echtes, getestetes Werkzeug live haben statt eines grösseren, länger dauernden Umbaus.

## Grenzen der KI-Integration (bewusste Design-Entscheidungen)

- **Limits**: max. 5 Dateien, je max. 3 MB, kombiniert max. 6 MB (Netlify-Function-Payload-Limit), max. 40'000 Zeichen extrahierter Kontext. Diese Werte sind in `data.js` (`FILE_UPLOAD_LIMITS`) und `netlify/functions/generate-ai.mjs` hinterlegt und können dort angepasst werden.
- **PDF**: wird unverändert (als Base64) an OpenAI übergeben — OpenAI liest den Inhalt nativ über die Responses API, es ist keine eigene PDF-Bibliothek nötig.
- **DOCX**: wird serverseitig mit einem minimalen, abhängigkeitsfreien ZIP/Inflate-Parser (nur `node:zlib`) zu Text extrahiert.
- **Rate-Limiting**: `generate-ai.mjs` enthält ein einfaches In-Memory-Rate-Limit pro IP als Grundschutz gegen versehentliche Mehrfach-Anfragen. Das ist bewusst minimal ("Vorbereitung") — es übersteht keinen Cold Start und keine mehreren Function-Instanzen gleichzeitig. Für echten Schutz bei grösserem Nutzerkreis: Netlifys Rate-Limiting-Add-on oder einen Netlify-Blobs-basierten Zähler ergänzen.
- Der bestehende Button **„Prompt verbessern“** bleibt bewusst 100&nbsp;% lokal und kostenlos (keine API-Anfrage) — er füllt weiterhin nur fehlende Felder heuristisch auf. Die *KI-gestützte* Prompt-Optimierung läuft über den neuen Button **„Mit KI generieren“** mit KI-Unterstützung „Prompt verbessern (KI)“, damit ein Klick auf den vertrauten Button nie unerwartet Kosten auslöst.
