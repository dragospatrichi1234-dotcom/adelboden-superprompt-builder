# Adelboden 2027 – Superprompt Builder

Visueller KI-Prompt-Builder für das Transfermodul **Hospitality Live Experience – Sunrise VIP Cube**, FIS Ski World Cup Adelboden 2027 (Hotelfachschule Thun).

Jedes Teammitglied kann ohne Prompt-Engineering-Kenntnisse in 3–5 Minuten einen professionellen, nach fester Struktur aufgebauten KI-Prompt erstellen (Quick Mode & Advanced Mode), inkl. Team-Intelligenz, Risiko-Modul, Live-Vorschau und Prompt Quality Score.

Die App ist eine **reine Client-Anwendung** – kein Backend, kein Build-Schritt, keine externen Laufzeit-Abhängigkeiten. Alle Eingaben werden ausschliesslich lokal im Browser (`localStorage`) des jeweiligen Nutzers gespeichert; es werden keine Daten an einen Server übertragen.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Struktur, Meta-Tags, Favicon |
| `style.css` | Design-System (Swiss Hospitality / Event-Look) |
| `data.js` | Projektdaten: Teams, Presets, Risiken, Output-Formate, Demo-Daten |
| `app.js` | Anwendungslogik: State, Rendering, Prompt-Generierung, Score, Export |
| `netlify.toml` | Deployment-Konfiguration für Netlify (Header, Caching) |
| `vercel.json` | Deployment-Konfiguration für Vercel (Header, Caching) |
| `.claude/launch.json` | Nur für lokale Entwicklung: startet einen einfachen Ruby-Testserver |

Es gibt **keinen Build-Schritt** – die vier Kern-Dateien (`index.html`, `style.css`, `data.js`, `app.js`) werden unverändert ausgeliefert.

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

## Einbindung in Microsoft Teams

Nach dem Deployment kann die permanente HTTPS-URL direkt als **Website-Tab** in einem Teams-Kanal hinzugefügt werden (Tab **„+“ → Website → URL einfügen**). `netlify.toml` / `vercel.json` setzen bewusst keine restriktive `X-Frame-Options`, sondern eine `Content-Security-Policy: frame-ancestors`, die die Einbettung durch Microsoft-Teams-Domains explizit erlaubt.

## Aktualisierung der Website

- **Netlify / Vercel (Git-verbunden):** Änderungen committen und pushen – der Dienst deployed automatisch neu.
- **Netlify / Vercel (manueller Upload):** Aktualisierten Ordner erneut per Drag & Drop hochladen.
- **GitHub Pages:** Änderungen in den verbundenen Branch pushen; GitHub aktualisiert die Seite automatisch (kann bis zu einigen Minuten dauern).
- Beim Ändern von `style.css`, `data.js` oder `app.js` empfiehlt es sich, die Versionsnummer im Query-String (`?v=`) in `index.html` zu erhöhen, damit Browser-Caches die neue Version zuverlässig laden.

## Datenschutz

Alle Eingaben werden ausschliesslich lokal im Browser des jeweiligen Nutzers gespeichert (`localStorage`), nicht an einen Server übertragen. Es dürfen keine echten Gäste-, Mitarbeiter-, Kunden- oder sensiblen Personendaten in die Prompts eingegeben werden. KI-Ergebnisse müssen vor operativer Verwendung von einem Teammitglied geprüft werden.
