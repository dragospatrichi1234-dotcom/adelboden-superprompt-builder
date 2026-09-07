/* ============================================================
   ADELBODEN 2027 – SUPERPROMPT BUILDER
   Domain data: teams, presets, risks, output formats, phases
   Source: Projekthandbuch Transfermodul Hospitality Live Experience,
   Aufgabenübersicht Sunrise VIP Cube, Team-Pitch Handout 251B
   ============================================================ */

const PROJECT_META = {
  eventDates: "7.–10. Januar 2027 (Mittwoch bis Sonntag)",
  location: "Sunrise VIP Cube, FIS Ski World Cup Adelboden 2027",
  guestsVip: 150,
  guestsClub: 300,
  auftraggeber: "Sunrise & Ski World Cup Adelboden, in Zusammenarbeit mit der Hotelfachschule Thun",
  leitgedanke: "Nicht in Abteilungen denken – in Schnittstellen denken."
};

const PHASES = [
  { id: "phase1", label: "Phase 1 – August: Projektstart & Analyse" },
  { id: "phase2", label: "Phase 2 – September: Analyse & Konzeptentwicklung" },
  { id: "phase3", label: "Phase 3 – Oktober: Gesamtkonzept & Pitch-Vorbereitung" },
  { id: "meilenstein", label: "Meilenstein – Pitch vor Herbstferien" },
  { id: "phase4", label: "Phase 4 – November: Detailplanung" },
  { id: "phase5", label: "Phase 5 – Dezember: Tests & Generalprobe" },
  { id: "phase6", label: "Phase 6 – Januar: Live Event" }
];

const OUTPUT_FORMATS = [
  "Tabelle", "Checkliste", "Konzept", "RACI-Matrix", "Roadmap",
  "Risiko-Register", "Customer Journey", "Ablaufplan", "Schichtplan",
  "Budget", "KPI-Dashboard", "Präsentationsstruktur", "SOP", "Briefing"
];

const STYLE_OPTIONS = [
  "professionell & sachlich", "kurz & prägnant", "ausführlich & erklärend",
  "motivierend & teamorientiert", "formell (für Auftraggeber)", "operativ & direkt (fürs Team)"
];

const RISK_CATALOG = [
  "Personalausfall", "Lieferverzögerung", "technische Probleme", "Stromausfall",
  "fehlendes Material", "Überfüllung", "Wartezeiten", "Hygiene", "Jugendschutz",
  "Budgetüberschreitung", "fehlende Bewilligung", "Kommunikationsfehler", "Sponsor-Konflikte"
];

const RISK_TABLE_HEADER = ["Risiko", "Wahrscheinlichkeit", "Auswirkung", "Prävention", "Sofortmassnahme", "Verantwortlich"];

const QUALITAETSCHECK_TEXT = `Überprüfe den Output vor der finalen Ausgabe auf Vollständigkeit, Realisierbarkeit, Widersprüche, Schnittstellen, Risiken und Einhaltung der Anforderungen. Verbessere den Output falls nötig.

Wenn wichtige Informationen fehlen, triff keine unbegründeten Annahmen. Kennzeichne offene Punkte klar und liste die Informationen auf, die für eine belastbare Entscheidung noch benötigt werden.`;

const PRIVACY_NOTICE = "Keine echten Gäste-, Mitarbeiter-, Kunden- oder sensiblen Personendaten in KI-Prompts eingeben. KI-Ergebnisse müssen vor operativer Verwendung von einem Teammitglied geprüft werden.";

/* ------------------------------------------------------------
   AI INTEGRATION CONFIG
   Mirrors netlify/functions/generate-ai.mjs — keep the model
   label in sync manually if the server-side constant changes.
   ------------------------------------------------------------ */

const AI_MODEL_LABEL = "gpt-4o-mini";

const AI_MODE_OPTIONS = [
  { id: "none", label: "Prompt nur erstellen", hint: "Keine KI-Anfrage — nur der lokale Prompt Builder." },
  { id: "improve", label: "Prompt verbessern (KI)", hint: "KI optimiert Formulierung & Klarheit des fertigen Prompts." },
  { id: "answer", label: "Vollständige Antwort generieren", hint: "KI beantwortet den fertigen Superprompt direkt." }
];

const FILE_UPLOAD_LIMITS = {
  maxFiles: 5,
  maxFileSizeBytes: 3 * 1024 * 1024,        // 3 MB pro Datei
  maxTotalSizeBytes: 6 * 1024 * 1024,       // 6 MB kombiniert (Netlify Function Payload-Limit)
  maxContextChars: 40000                     // harte Obergrenze für extrahierten Text, der an die KI geht
};

const ALLOWED_FILE_TYPES = {
  ".txt": { kind: "text", mime: "text/plain" },
  ".md": { kind: "text", mime: "text/markdown" },
  ".csv": { kind: "text", mime: "text/csv" },
  ".pdf": { kind: "pdf", mime: "application/pdf" },
  ".docx": { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
};

const AI_GUARDRAIL_TEXT = "Nutze die bereitgestellten Projektunterlagen als Wissensbasis. Erfinde keine Fakten, die darin nicht enthalten sind. Wenn Informationen fehlen oder widersprüchlich sind, kennzeichne dies klar.";

/* ------------------------------------------------------------
   PROJEKTWISSEN — offizielle Wissensbasis (Version 1: UI/Datenstruktur)
   In Version 1 sind dies nur Metadaten-Karten (Anzeige), noch ohne
   Datei-Backend. Spätere Version: echte Dateien hinterlegen/verlinken.
   ------------------------------------------------------------ */

const PROJECT_KNOWLEDGE_BASE = [
  {
    id: "projekthandbuch",
    title: "Projekthandbuch",
    description: "Transfermodul Hospitality Live Experience – vollständiger Projektrahmen, Phasen, Organisation, Kennzahlen.",
    status: "official"
  },
  {
    id: "aufgabenuebersicht",
    title: "Aufgabenübersicht Sunrise VIP Cube",
    description: "Zusammengeführte Aufgaben aus F&B, Operations & Logistik, Marketing und Sponsoring mit Terminen.",
    status: "official"
  },
  {
    id: "team-pitch",
    title: "Team-Pitch-Unterlagen",
    description: "Handout & Struktur für die Team-Pitches der Lead-Teams (Verantwortung, Ziel, Schnittstellen, offene Fragen).",
    status: "official"
  },
  {
    id: "weitere",
    title: "Weitere Projektdateien",
    description: "Platzhalter für zusätzliche offizielle Basisdokumente, die im Projektverlauf ergänzt werden.",
    status: "planned"
  }
];

/* ------------------------------------------------------------
   TEAM PRESETS
   Each team: id, name, icon, tagline, persona, fachgebiete,
   contextHint, topics (Team-Intelligenz chips), interfaces,
   relevantRisks (subset of RISK_CATALOG), requirementSuggestions,
   outputSuggestions
   ------------------------------------------------------------ */

const TEAMS = [
  {
    id: "projektleitung",
    name: "Projektleitung",
    icon: "🧭",
    tagline: "Gesamtkoordination & Entscheidungsmanagement",
    persona: "Erfahrene Projektleitung für Hospitality-Grossevents mit Verantwortung für Termine, Ressourcen und Schnittstellen",
    fachgebiete: ["Projektmanagement", "Stakeholder-Kommunikation", "Risikomanagement", "Entscheidungsmanagement"],
    contextHint: "Koordination aller operativen Bereiche und Stabsstellen des Sunrise VIP Cube über alle Projektphasen hinweg.",
    topics: ["Gesamtkoordination", "Termin- & Ressourcenplanung", "Projektsitzungen", "Kommunikation mit Auftraggebern", "Konflikt- & Entscheidungsmanagement", "Meilensteine", "Risikomanagement", "Reporting", "Schnittstellenmanagement", "Projektcontrolling"],
    interfaces: ["fnb", "guest", "sunrise", "ops", "marketing", "sponsoring", "sustainability", "finance"],
    relevantRisks: ["Kommunikationsfehler", "Budgetüberschreitung", "fehlende Bewilligung", "Personalausfall"],
    requirementSuggestions: ["Klare Verantwortlichkeiten (RACI)", "Meilensteintreue", "Transparentes Reporting", "Frühzeitige Risikoerkennung", "Abstimmung mit Lenkungsausschuss"],
    outputSuggestions: ["RACI-Matrix", "Roadmap", "Briefing", "KPI-Dashboard"]
  },
  {
    id: "fnb",
    name: "Food & Beverage Production",
    icon: "🍽️",
    tagline: "Menü, Produktion & Kalkulation",
    persona: "Erfahrene:r Küchenchef:in und F&B-Konzeptentwickler:in für Eventgastronomie mit Fokus auf Cook & Chill / Sous-vide",
    fachgebiete: ["Menüentwicklung", "Produktionsplanung", "HACCP & Food Safety", "Kalkulation & Food Waste"],
    contextHint: "Produktion erfolgt grösstenteils vorgängig an der Hotelfachschule Thun, vor Ort steht nur eine Regenerationsküche zur Verfügung.",
    topics: ["Menüentwicklung", "Frühstück / Lunch / Dinner", "Flying Food", "Produktionsplanung", "Rezepturen & Kalkulation", "Cook & Chill / Sous-vide", "Regeneration", "HACCP", "Food Waste", "Allergene & Portionierung"],
    interfaces: ["guest", "sunrise", "ops", "sustainability", "finance"],
    relevantRisks: ["Lieferverzögerung", "Hygiene", "fehlendes Material", "technische Probleme"],
    requirementSuggestions: ["HACCP-konform", "Kalkuliert für Gästezahl", "Cook & Chill / Sous-vide tauglich", "Food-Waste-minimierend", "Allergene dokumentiert"],
    outputSuggestions: ["Konzept", "Tabelle", "SOP", "Checkliste"]
  },
  {
    id: "guest",
    name: "Guest Experience & Service",
    icon: "🤝",
    tagline: "Customer Journey & VIP-Service",
    persona: "Erfahrene Guest Experience Managerin / Gastgeberin für VIP-Hospitality mit Fokus auf reibungslose Serviceabläufe",
    fachgebiete: ["Customer Journey", "Service-Konzept", "Gästelenkung", "Qualitätsstandards"],
    contextHint: "Obergeschoss des Cube, VIP Hospitality für bis zu 150 Gäste, Welcome Event, Frühstück, Lunch, Dinner.",
    topics: ["Customer Journey", "VIP-Service & Empfang", "Buffet- & Flying-Abläufe", "Gästelenkung", "Briefings", "Qualitätsstandards", "Seating", "Beschwerdemanagement", "Welcome Event"],
    interfaces: ["fnb", "sunrise", "ops", "marketing", "sustainability"],
    relevantRisks: ["Überfüllung", "Wartezeiten", "Personalausfall", "Kommunikationsfehler"],
    requirementSuggestions: ["Nahtlose Customer Journey", "Klare Briefings", "Hohe Servicegeschwindigkeit", "Konsistente Qualitätsstandards"],
    outputSuggestions: ["Customer Journey", "Ablaufplan", "Briefing", "SOP"]
  },
  {
    id: "sunrise",
    name: "Sunrise Club / Bar & Disco",
    icon: "🍹",
    tagline: "Barkonzept, Entertainment & Clubbetrieb",
    persona: "Erfahrene:r Barmanager:in / Clubleiter:in für Event-Bars mit hoher Servicegeschwindigkeit",
    fachgebiete: ["Barkonzept", "Getränkelogistik", "Entertainment", "Schichtplanung"],
    contextHint: "Erdgeschoss des Cube, Bar- und Discobereich für bis zu 300 Gäste, Freitag & Samstag 17:30–23:00 Uhr.",
    topics: ["Barkonzept", "Getränkesortiment", "Getränkelogistik", "Lager", "Schichtplanung", "DJ", "Entertainment", "Kasse", "Kühlung", "Strom", "Security", "Jugendschutz", "Branding", "Sponsoring", "Recycling", "Gästezufriedenheit"],
    interfaces: ["fnb", "ops", "guest", "sponsoring", "marketing", "sustainability", "finance"],
    relevantRisks: ["Jugendschutz", "Stromausfall", "Überfüllung", "technische Probleme", "Personalausfall"],
    requirementSuggestions: ["Hohe Servicegeschwindigkeit an der Bar", "Jugendschutz eingehalten", "Wirtschaftlicher Barbetrieb", "Attraktives Entertainment-Konzept"],
    outputSuggestions: ["Konzept", "Tabelle", "Risiko-Register", "Schichtplan"]
  },
  {
    id: "ops",
    name: "Operations & Logistics",
    icon: "🚚",
    tagline: "Infrastruktur, Material & Transport",
    persona: "Erfahrene Operations- & Logistikleitung für Grossveranstaltungen mit Fokus auf Kühlkette und Aufbau",
    fachgebiete: ["Infrastruktur", "Material & Lager", "Transport & Kühlkette", "Auf- & Abbau"],
    contextHint: "Übernahme und Aufbau des Cube am Mittwoch/Donnerstag, keine vollständige Produktionsküche vor Ort.",
    topics: ["Infrastruktur", "Material & Lager", "Transport", "Auf- & Abbau", "Lieferkoordination", "Kühlkette", "Strom", "Wasser", "Entsorgung", "Platzzuweisung", "Sicherheit", "Notfallplan"],
    interfaces: ["fnb", "guest", "sunrise", "sponsoring", "finance"],
    relevantRisks: ["Lieferverzögerung", "Stromausfall", "fehlendes Material", "technische Probleme"],
    requirementSuggestions: ["Lückenlose Kühlkette", "Realistischer Zeitplan für Auf-/Abbau", "Materialliste vollständig", "Notfallkonzept vorhanden"],
    outputSuggestions: ["Ablaufplan", "Checkliste", "Tabelle", "SOP"]
  },
  {
    id: "marketing",
    name: "Marketing & Kommunikation",
    icon: "📣",
    tagline: "Storytelling, Social Media & Branding",
    persona: "Erfahrene Marketing- & Kommunikationsverantwortliche für Event-Branding und Storytelling",
    fachgebiete: ["Kommunikationskonzept", "Social Media", "Storytelling", "Fotografie / Videografie"],
    contextHint: "Kommunikationskonzept muss bis Ende Phase 2 (September) stehen, laufende Bespielung des Instagram-Accounts bis Debriefing.",
    topics: ["Kommunikationskonzept", "Storytelling", "Social Media", "Fotografie / Videografie", "Pitch & Projektdokumentation", "Instagram", "Verlosung / Giveaway", "Branding", "Pressearbeit"],
    interfaces: ["sponsoring", "guest", "sunrise", "projektleitung"],
    relevantRisks: ["Kommunikationsfehler", "Sponsor-Konflikte"],
    requirementSuggestions: ["Konsistentes Branding", "Klarer Redaktionsplan", "Storytelling entlang der Customer Journey", "Rechtzeitige Foto-/Videodokumentation"],
    outputSuggestions: ["Konzept", "Roadmap", "Präsentationsstruktur", "Briefing"]
  },
  {
    id: "sponsoring",
    name: "Sponsoring",
    icon: "🤝",
    tagline: "Partnergewinnung & Gegenleistungen",
    persona: "Erfahrene Sponsoring-Managerin für Sportevents mit Fokus auf Partnerpflege und Vertragsgestaltung",
    fachgebiete: ["Sponsorensuche", "Vertragswesen", "Gegenleistungen", "Partnerbetreuung"],
    contextHint: "Sponsoren-Verträge spätestens 2 Monate vor Event, Sponsoring-Pakete Gold/Silber/Bronze rund 4 Monate vorher.",
    topics: ["Sponsorensuche", "Partnergewinnung", "Sponsoring-Pakete (Gold/Silber/Bronze)", "Gegenleistungen", "Branding & Partnerpflege", "Verträge", "Sponsorenbetreuung am Event"],
    interfaces: ["marketing", "finance", "sunrise", "ops", "projektleitung"],
    relevantRisks: ["Sponsor-Konflikte", "Budgetüberschreitung", "Kommunikationsfehler"],
    requirementSuggestions: ["Klare Sponsoring-Pakete", "Verbindliche Gegenleistungen", "Abstimmung mit Branding-Richtlinien", "Rechtzeitiger Vertragsabschluss"],
    outputSuggestions: ["Konzept", "Tabelle", "Briefing", "Roadmap"]
  },
  {
    id: "sustainability",
    name: "Sustainability & Quality",
    icon: "♻️",
    tagline: "Kreislaufwirtschaft & Qualitätssicherung",
    persona: "Erfahrene Nachhaltigkeits- & Qualitätsmanagerin im Hospitality-Bereich mit Fokus auf Kreislaufwirtschaft",
    fachgebiete: ["Kreislaufwirtschaft", "Food Waste & Mehrweg", "Qualitätsmanagement", "HACCP-Kontrollen"],
    contextHint: "Nachhaltigkeit folgt dem Prinzip 'Vermeiden vor Reduzieren vor Wiederverwenden vor Recyceln' über alle Bereiche hinweg.",
    topics: ["Kreislaufwirtschaft", "Food Waste & Mehrweg", "Qualitätsmanagement", "HACCP-Kontrollen", "Gästefeedback", "Abfalltrennung", "Nachhaltiger Einkauf", "KPIs"],
    interfaces: ["fnb", "guest", "sunrise", "ops"],
    relevantRisks: ["Hygiene", "Budgetüberschreitung"],
    requirementSuggestions: ["Messbare Nachhaltigkeits-KPIs", "Mehrweg vor Einweg", "HACCP-konforme Prozesse", "Food-Waste-Reduktion dokumentiert"],
    outputSuggestions: ["KPI-Dashboard", "Checkliste", "Konzept", "SOP"]
  },
  {
    id: "finance",
    name: "Finance & Controlling",
    icon: "💰",
    tagline: "Budget, Kalkulation & Kostenkontrolle",
    persona: "Erfahrene Controllerin für Event- und Gastronomiebudgets mit Fokus auf Soll-Ist-Vergleich",
    fachgebiete: ["Budgetplanung", "Kalkulation", "Einkauf & Offerten", "Nachkalkulation"],
    contextHint: "Budget wird ca. 1 Monat vor Event final geklärt; Bestellungen Food & Non-Food werden danach ausgelöst.",
    topics: ["Budget", "Kalkulation", "Einkauf & Offerten", "Kostenkontrolle", "Nachkalkulation", "Soll-Ist-Vergleich", "Reserven & Freigaben", "Sponsoringwert"],
    interfaces: ["fnb", "sunrise", "ops", "sponsoring", "projektleitung"],
    relevantRisks: ["Budgetüberschreitung", "fehlende Bewilligung"],
    requirementSuggestions: ["Transparente Budget-Forecast-Ist-Übersicht", "Freigabeprozess eingehalten", "Reserven eingeplant", "Nachvollziehbare Kalkulation"],
    outputSuggestions: ["Budget", "Tabelle", "KPI-Dashboard", "Risiko-Register"]
  }
];

function getTeamById(id) {
  return TEAMS.find(t => t.id === id);
}

function getTeamNamesByIds(ids) {
  return ids.map(id => {
    const t = getTeamById(id);
    return t ? t.name : id;
  });
}

/* ------------------------------------------------------------
   DEMO DATA (Beispiel laden)
   ------------------------------------------------------------ */
const DEMO_DATA = {
  mode: "advanced",
  teamId: "sunrise",
  aufgabe: "Entwickle ein professionelles Barkonzept für den Sunrise Club.",
  fachgebiet: "Barkonzept",
  ziel: "Hohe Gästezufriedenheit, schnelle Serviceprozesse und wirtschaftlicher Barbetrieb.",
  zielgruppe: "VIP-Gäste und Clubbesucher:innen des Sunrise VIP Cube, Freitag & Samstag Abend",
  gaesteanzahl: "300",
  phase: "phase3",
  requirements: ["Hohe Servicegeschwindigkeit an der Bar", "Jugendschutz eingehalten", "Wirtschaftlicher Barbetrieb", "Attraktives Entertainment-Konzept"],
  interfaces: ["fnb", "ops", "sponsoring", "marketing"],
  riskModuleEnabled: true,
  risks: ["Jugendschutz", "Stromausfall", "Überfüllung", "technische Probleme"],
  outputFormats: ["Konzept", "Tabelle", "Risiko-Register"],
  style: "professionell & sachlich"
};
