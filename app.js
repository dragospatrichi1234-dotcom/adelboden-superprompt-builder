/* ============================================================
   ADELBODEN 2027 – SUPERPROMPT BUILDER
   Application logic (no backend, localStorage only)
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "adelboden2027_superprompt_state_v1";

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */

  function initialState() {
    return {
      mode: "quick",
      teamId: null,
      aufgabe: "",
      persona: "",
      fachgebiet: "",
      kontext: "",
      ziel: "",
      zielgruppe: "",
      gaesteanzahl: "",
      phase: "",
      requirementPool: [],
      requirements: [],
      interfaces: [],
      riskModuleEnabled: false,
      risks: [],
      outputFormats: [],
      style: "",
      aiMode: "none",
      aiOptimizedPrompt: null,
      useOptimizedPrompt: false,
      aiResult: null,
      aiResultModel: null,
      lastAiTask: null
    };
  }

  let state = initialState();

  // Uploaded files & upload consent live OUTSIDE the persisted state on
  // purpose: file content (base64/text, potentially project-sensitive)
  // should not linger in localStorage across sessions/devices.
  let uploadedFiles = [];
  let uploadConsentGiven = false;
  let aiRequestInFlight = false;
  let fileIdCounter = 0;

  // Team-Board: shared, persistent (Netlify Blobs) data — always fetched
  // fresh from the server, never stored in the local `state`/localStorage.
  const BOARD_PASSWORD_SESSION_KEY = "adelboden2027_board_password";
  let boardDeadlines = [];
  let boardFiles = [];
  let boardDeadlinesLoaded = false;
  let boardUnlocked = false;
  let boardEditPassword = "";
  let deadlineTeamFilterValue = "all";
  let pendingDeadlineTeamIds = [];
  let pendingSharedFileTeamIds = [];
  let selectedSharedFile = null;

  /* ---------------------------------------------------------
     PERSISTENCE
     --------------------------------------------------------- */

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable — ignore, app still works in-memory */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Object.assign(initialState(), parsed);
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------
     DEFAULT TEXT BUILDERS
     --------------------------------------------------------- */

  function buildDefaultKontext(team) {
    return `Der Sunrise VIP Cube ist Teil des ${PROJECT_META.location.split(",")[0]} (${PROJECT_META.eventDates}). Auftraggeber: ${PROJECT_META.auftraggeber}. VIP Hospitality im Obergeschoss (ca. ${PROJECT_META.guestsVip} Gäste), Sunrise Club im Erdgeschoss (ca. ${PROJECT_META.guestsClub} Gäste). ${team.contextHint}`;
  }

  function buildDefaultZiel(team) {
    return `Professionelle, gästeorientierte und wirtschaftliche Umsetzung im Bereich ${team.name} — im Einklang mit den übrigen Bereichen des Sunrise VIP Cube.`;
  }

  function buildDefaultZielgruppe(team) {
    const names = getTeamNamesByIds(team.interfaces);
    return `Team ${team.name}, Projektleitung sowie relevante Schnittstellenteams (${names.join(", ")}).`;
  }

  /* ---------------------------------------------------------
     TEAM SELECTION
     --------------------------------------------------------- */

  function selectTeam(teamId) {
    const team = getTeamById(teamId);
    if (!team) return;
    state.teamId = teamId;
    state.persona = team.persona;
    state.fachgebiet = team.fachgebiete[0] || "";
    state.kontext = buildDefaultKontext(team);
    state.ziel = buildDefaultZiel(team);
    state.zielgruppe = buildDefaultZielgruppe(team);
    state.requirementPool = [...team.requirementSuggestions];
    state.requirements = [...team.requirementSuggestions];
    state.interfaces = [...team.interfaces];
    state.riskModuleEnabled = true;
    state.risks = [...team.relevantRisks];
    state.outputFormats = [...team.outputSuggestions];
    state.style = STYLE_OPTIONS[0];
    renderAll();
    saveState();
  }

  /* ---------------------------------------------------------
     GENERIC CHIP TOGGLE HELPER
     --------------------------------------------------------- */

  function toggleInArray(arr, value) {
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value);
    else arr.splice(idx, 1);
  }

  function renderChipGroup(container, pool, selectedArr, onToggle, extraClass) {
    container.innerHTML = "";
    pool.forEach(value => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selectedArr.includes(value) ? " is-selected" : "") + (extraClass ? " " + extraClass : "");
      btn.textContent = value;
      btn.addEventListener("click", () => {
        onToggle(value);
        renderAll();
        saveState();
      });
      container.appendChild(btn);
    });
  }

  /* ---------------------------------------------------------
     DOM REFERENCES
     --------------------------------------------------------- */

  const el = {};
  function cacheEls() {
    [
      "modeQuickBtn", "modeAdvancedBtn", "progressFill",
      "teamGrid", "teamInfo",
      "quickFields", "advancedFields",
      "quickAufgabe", "quickOutputChips",
      "advAufgabe", "advPersona", "advFachgebiet", "advKontext",
      "advZiel", "advZielgruppe", "advGaeste", "advPhase",
      "teamTopics", "requirementChips", "requirementCustomInput", "requirementAddBtn",
      "interfaceChips", "riskToggle", "riskChips", "outputChips", "advStyle",
      "generateBtn", "improveBtn", "demoBtn", "resetBtn",
      "scoreRing", "scoreRingProgress", "scoreNumber", "scoreLabel", "scoreSuggestions",
      "promptOutput", "copyBtn", "exportTxtBtn", "exportMdBtn", "toast",
      "filesToggle", "filesBody", "uploadConsent", "dropzone", "fileInput",
      "fileSelectBtn", "fileList",
      "aiModeSelect", "aiModeHint", "contextCharCount", "aiGenerateBtn",
      "promptOverrideBadge", "revertOverrideBtn",
      "aiResultToggle", "aiResultBody", "aiModelStatus",
      "aiLoading", "aiLoadingText", "aiError",
      "aiCompare", "aiCompareOriginal", "aiCompareOptimized", "aiAcceptBtn", "aiDiscardBtn",
      "aiAnswerWrap", "aiAnswer", "aiCopyBtn", "aiExportMdBtn", "aiRegenerateBtn", "aiClearBtn",
      "aiEmptyHint",
      "navBuilderBtn", "navBoardBtn", "builderPage", "boardPage", "goToBoardFilesBtn",
      "editLock", "editLockStatus", "unlockPasswordInput", "unlockEditBtn", "unlockConfirmBtn",
      "deadlineTeamFilter", "deadlineList", "deadlineEmptyHint", "addDeadlineBtn",
      "deadlineForm", "deadlineTitleInput", "deadlineDateInput", "deadlineTeamChips",
      "deadlineDescInput", "deadlineSaveBtn", "deadlineCancelBtn",
      "sharedFileList", "sharedFileEmptyHint", "showSharedFileFormBtn",
      "sharedFileUploadForm", "sharedFileInput", "sharedFileSelectBtn", "sharedFileSelectedName",
      "sharedFileDescInput", "sharedFileTeamChips", "sharedFileUploadBtn", "sharedFileCancelBtn",
      "importantFileList", "importantFileEmptyHint",
      "otherFilesToggle", "otherFilesToggleLabel", "otherFilesBody", "sharedFileSearch",
      "sharedFileImportantCheckbox"
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  /* ---------------------------------------------------------
     GENERAL HELPERS (escaping, formatting, markdown)
     --------------------------------------------------------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function humanFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }

  function extFromName(name) {
    const m = /\.[^.]+$/.exec(name || "");
    return m ? m[0].toLowerCase() : "";
  }

  function fileIconFor(kind) {
    if (kind === "pdf") return "📕";
    if (kind === "docx") return "📄";
    return "📝";
  }

  // Minimal, dependency-free Markdown → safe HTML renderer.
  // Escapes everything first, THEN applies markdown formatting on top —
  // this is what keeps rendering an untrusted AI response safe from
  // injected HTML/script (the escaped text never re-introduces real tags).
  function renderMarkdownSafe(md) {
    const escaped = escapeHtml(md || "");
    const lines = escaped.split(/\r?\n/);
    let html = "";
    let inList = null;
    let tableBuffer = [];

    function inlineMd(text) {
      return text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.+?)`/g, "<code>$1</code>");
    }
    function flushList() {
      if (inList) { html += `</${inList}>`; inList = null; }
    }
    function flushTable() {
      if (!tableBuffer.length) return;
      const rows = tableBuffer.filter(r => !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(r));
      tableBuffer = [];
      if (!rows.length) return;
      const cellsOf = (r) => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const header = cellsOf(rows[0]);
      html += "<table><thead><tr>" + header.map(c => `<th>${inlineMd(c)}</th>`).join("") + "</tr></thead><tbody>";
      for (let i = 1; i < rows.length; i++) {
        html += "<tr>" + cellsOf(rows[i]).map(c => `<td>${inlineMd(c)}</td>`).join("") + "</tr>";
      }
      html += "</tbody></table>";
    }

    for (const line of lines) {
      if (/^\s*\|.*\|\s*$/.test(line)) { tableBuffer.push(line.trim()); continue; }
      if (tableBuffer.length) flushTable();

      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      if (h) { flushList(); const lvl = h[1].length; html += `<h${lvl}>${inlineMd(h[2])}</h${lvl}>`; continue; }

      const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ol) { if (inList !== "ol") { flushList(); html += "<ol>"; inList = "ol"; } html += `<li>${inlineMd(ol[1])}</li>`; continue; }

      const ul = /^\s*[-*]\s+(.*)$/.exec(line);
      if (ul) { if (inList !== "ul") { flushList(); html += "<ul>"; inList = "ul"; } html += `<li>${inlineMd(ul[1])}</li>`; continue; }

      flushList();
      if (line.trim() === "") continue;
      html += `<p>${inlineMd(line)}</p>`;
    }
    flushList();
    flushTable();
    return html;
  }

  /* ---------------------------------------------------------
     RENDER: TEAM GRID
     --------------------------------------------------------- */

  function renderTeamGrid() {
    el.teamGrid.innerHTML = "";
    TEAMS.forEach(team => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-card" + (state.teamId === team.id ? " is-selected" : "");
      btn.innerHTML = `<span class="team-icon">${team.icon}</span><span class="team-name">${team.name}</span><span class="team-tagline">${team.tagline}</span>`;
      btn.addEventListener("click", () => selectTeam(team.id));
      el.teamGrid.appendChild(btn);
    });

    if (state.teamId) {
      const team = getTeamById(state.teamId);
      const names = getTeamNamesByIds(team.interfaces);
      el.teamInfo.classList.remove("hidden");
      el.teamInfo.innerHTML = `<strong>${team.name}:</strong> ${team.tagline}. Relevante Schnittstellen: ${names.join(", ")}.`;
    } else {
      el.teamInfo.classList.add("hidden");
    }
  }

  /* ---------------------------------------------------------
     RENDER: QUICK FIELDS
     --------------------------------------------------------- */

  function renderQuickFields() {
    if (document.activeElement !== el.quickAufgabe) el.quickAufgabe.value = state.aufgabe;
    renderChipGroup(el.quickOutputChips, OUTPUT_FORMATS, state.outputFormats, v => toggleInArray(state.outputFormats, v));
  }

  /* ---------------------------------------------------------
     RENDER: ADVANCED FIELDS
     --------------------------------------------------------- */

  function renderAdvancedFields() {
    if (document.activeElement !== el.advAufgabe) el.advAufgabe.value = state.aufgabe;
    if (document.activeElement !== el.advPersona) el.advPersona.value = state.persona;
    if (document.activeElement !== el.advKontext) el.advKontext.value = state.kontext;
    if (document.activeElement !== el.advZiel) el.advZiel.value = state.ziel;
    if (document.activeElement !== el.advZielgruppe) el.advZielgruppe.value = state.zielgruppe;
    if (document.activeElement !== el.advGaeste) el.advGaeste.value = state.gaesteanzahl;

    // Fachgebiet options depend on selected team
    const team = getTeamById(state.teamId);
    const fachgebiete = team ? team.fachgebiete : [];
    el.advFachgebiet.innerHTML = "";
    if (fachgebiete.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "– zuerst Team wählen –";
      el.advFachgebiet.appendChild(opt);
    } else {
      fachgebiete.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f;
        if (f === state.fachgebiet) opt.selected = true;
        el.advFachgebiet.appendChild(opt);
      });
    }

    // Phase options
    if (el.advPhase.options.length === 0) {
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "– Projektphase wählen –";
      el.advPhase.appendChild(emptyOpt);
      PHASES.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        el.advPhase.appendChild(opt);
      });
    }
    el.advPhase.value = state.phase;

    // Style options
    if (el.advStyle.options.length === 0) {
      STYLE_OPTIONS.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        el.advStyle.appendChild(opt);
      });
    }
    el.advStyle.value = state.style || STYLE_OPTIONS[0];

    // Team-Intelligenz topic chips
    el.teamTopics.innerHTML = "";
    if (team) {
      team.topics.forEach(topic => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip chip-topic" + (state.requirements.includes(topic) ? " is-selected" : "");
        btn.textContent = topic;
        btn.addEventListener("click", () => {
          if (!state.requirementPool.includes(topic)) state.requirementPool.push(topic);
          toggleInArray(state.requirements, topic);
          renderAll();
          saveState();
        });
        el.teamTopics.appendChild(btn);
      });
    }

    // Requirements
    renderChipGroup(el.requirementChips, state.requirementPool, state.requirements, v => toggleInArray(state.requirements, v));

    // Interfaces (all teams except self)
    const interfacePool = TEAMS.filter(t => t.id !== state.teamId).map(t => t.id);
    el.interfaceChips.innerHTML = "";
    interfacePool.forEach(tid => {
      const t = getTeamById(tid);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.interfaces.includes(tid) ? " is-selected" : "");
      btn.textContent = t.name;
      btn.addEventListener("click", () => {
        toggleInArray(state.interfaces, tid);
        renderAll();
        saveState();
      });
      el.interfaceChips.appendChild(btn);
    });

    // Risk module
    el.riskToggle.checked = state.riskModuleEnabled;
    el.riskChips.classList.toggle("is-enabled", state.riskModuleEnabled);
    renderChipGroup(el.riskChips, RISK_CATALOG, state.risks, v => toggleInArray(state.risks, v));

    // Output formats (advanced)
    renderChipGroup(el.outputChips, OUTPUT_FORMATS, state.outputFormats, v => toggleInArray(state.outputFormats, v));
  }

  /* ---------------------------------------------------------
     RENDER: MODE / PROGRESS
     --------------------------------------------------------- */

  function renderMode() {
    const isQuick = state.mode === "quick";
    el.modeQuickBtn.classList.toggle("is-active", isQuick);
    el.modeAdvancedBtn.classList.toggle("is-active", !isQuick);
    el.modeQuickBtn.setAttribute("aria-selected", String(isQuick));
    el.modeAdvancedBtn.setAttribute("aria-selected", String(!isQuick));
    el.quickFields.classList.toggle("hidden", !isQuick);
    el.advancedFields.classList.toggle("hidden", isQuick);
  }

  function renderProgress() {
    const checks = [
      !!state.teamId,
      state.aufgabe.trim().length > 0,
      state.ziel.trim().length > 0,
      state.zielgruppe.trim().length > 0,
      state.requirements.length > 0,
      state.interfaces.length > 0,
      state.outputFormats.length > 0
    ];
    const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    el.progressFill.style.width = pct + "%";
  }

  /* ---------------------------------------------------------
     PROMPT GENERATION
     --------------------------------------------------------- */

  function buildSections() {
    const team = getTeamById(state.teamId);
    const teamName = team ? team.name : "[Team nicht ausgewählt]";

    const rahmendaten = [
      `- Team: ${teamName}`,
      `- Event: ${PROJECT_META.location}`,
      `- Zeitraum: ${PROJECT_META.eventDates}`
    ];
    if (state.gaesteanzahl) rahmendaten.push(`- Gästezahl: ${state.gaesteanzahl}`);
    if (state.phase) {
      const p = PHASES.find(ph => ph.id === state.phase);
      if (p) rahmendaten.push(`- Projektphase: ${p.label}`);
    }

    const kontextBody = (state.kontext.trim() || "[Kontext nicht beschrieben]") + "\n\nRahmendaten:\n" + rahmendaten.join("\n");

    const anforderungenBody = state.requirements.length
      ? state.requirements.map(r => `- ${r}`).join("\n")
      : "[Keine Anforderungen definiert]";

    const schnittstellenNames = getTeamNamesByIds(state.interfaces);
    const schnittstellenBody = `${PROJECT_META.leitgedanke}\n\n` + (schnittstellenNames.length
      ? schnittstellenNames.map(n => `- ${n}`).join("\n")
      : "[Keine Schnittstellen ausgewählt]");

    let risikenBody;
    if (state.riskModuleEnabled && state.risks.length) {
      risikenBody = `Erstelle für folgende Risiken eine strukturierte Risikoanalyse mit den Spalten: ${RISK_TABLE_HEADER.join(" | ")}.\n\n` +
        state.risks.map(r => `- ${r}`).join("\n");
    } else if (state.riskModuleEnabled) {
      risikenBody = "Risikoanalyse aktiviert, aber es wurden noch keine Risiken ausgewählt.";
    } else {
      risikenBody = "Risikoanalyse ist für diesen Prompt nicht aktiviert.";
    }

    const outputBody = state.outputFormats.length
      ? `Liefere den Output in folgendem/folgenden Format(en): ${state.outputFormats.join(", ")}.`
      : "[Kein Output-Format ausgewählt]";

    return [
      { n: 1, title: "PERSONA / ROLLE", body: (state.persona.trim() || "[KI-Persona nicht definiert]") + (state.fachgebiet ? ` Schwerpunkt: ${state.fachgebiet}.` : "") },
      { n: 2, title: "AUFGABE", body: state.aufgabe.trim() || "[Aufgabe nicht beschrieben]" },
      { n: 3, title: "KONTEXT", body: kontextBody },
      { n: 4, title: "ZIEL", body: state.ziel.trim() || "[Ziel nicht formuliert]" },
      { n: 5, title: "ZIELGRUPPE", body: state.zielgruppe.trim() || "[Zielgruppe nicht definiert]" },
      { n: 6, title: "ANFORDERUNGEN", body: anforderungenBody },
      { n: 7, title: "SCHNITTSTELLEN", body: schnittstellenBody },
      { n: 8, title: "RISIKEN", body: risikenBody },
      { n: 9, title: "OUTPUT-FORMAT", body: outputBody },
      { n: 10, title: "STIL & TONALITÄT", body: state.style || "[Stil nicht gewählt]" },
      { n: 11, title: "QUALITÄTSCHECK", body: QUALITAETSCHECK_TEXT }
    ];
  }

  function generatePlainText() {
    if (!state.teamId) {
      return "👈 Wähle zuerst ein Team aus, um deinen Superprompt zu erstellen.\n\nQuick Mode: Team → Aufgabe → gewünschtes Ergebnis genügen bereits für einen vollständigen Prompt.";
    }
    return buildSections().map(s => `${s.n}. ${s.title}\n${s.body}`).join("\n\n");
  }

  function generateMarkdown() {
    const team = getTeamById(state.teamId);
    const header = `# Superprompt — ${team ? team.name : "Adelboden 2027"}\n\n*Generiert mit dem Adelboden 2027 Superprompt Builder — Hospitality Live Experience, Sunrise VIP Cube*\n\n`;
    if (!state.teamId) return header + "_Bitte zuerst ein Team auswählen._";
    return header + buildSections().map(s => `## ${s.n}. ${s.title}\n\n${s.body}`).join("\n\n");
  }

  function getActivePromptText() {
    return (state.useOptimizedPrompt && state.aiOptimizedPrompt) ? state.aiOptimizedPrompt : generatePlainText();
  }

  function renderPreview() {
    const useOverride = !!(state.useOptimizedPrompt && state.aiOptimizedPrompt);
    el.promptOutput.textContent = useOverride ? state.aiOptimizedPrompt : generatePlainText();
    if (el.promptOverrideBadge) el.promptOverrideBadge.classList.toggle("hidden", !useOverride);
    updateContextCharCount();
  }

  /* ---------------------------------------------------------
     QUALITY SCORE
     --------------------------------------------------------- */

  function computeScore() {
    if (!state.teamId) {
      return { score: 0, suggestions: ["Wähle ein Team aus, um mit der Bewertung zu starten."] };
    }

    const parts = {};
    parts.aufgabe = Math.min(state.aufgabe.trim().length / 20, 1);
    parts.kontext = Math.min(state.kontext.trim().length / 40, 1);
    parts.ziel = Math.min(state.ziel.trim().length / 15, 1);
    parts.zielgruppe = Math.min(state.zielgruppe.trim().length / 8, 1);
    parts.anforderungen = Math.min(state.requirements.length / 3, 1);
    parts.schnittstellen = Math.min(state.interfaces.length / 2, 1);
    parts.risiken = state.riskModuleEnabled ? Math.min(state.risks.length / 3, 1) : 0.4;
    parts.outputFormat = state.outputFormats.length >= 2 ? 1 : (state.outputFormats.length === 1 ? 0.6 : 0);
    parts.stil = state.style ? 1 : 0;

    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    const score = Math.round((sum / Object.keys(parts).length) * 100);

    const suggestions = [];
    if (parts.aufgabe < 1) suggestions.push("Beschreibe die Aufgabe etwas konkreter.");
    if (parts.kontext < 1) suggestions.push("Ergänze mehr Kontext (Rahmenbedingungen, Phase).");
    if (parts.ziel < 1) suggestions.push("Formuliere ein klareres Ziel.");
    if (parts.zielgruppe < 1) suggestions.push("Definiere die Zielgruppe genauer.");
    if (parts.anforderungen < 1) suggestions.push("Füge mindestens 3 Anforderungen hinzu.");
    if (parts.schnittstellen < 1) suggestions.push("Wähle mindestens 2 Schnittstellen aus.");
    if (parts.risiken < 1) suggestions.push(state.riskModuleEnabled ? "Wähle mindestens 3 Risiken aus." : "Aktiviere die Risikoanalyse für mehr Robustheit.");
    if (parts.outputFormat < 1) suggestions.push("Wähle mindestens 2 Output-Formate aus.");
    if (parts.stil < 1) suggestions.push("Wähle einen Stil & Tonalität aus.");

    return { score, suggestions };
  }

  function renderScore() {
    const { score, suggestions } = computeScore();
    let band = 0, label = "Zu wenig Informationen";
    if (score >= 90) { band = 3; label = "SUPERPROMPT – READY"; }
    else if (score >= 70) { band = 2; label = "Sehr guter Prompt"; }
    else if (score >= 40) { band = 1; label = "Solider Prompt"; }

    el.scoreRing.className = "score-ring score-band-" + band;
    el.scoreNumber.textContent = String(score);
    el.scoreLabel.textContent = label;

    const circumference = 326.7;
    el.scoreRingProgress.style.strokeDashoffset = String(circumference * (1 - score / 100));

    el.scoreSuggestions.innerHTML = "";
    if (suggestions.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Alle Kategorien vollständig ausgefüllt.";
      el.scoreSuggestions.appendChild(li);
    } else {
      suggestions.forEach(s => {
        const li = document.createElement("li");
        li.textContent = s;
        el.scoreSuggestions.appendChild(li);
      });
    }
  }

  /* ---------------------------------------------------------
     RENDER ALL
     --------------------------------------------------------- */

  function renderAll() {
    renderMode();
    renderTeamGrid();
    renderQuickFields();
    renderAdvancedFields();
    renderProgress();
    renderPreview();
    renderScore();
  }

  /* ---------------------------------------------------------
     TOAST
     --------------------------------------------------------- */

  let toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2200);
  }

  /* ---------------------------------------------------------
     COPY / EXPORT
     --------------------------------------------------------- */

  function copyTextToClipboard(text, successMsg) {
    const done = () => showToast(successMsg);
    const fail = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        showToast("Kopieren fehlgeschlagen — bitte manuell markieren.");
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      fail();
    }
  }

  function copyPrompt() {
    copyTextToClipboard(getActivePromptText(), "In Zwischenablage kopiert!");
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportTxt() {
    if (!state.teamId) { showToast("Bitte zuerst ein Team auswählen."); return; }
    const team = getTeamById(state.teamId);
    downloadFile(`superprompt_${team.id}.txt`, getActivePromptText(), "text/plain;charset=utf-8");
    showToast("TXT exportiert.");
  }

  function exportMd() {
    if (!state.teamId) { showToast("Bitte zuerst ein Team auswählen."); return; }
    const team = getTeamById(state.teamId);
    const content = (state.useOptimizedPrompt && state.aiOptimizedPrompt)
      ? `# Superprompt (KI-optimiert) — ${team.name}\n\n${state.aiOptimizedPrompt}`
      : generateMarkdown();
    downloadFile(`superprompt_${team.id}.md`, content, "text/markdown;charset=utf-8");
    showToast("Markdown exportiert.");
  }

  /* ---------------------------------------------------------
     COLLAPSIBLE SECTIONS
     --------------------------------------------------------- */

  function bindCollapsible(headerEl, bodyEl) {
    headerEl.addEventListener("click", () => {
      const expanded = headerEl.getAttribute("aria-expanded") === "true";
      headerEl.setAttribute("aria-expanded", String(!expanded));
      bodyEl.classList.toggle("hidden", expanded);
    });
  }

  function expandCollapsible(headerEl, bodyEl) {
    headerEl.setAttribute("aria-expanded", "true");
    bodyEl.classList.remove("hidden");
  }


  /* ---------------------------------------------------------
     FILE UPLOAD (Projektdateien als Kontext)
     --------------------------------------------------------- */

  function syncUploadConsentUi() {
    el.fileSelectBtn.disabled = !uploadConsentGiven;
    el.dropzone.classList.toggle("is-disabled", !uploadConsentGiven);
  }

  function addFiles(fileListInput) {
    if (!uploadConsentGiven) {
      showToast("Bitte zuerst die Datenschutz-Bestätigung ankreuzen.");
      return;
    }
    const incoming = Array.from(fileListInput);

    for (const file of incoming) {
      if (uploadedFiles.length >= FILE_UPLOAD_LIMITS.maxFiles) {
        showToast(`Maximal ${FILE_UPLOAD_LIMITS.maxFiles} Dateien erlaubt.`);
        break;
      }
      const ext = extFromName(file.name);
      const typeInfo = ALLOWED_FILE_TYPES[ext];
      const id = "f" + (++fileIdCounter);

      if (!typeInfo) {
        uploadedFiles.push({ id, name: file.name, size: file.size, kind: null, status: "error", errorMsg: `Dateityp "${ext || "?"}" wird nicht unterstützt.` });
        continue;
      }
      if (file.size === 0) {
        uploadedFiles.push({ id, name: file.name, size: file.size, kind: typeInfo.kind, status: "error", errorMsg: "Datei ist leer." });
        continue;
      }
      if (file.size > FILE_UPLOAD_LIMITS.maxFileSizeBytes) {
        uploadedFiles.push({ id, name: file.name, size: file.size, kind: typeInfo.kind, status: "error", errorMsg: `Datei zu gross (max. ${Math.round(FILE_UPLOAD_LIMITS.maxFileSizeBytes / 1024 / 1024)} MB).` });
        continue;
      }
      const totalSoFar = uploadedFiles.reduce((sum, f) => sum + (f.status !== "error" ? f.size : 0), 0);
      if (totalSoFar + file.size > FILE_UPLOAD_LIMITS.maxTotalSizeBytes) {
        uploadedFiles.push({ id, name: file.name, size: file.size, kind: typeInfo.kind, status: "error", errorMsg: "Kombinierte Dateigrösse überschreitet das Limit." });
        continue;
      }

      const entry = { id, name: file.name, size: file.size, kind: typeInfo.kind, mime: typeInfo.mime, status: "processing", errorMsg: "" };
      uploadedFiles.push(entry);

      const reader = new FileReader();
      if (typeInfo.kind === "text") {
        reader.onload = () => {
          entry.text = String(reader.result || "");
          entry.status = "ready";
          renderFileList();
        };
        reader.onerror = () => { entry.status = "error"; entry.errorMsg = "Datei konnte nicht gelesen werden."; renderFileList(); };
        reader.readAsText(file);
      } else {
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          entry.base64 = dataUrl.split(",")[1] || "";
          entry.status = "ready";
          renderFileList();
        };
        reader.onerror = () => { entry.status = "error"; entry.errorMsg = "Datei konnte nicht gelesen werden."; renderFileList(); };
        reader.readAsDataURL(file);
      }
    }
    renderFileList();
  }

  function removeFile(id) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== id);
    renderFileList();
  }

  function renderFileList() {
    el.fileList.innerHTML = "";
    uploadedFiles.forEach(f => {
      const row = document.createElement("div");
      row.className = "file-item" + (f.status === "error" ? " is-error" : "");
      const statusLabel = f.status === "ready" ? "Bereit" : f.status === "error" ? "Fehler" : "Wird verarbeitet …";
      const statusClass = f.status === "ready" ? "status-ready" : f.status === "error" ? "status-error" : "status-processing";
      row.innerHTML = `
        <span class="file-item-icon">${fileIconFor(f.kind)}</span>
        <span class="file-item-info">
          <span class="file-item-name">${escapeHtml(f.name)}</span>
          <span class="file-item-meta">${escapeHtml((f.kind || "?").toUpperCase())} · ${humanFileSize(f.size)}</span>
          ${f.status === "error" ? `<div class="file-item-error-msg">${escapeHtml(f.errorMsg)}</div>` : ""}
        </span>
        <span class="file-item-status ${statusClass}">${statusLabel}</span>
      `;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "file-item-remove";
      removeBtn.setAttribute("aria-label", "Entfernen");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => removeFile(f.id));
      row.appendChild(removeBtn);
      el.fileList.appendChild(row);
    });
    updateContextCharCount();
  }

  function buildFilesPayload() {
    return uploadedFiles
      .filter(f => f.status === "ready")
      .map(f => f.kind === "text"
        ? { name: f.name, kind: "text", text: f.text }
        : { name: f.name, kind: f.kind, base64: f.base64 });
  }

  function updateContextCharCount() {
    const promptLen = state.teamId ? getActivePromptText().length : 0;
    const textFileChars = uploadedFiles
      .filter(f => f.status === "ready" && f.kind === "text")
      .reduce((sum, f) => sum + (f.text ? f.text.length : 0), 0);
    const otherFilesCount = uploadedFiles.filter(f => f.status === "ready" && (f.kind === "pdf" || f.kind === "docx")).length;
    let label = `${promptLen + textFileChars} Zeichen Kontext`;
    if (otherFilesCount) label += ` + ${otherFilesCount} Dokument(e)`;
    if (el.contextCharCount) el.contextCharCount.textContent = label;
  }

  /* ---------------------------------------------------------
     KI-UNTERSTÜTZUNG (mode select + Mit KI generieren)
     --------------------------------------------------------- */

  function renderAiModeOptions() {
    el.aiModeSelect.innerHTML = "";
    AI_MODE_OPTIONS.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      el.aiModeSelect.appendChild(o);
    });
    el.aiModeSelect.value = state.aiMode || "none";
    updateAiModeHint();
  }

  function updateAiModeHint() {
    const opt = AI_MODE_OPTIONS.find(o => o.id === state.aiMode) || AI_MODE_OPTIONS[0];
    el.aiModeHint.textContent = opt.hint;
    el.aiGenerateBtn.disabled = state.aiMode === "none" || aiRequestInFlight;
  }

  function showAiLoading(text) {
    el.aiLoadingText.textContent = text;
    el.aiLoading.classList.remove("hidden");
    el.aiEmptyHint.classList.add("hidden");
  }
  function hideAiLoading() {
    el.aiLoading.classList.add("hidden");
  }
  function showAiError(code, message) {
    el.aiError.textContent = message || "KI momentan nicht verfügbar.";
    el.aiError.classList.remove("hidden");
  }
  function hideAiError() {
    el.aiError.classList.add("hidden");
  }

  function renderAiCompare() {
    el.aiCompareOriginal.textContent = generatePlainText();
    el.aiCompareOptimized.textContent = state.aiOptimizedPrompt || "";
    const has = !!state.aiOptimizedPrompt;
    el.aiCompare.classList.toggle("hidden", !has);
    if (has) { el.aiAnswerWrap.classList.add("hidden"); el.aiEmptyHint.classList.add("hidden"); }
  }

  function renderAiAnswer() {
    el.aiAnswer.innerHTML = state.aiResult ? renderMarkdownSafe(state.aiResult) : "";
    const has = !!state.aiResult;
    el.aiAnswerWrap.classList.toggle("hidden", !has);
    if (has) { el.aiCompare.classList.add("hidden"); el.aiEmptyHint.classList.add("hidden"); }
    if (state.aiResultModel) el.aiModelStatus.textContent = `Modell: ${state.aiResultModel}`;
  }

  function acceptOptimizedPrompt() {
    if (!state.aiOptimizedPrompt) return;
    state.useOptimizedPrompt = true;
    renderPreview();
    saveState();
    showToast("KI-optimierte Version übernommen.");
  }

  function discardOptimizedPrompt() {
    state.aiOptimizedPrompt = null;
    state.useOptimizedPrompt = false;
    el.aiCompare.classList.add("hidden");
    el.aiEmptyHint.classList.remove("hidden");
    renderPreview();
    saveState();
  }

  function revertOverride() {
    state.useOptimizedPrompt = false;
    renderPreview();
    saveState();
  }

  function clearAiResult() {
    state.aiResult = null;
    state.aiResultModel = null;
    el.aiAnswerWrap.classList.add("hidden");
    el.aiEmptyHint.classList.remove("hidden");
    saveState();
  }

  function copyAiAnswer() {
    if (!state.aiResult) return;
    copyTextToClipboard(state.aiResult, "Antwort kopiert!");
  }

  function exportAiAnswerMd() {
    if (!state.aiResult) return;
    const team = getTeamById(state.teamId);
    downloadFile(`ki-ergebnis_${team ? team.id : "adelboden"}.md`, state.aiResult, "text/markdown;charset=utf-8");
    showToast("Markdown exportiert.");
  }

  async function callAi(task) {
    if (!state.teamId) { showToast("Bitte zuerst ein Team auswählen."); return; }
    if (aiRequestInFlight) return;

    const promptText = getActivePromptText();
    const filesPayload = buildFilesPayload();

    // Always fetch fresh Team-Board data right before an AI call — deadlines
    // and documents can change between calls, and this is cheap (small JSON).
    try { await Promise.all([fetchDeadlinesFresh(), fetchFilesFresh()]); } catch (e) { /* AI call still works without Team-Board context */ }

    const deadlinesBlock = buildDeadlinesContextBlock();
    if (deadlinesBlock) {
      filesPayload.push({ name: "Team-Board Deadlines", kind: "text", text: deadlinesBlock });
    }
    const filesBlock = buildSharedFilesContextBlock();
    if (filesBlock) {
      filesPayload.push({ name: "Team-Board Dokumente", kind: "text", text: filesBlock });
    }

    const approxChars = promptText.length + filesPayload.reduce((s, f) => s + (f.text ? f.text.length : 0), 0);

    if (approxChars > 20000) {
      const proceed = confirm(`Der Kontext ist sehr gross (${approxChars} Zeichen). Das kann höhere Kosten und Wartezeit verursachen. Trotzdem fortfahren?`);
      if (!proceed) return;
    }

    aiRequestInFlight = true;
    el.aiGenerateBtn.disabled = true;
    el.aiGenerateBtn.textContent = "Wird generiert …";
    hideAiError();
    showAiLoading(filesPayload.some(f => f.kind !== "text") ? "Dokument wird verarbeitet …" : "KI analysiert deinen Prompt …");
    expandCollapsible(el.aiResultToggle, el.aiResultBody);

    try {
      const res = await fetch("/.netlify/functions/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, prompt: promptText, files: filesPayload })
      });

      let data;
      try { data = await res.json(); } catch (e) { throw new Error("bad_response"); }

      if (data && data.ok === false) {
        showAiError(data.code, data.message);
        return;
      }
      if (!res.ok) {
        showAiError("upstream_error", "KI momentan nicht verfügbar. Bitte später erneut versuchen.");
        return;
      }

      state.lastAiTask = task;
      if (task === "improve") {
        state.aiOptimizedPrompt = data.result;
        renderAiCompare();
      } else {
        state.aiResult = data.result;
        state.aiResultModel = data.model || AI_MODEL_LABEL;
        renderAiAnswer();
      }
      saveState();
    } catch (e) {
      showAiError("network", "Netzwerkfehler — bitte Internetverbindung prüfen und erneut versuchen.");
    } finally {
      aiRequestInFlight = false;
      hideAiLoading();
      el.aiGenerateBtn.textContent = "Mit KI generieren";
      updateAiModeHint();
    }
  }

  /* ---------------------------------------------------------
     TEAM-BOARD (shared deadlines & shared project files)
     --------------------------------------------------------- */

  function switchTopNav(view) {
    const isBoard = view === "board";
    el.navBuilderBtn.classList.toggle("is-active", !isBoard);
    el.navBoardBtn.classList.toggle("is-active", isBoard);
    el.builderPage.classList.toggle("hidden", isBoard);
    el.boardPage.classList.toggle("hidden", !isBoard);
    if (isBoard && !boardDeadlinesLoaded) {
      loadBoardData();
    }
  }

  async function postBoard(body) {
    const res = await fetch("/.netlify/functions/shared-board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error("bad_response"); }
    return { httpOk: res.ok, data };
  }

  // Always fetches fresh from the server (deadlines can change at any time,
  // added by other teams) — used both by the board page and, separately,
  // right before every AI call so the AI never sees stale deadlines.
  async function fetchDeadlinesFresh() {
    const { data } = await postBoard({ resource: "deadlines", op: "list" });
    if (data && data.ok) boardDeadlines = data.items || [];
    boardDeadlinesLoaded = true;
    return boardDeadlines;
  }

  async function fetchFilesFresh() {
    const { data } = await postBoard({ resource: "files", op: "list" });
    if (data && data.ok) boardFiles = data.items || [];
    return boardFiles;
  }

  async function loadBoardData() {
    try {
      await Promise.all([fetchDeadlinesFresh(), fetchFilesFresh()]);
      renderDeadlines();
      renderSharedFiles();
    } catch (e) {
      showToast("Team-Board konnte nicht geladen werden (Netzwerkfehler).");
    }
  }

  function renderDeadlineTeamFilter() {
    el.deadlineTeamFilter.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Alle Teams";
    el.deadlineTeamFilter.appendChild(allOpt);
    TEAMS.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.icon + " " + t.name;
      el.deadlineTeamFilter.appendChild(opt);
    });
    el.deadlineTeamFilter.value = deadlineTeamFilterValue;
  }

  function formatDeadlineDate(dateStr) {
    if (!dateStr) return { day: "–", month: "" };
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return { day: "–", month: "" };
    return { day: String(d.getDate()), month: d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "") };
  }

  function deadlineUrgencyClass(dateStr, status) {
    if (status === "erledigt") return "is-done";
    if (!dateStr) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays < 0) return "is-overdue";
    if (diffDays <= 7) return "is-soon";
    return "";
  }

  function renderDeadlines() {
    const filtered = deadlineTeamFilterValue === "all"
      ? boardDeadlines
      : boardDeadlines.filter(d => (d.teamIds || []).includes(deadlineTeamFilterValue) || (d.teamIds || []).length === 0);

    el.deadlineList.innerHTML = "";
    el.deadlineEmptyHint.classList.toggle("hidden", filtered.length > 0);

    filtered.forEach(d => {
      const { day, month } = formatDeadlineDate(d.date);
      const urgency = deadlineUrgencyClass(d.date, d.status);
      const row = document.createElement("div");
      row.className = "deadline-card" + (urgency ? " " + urgency : "");
      const teamNames = getTeamNamesByIds(d.teamIds || []);
      row.innerHTML = `
        <div class="deadline-date-badge"><span class="dd-day">${day}</span><span class="dd-month">${month}</span></div>
        <div class="deadline-info">
          <div class="deadline-title${d.status === "erledigt" ? " is-done-text" : ""}">${escapeHtml(d.title)}</div>
          <div class="deadline-meta">${d.date || "kein Datum"}</div>
          ${d.description ? `<div class="deadline-desc">${escapeHtml(d.description)}</div>` : ""}
          ${teamNames.length ? `<div class="deadline-teams">${teamNames.map(n => `<span class="deadline-team-tag">${escapeHtml(n)}</span>`).join("")}</div>` : ""}
        </div>
      `;
      const actions = document.createElement("div");
      actions.className = "deadline-actions";

      const statusBtn = document.createElement("button");
      statusBtn.type = "button";
      statusBtn.className = "deadline-status-toggle" + (d.status === "erledigt" ? " is-done" : "");
      statusBtn.textContent = d.status === "erledigt" ? "✓ Erledigt" : "Offen";
      statusBtn.disabled = !boardUnlocked;
      statusBtn.title = boardUnlocked ? "Status umschalten" : "Bearbeitung zuerst entsperren";
      statusBtn.addEventListener("click", () => toggleDeadlineStatus(d));
      actions.appendChild(statusBtn);

      if (boardUnlocked) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "deadline-delete-btn";
        delBtn.textContent = "✕ Löschen";
        delBtn.addEventListener("click", () => deleteDeadline(d.id));
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
      el.deadlineList.appendChild(row);
    });
  }

  async function toggleDeadlineStatus(d) {
    const newStatus = d.status === "erledigt" ? "offen" : "erledigt";
    const { data } = await postBoard({ resource: "deadlines", op: "update", editPassword: boardEditPassword, id: d.id, data: { status: newStatus } });
    if (data && data.ok) {
      d.status = newStatus;
      renderDeadlines();
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteDeadline(id) {
    if (!confirm("Diese Deadline wirklich löschen?")) return;
    const { data } = await postBoard({ resource: "deadlines", op: "delete", editPassword: boardEditPassword, id });
    if (data && data.ok) {
      boardDeadlines = boardDeadlines.filter(d => d.id !== id);
      renderDeadlines();
      showToast("Deadline gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function humanFileSizeBoard(bytes) { return humanFileSize(bytes); }

  function buildSharedFileCard(f) {
    const row = document.createElement("div");
    row.className = "file-item" + (f.important ? " is-important" : "");
    const teamNames = getTeamNamesByIds(f.teamIds || []);
    row.innerHTML = `
      <span class="file-item-icon">📄</span>
      <span class="file-item-info">
        <span class="file-item-name">${escapeHtml(f.name)}</span>
        <span class="file-item-meta">${humanFileSizeBoard(f.size)}${f.description ? " · " + escapeHtml(f.description) : ""}</span>
        ${teamNames.length ? `<div class="deadline-teams">${teamNames.map(n => `<span class="deadline-team-tag">${escapeHtml(n)}</span>`).join("")}</div>` : ""}
      </span>
    `;

    if (boardUnlocked) {
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "file-star-btn" + (f.important ? " is-starred" : "");
      starBtn.title = f.important ? "Als 'wichtig' entfernen" : "Als wichtiges Dokument markieren";
      starBtn.textContent = "⭐";
      starBtn.addEventListener("click", () => toggleFileImportant(f));
      row.appendChild(starBtn);
    }

    const dl = document.createElement("a");
    dl.href = `/.netlify/functions/shared-file-download?id=${encodeURIComponent(f.id)}`;
    dl.className = "btn btn-small";
    dl.textContent = "⬇ Download";
    dl.setAttribute("download", f.name);
    row.appendChild(dl);

    if (boardUnlocked) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "file-item-remove";
      delBtn.setAttribute("aria-label", "Löschen");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => deleteSharedFile(f.id));
      row.appendChild(delBtn);
    }
    return row;
  }

  function renderSharedFiles() {
    const important = boardFiles.filter(f => f.important);
    let others = boardFiles.filter(f => !f.important);

    const query = (el.sharedFileSearch.value || "").trim().toLowerCase();
    if (query) {
      others = others.filter(f =>
        f.name.toLowerCase().includes(query) ||
        (f.description || "").toLowerCase().includes(query)
      );
    }

    el.importantFileList.innerHTML = "";
    important.forEach(f => el.importantFileList.appendChild(buildSharedFileCard(f)));
    el.importantFileEmptyHint.classList.toggle("hidden", important.length > 0);

    el.sharedFileList.innerHTML = "";
    others.forEach(f => el.sharedFileList.appendChild(buildSharedFileCard(f)));
    el.sharedFileEmptyHint.classList.toggle("hidden", others.length > 0);

    const otherCount = boardFiles.filter(f => !f.important).length;
    el.otherFilesToggleLabel.textContent = otherCount > 0
      ? `Weitere Dateien anzeigen (${otherCount})`
      : "Weitere Dateien anzeigen";
  }

  async function toggleFileImportant(f) {
    const { data } = await postBoard({ resource: "files", op: "update", editPassword: boardEditPassword, id: f.id, data: { important: !f.important } });
    if (data && data.ok) {
      f.important = data.item.important;
      renderSharedFiles();
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteSharedFile(id) {
    if (!confirm("Diese Datei wirklich löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const { data } = await postBoard({ resource: "files", op: "delete", editPassword: boardEditPassword, id });
    if (data && data.ok) {
      boardFiles = boardFiles.filter(f => f.id !== id);
      renderSharedFiles();
      showToast("Datei gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function handleBoardWriteError(data) {
    if (data && data.code === "not_configured") {
      showToast("Bearbeitung ist noch nicht konfiguriert (Administrator muss BOARD_EDIT_PASSWORD setzen).");
    } else if (data && data.code === "wrong_password") {
      showToast("Falsches Passwort — Bearbeitung wird zurückgesetzt.");
      lockBoard();
    } else {
      showToast((data && data.message) || "Aktion fehlgeschlagen.");
    }
  }

  function lockBoard() {
    boardUnlocked = false;
    boardEditPassword = "";
    try { sessionStorage.removeItem(BOARD_PASSWORD_SESSION_KEY); } catch (e) { /* ignore */ }
    el.editLock.classList.remove("is-unlocked");
    el.editLockStatus.textContent = "🔒 Nur Lesen";
    el.unlockEditBtn.classList.remove("hidden");
    el.unlockConfirmBtn.classList.add("hidden");
    el.unlockPasswordInput.classList.add("hidden");
    el.unlockPasswordInput.value = "";
    el.addDeadlineBtn.disabled = true;
    el.showSharedFileFormBtn.disabled = true;
    renderDeadlines();
    renderSharedFiles();
  }

  function unlockBoardUi() {
    boardUnlocked = true;
    el.editLock.classList.add("is-unlocked");
    el.editLockStatus.textContent = "🔓 Bearbeitung aktiv";
    el.unlockEditBtn.classList.add("hidden");
    el.unlockConfirmBtn.classList.add("hidden");
    el.unlockPasswordInput.classList.add("hidden");
    el.addDeadlineBtn.disabled = false;
    el.showSharedFileFormBtn.disabled = false;
    renderDeadlines();
    renderSharedFiles();
  }

  async function tryUnlockBoard(password, { silent } = {}) {
    const { data } = await postBoard({ resource: "auth", op: "check", editPassword: password });
    if (data && data.ok) {
      boardEditPassword = password;
      try { sessionStorage.setItem(BOARD_PASSWORD_SESSION_KEY, password); } catch (e) { /* ignore */ }
      unlockBoardUi();
      if (!silent) showToast("Bearbeitung entsperrt.");
      return true;
    }
    if (!silent) handleBoardWriteError(data);
    return false;
  }

  // Standalone team-chip picker for the board forms (deliberately separate
  // from renderChipGroup(), which is wired to the main prompt-builder state
  // and always triggers renderAll()/saveState() — wrong here).
  function renderTeamChipPicker(container, selectedIds) {
    container.innerHTML = "";
    TEAMS.forEach(t => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selectedIds.includes(t.id) ? " is-selected" : "");
      btn.textContent = t.name;
      btn.addEventListener("click", () => {
        toggleInArray(selectedIds, t.id);
        renderTeamChipPicker(container, selectedIds);
      });
      container.appendChild(btn);
    });
  }

  function resetDeadlineForm() {
    el.deadlineTitleInput.value = "";
    el.deadlineDateInput.value = "";
    el.deadlineDescInput.value = "";
    pendingDeadlineTeamIds = [];
    renderTeamChipPicker(el.deadlineTeamChips, pendingDeadlineTeamIds);
  }

  async function saveDeadline() {
    const title = el.deadlineTitleInput.value.trim();
    if (!title) { showToast("Bitte einen Titel eingeben."); return; }
    const payload = {
      title,
      date: el.deadlineDateInput.value || "",
      teamIds: [...pendingDeadlineTeamIds],
      description: el.deadlineDescInput.value.trim()
    };
    const { data } = await postBoard({ resource: "deadlines", op: "create", editPassword: boardEditPassword, data: payload });
    if (data && data.ok) {
      boardDeadlines.push(data.item);
      boardDeadlines.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
      renderDeadlines();
      el.deadlineForm.classList.add("hidden");
      resetDeadlineForm();
      showToast("Deadline gespeichert.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function resetSharedFileForm() {
    selectedSharedFile = null;
    el.sharedFileInput.value = "";
    el.sharedFileSelectedName.textContent = "Keine Datei gewählt";
    el.sharedFileDescInput.value = "";
    el.sharedFileImportantCheckbox.checked = false;
    pendingSharedFileTeamIds = [];
    renderTeamChipPicker(el.sharedFileTeamChips, pendingSharedFileTeamIds);
    el.sharedFileUploadBtn.disabled = true;
  }

  const SHARED_FILE_MAX_BYTES = 4 * 1024 * 1024;

  function handleSharedFileSelected(file) {
    if (!file) return;
    if (file.size === 0) { showToast("Datei ist leer."); return; }
    if (file.size > SHARED_FILE_MAX_BYTES) { showToast(`Datei zu gross (max. ${Math.round(SHARED_FILE_MAX_BYTES / 1024 / 1024)} MB).`); return; }
    selectedSharedFile = file;
    el.sharedFileSelectedName.textContent = `${file.name} (${humanFileSize(file.size)})`;
    el.sharedFileUploadBtn.disabled = false;
  }

  function uploadSharedFile() {
    if (!selectedSharedFile) { showToast("Bitte zuerst eine Datei auswählen."); return; }
    const file = selectedSharedFile;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result || "").split(",")[1] || "";
      const payload = {
        name: file.name,
        mime: file.type || "application/octet-stream",
        base64,
        teamIds: [...pendingSharedFileTeamIds],
        description: el.sharedFileDescInput.value.trim(),
        important: el.sharedFileImportantCheckbox.checked
      };
      const { data } = await postBoard({ resource: "files", op: "upload", editPassword: boardEditPassword, data: payload });
      if (data && data.ok) {
        boardFiles.unshift(data.item);
        renderSharedFiles();
        el.sharedFileUploadForm.classList.add("hidden");
        resetSharedFileForm();
        showToast("Datei hochgeladen.");
      } else {
        handleBoardWriteError(data);
      }
    };
    reader.onerror = () => showToast("Datei konnte nicht gelesen werden.");
    reader.readAsDataURL(file);
  }

  // Builds a compact, always-cheap "current deadlines" text block used as
  // extra AI context — separate from the heavier optional file uploads.
  function buildDeadlinesContextBlock() {
    if (!boardDeadlines.length) return null;
    const relevant = boardDeadlines.filter(d => d.status !== "erledigt");
    if (!relevant.length) return null;
    const lines = relevant.slice(0, 25).map(d => {
      const teamNames = getTeamNamesByIds(d.teamIds || []);
      const teamPart = teamNames.length ? ` [${teamNames.join(", ")}]` : "";
      return `- ${d.date || "kein Datum"}: ${d.title}${teamPart}`;
    });
    return "Aktuelle offene Deadlines (Team-Board):\n" + lines.join("\n");
  }

  // Lightweight "what documents exist" awareness for the AI — only names/
  // descriptions/links, never full file content (keeps this cheap and always-on,
  // unlike the heavier optional file uploads the user attaches explicitly).
  function buildSharedFilesContextBlock() {
    if (!boardFiles.length) return null;
    const sorted = [...boardFiles].sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
    const lines = sorted.slice(0, 25).map(f => {
      const teamNames = getTeamNamesByIds(f.teamIds || []);
      const teamPart = teamNames.length ? ` [${teamNames.join(", ")}]` : "";
      const star = f.important ? "⭐ " : "";
      const desc = f.description ? ` — ${f.description}` : "";
      return `- ${star}${f.name}${desc}${teamPart}`;
    });
    return "Im Team-Board verfügbare Dokumente (nur Titel/Beschreibung, nicht der Inhalt — bei Bedarf im Team-Board herunterladen):\n" + lines.join("\n");
  }

  /* ---------------------------------------------------------
     IMPROVE / RESET / DEMO
     --------------------------------------------------------- */

  function improvePrompt() {
    if (!state.teamId) { showToast("Bitte zuerst ein Team auswählen."); return; }
    const team = getTeamById(state.teamId);

    if (!state.aufgabe.trim()) {
      state.aufgabe = `Erstelle ein professionelles ${(team.outputSuggestions[0] || "Konzept")} im Bereich ${team.name} für den Sunrise VIP Cube.`;
    }
    if (!state.kontext.trim()) state.kontext = buildDefaultKontext(team);
    if (!state.ziel.trim()) state.ziel = buildDefaultZiel(team);
    if (!state.zielgruppe.trim()) state.zielgruppe = buildDefaultZielgruppe(team);
    if (!state.style) state.style = STYLE_OPTIONS[0];
    if (!state.fachgebiet) state.fachgebiet = team.fachgebiete[0] || "";

    for (const r of team.requirementSuggestions) {
      if (state.requirements.length >= 3) break;
      if (!state.requirementPool.includes(r)) state.requirementPool.push(r);
      if (!state.requirements.includes(r)) state.requirements.push(r);
    }
    for (const tid of team.interfaces) {
      if (state.interfaces.length >= 2) break;
      if (!state.interfaces.includes(tid)) state.interfaces.push(tid);
    }
    if (!state.riskModuleEnabled) state.riskModuleEnabled = true;
    for (const r of team.relevantRisks) {
      if (state.risks.length >= 3) break;
      if (!state.risks.includes(r)) state.risks.push(r);
    }
    for (const o of team.outputSuggestions) {
      if (state.outputFormats.length >= 2) break;
      if (!state.outputFormats.includes(o)) state.outputFormats.push(o);
    }
    if (state.outputFormats.length === 0) state.outputFormats.push(OUTPUT_FORMATS[0]);

    renderAll();
    saveState();
    showToast("Prompt verbessert.");
  }

  function resetAll() {
    state = initialState();
    uploadedFiles = [];
    uploadConsentGiven = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    el.advFachgebiet.innerHTML = "";
    el.advPhase.innerHTML = "";
    el.advStyle.innerHTML = "";
    el.uploadConsent.checked = false;
    syncUploadConsentUi();
    renderFileList();
    renderAiModeOptions();
    el.aiCompare.classList.add("hidden");
    el.aiAnswerWrap.classList.add("hidden");
    el.aiError.classList.add("hidden");
    el.aiEmptyHint.classList.remove("hidden");
    el.aiModelStatus.textContent = "Modell: —";
    renderAll();
    showToast("Zurückgesetzt.");
  }

  function loadDemo() {
    const demo = DEMO_DATA_BY_TEAM[state.teamId] || DEMO_DATA_BY_TEAM.sunrise;
    selectTeam(demo.teamId);
    state.mode = demo.mode;
    state.aufgabe = demo.aufgabe;
    state.fachgebiet = demo.fachgebiet;
    state.ziel = demo.ziel;
    state.zielgruppe = demo.zielgruppe;
    state.gaesteanzahl = demo.gaesteanzahl;
    state.phase = demo.phase;
    state.requirements = [...demo.requirements];
    demo.requirements.forEach(r => { if (!state.requirementPool.includes(r)) state.requirementPool.push(r); });
    state.interfaces = [...demo.interfaces];
    state.riskModuleEnabled = demo.riskModuleEnabled;
    state.risks = [...demo.risks];
    state.outputFormats = [...demo.outputFormats];
    state.style = demo.style;
    renderAll();
    saveState();
    const teamName = getTeamById(demo.teamId).name;
    showToast(`Beispiel geladen: ${teamName}.`);
  }

  /* ---------------------------------------------------------
     EVENT BINDING
     --------------------------------------------------------- */

  function bindEvents() {
    el.modeQuickBtn.addEventListener("click", () => { state.mode = "quick"; renderAll(); saveState(); });
    el.modeAdvancedBtn.addEventListener("click", () => { state.mode = "advanced"; renderAll(); saveState(); });

    el.quickAufgabe.addEventListener("input", () => { state.aufgabe = el.quickAufgabe.value; if (document.activeElement !== el.advAufgabe) el.advAufgabe.value = state.aufgabe; renderPreview(); renderScore(); renderProgress(); saveState(); });
    el.advAufgabe.addEventListener("input", () => { state.aufgabe = el.advAufgabe.value; if (document.activeElement !== el.quickAufgabe) el.quickAufgabe.value = state.aufgabe; renderPreview(); renderScore(); renderProgress(); saveState(); });

    el.advPersona.addEventListener("input", () => { state.persona = el.advPersona.value; renderPreview(); saveState(); });
    el.advFachgebiet.addEventListener("change", () => { state.fachgebiet = el.advFachgebiet.value; renderPreview(); saveState(); });
    el.advKontext.addEventListener("input", () => { state.kontext = el.advKontext.value; renderPreview(); renderScore(); saveState(); });
    el.advZiel.addEventListener("input", () => { state.ziel = el.advZiel.value; renderPreview(); renderScore(); renderProgress(); saveState(); });
    el.advZielgruppe.addEventListener("input", () => { state.zielgruppe = el.advZielgruppe.value; renderPreview(); renderScore(); renderProgress(); saveState(); });
    el.advGaeste.addEventListener("input", () => { state.gaesteanzahl = el.advGaeste.value; renderPreview(); saveState(); });
    el.advPhase.addEventListener("change", () => { state.phase = el.advPhase.value; renderPreview(); saveState(); });
    el.advStyle.addEventListener("change", () => { state.style = el.advStyle.value; renderPreview(); renderScore(); saveState(); });

    el.riskToggle.addEventListener("change", () => {
      state.riskModuleEnabled = el.riskToggle.checked;
      renderAll();
      saveState();
    });

    el.requirementAddBtn.addEventListener("click", () => {
      const val = el.requirementCustomInput.value.trim();
      if (!val) return;
      if (!state.requirementPool.includes(val)) state.requirementPool.push(val);
      if (!state.requirements.includes(val)) state.requirements.push(val);
      el.requirementCustomInput.value = "";
      renderAll();
      saveState();
    });
    el.requirementCustomInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); el.requirementAddBtn.click(); }
    });

    el.generateBtn.addEventListener("click", () => {
      renderAll();
      saveState();
      showToast(state.teamId ? "Prompt generiert." : "Bitte zuerst ein Team auswählen.");
      if (window.matchMedia("(max-width: 980px)").matches) {
        document.querySelector(".preview-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    el.improveBtn.addEventListener("click", improvePrompt);
    el.demoBtn.addEventListener("click", loadDemo);
    el.resetBtn.addEventListener("click", () => {
      if (confirm("Wirklich alle Eingaben zurücksetzen?")) resetAll();
    });

    el.copyBtn.addEventListener("click", copyPrompt);
    el.exportTxtBtn.addEventListener("click", exportTxt);
    el.exportMdBtn.addEventListener("click", exportMd);

    // --- Collapsible sections ---
    bindCollapsible(el.filesToggle, el.filesBody);
    bindCollapsible(el.aiResultToggle, el.aiResultBody);

    // --- File upload ---
    el.uploadConsent.addEventListener("change", () => {
      uploadConsentGiven = el.uploadConsent.checked;
      syncUploadConsentUi();
    });
    el.fileSelectBtn.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", () => {
      if (el.fileInput.files.length) addFiles(el.fileInput.files);
      el.fileInput.value = "";
    });
    ["dragover", "dragenter"].forEach(evt => el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (uploadConsentGiven) el.dropzone.classList.add("is-dragover");
    }));
    ["dragleave", "drop"].forEach(evt => el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove("is-dragover");
    }));
    el.dropzone.addEventListener("drop", (e) => {
      if (!uploadConsentGiven) { showToast("Bitte zuerst die Datenschutz-Bestätigung ankreuzen."); return; }
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    // --- KI-Unterstützung ---
    el.aiModeSelect.addEventListener("change", () => {
      state.aiMode = el.aiModeSelect.value;
      updateAiModeHint();
      saveState();
    });
    el.aiGenerateBtn.addEventListener("click", () => {
      if (state.aiMode === "improve") callAi("improve");
      else if (state.aiMode === "answer") callAi("answer");
    });
    el.aiAcceptBtn.addEventListener("click", acceptOptimizedPrompt);
    el.aiDiscardBtn.addEventListener("click", discardOptimizedPrompt);
    el.revertOverrideBtn.addEventListener("click", revertOverride);
    el.aiCopyBtn.addEventListener("click", copyAiAnswer);
    el.aiExportMdBtn.addEventListener("click", exportAiAnswerMd);
    el.aiRegenerateBtn.addEventListener("click", () => { if (state.lastAiTask) callAi(state.lastAiTask); });
    el.aiClearBtn.addEventListener("click", clearAiResult);

    // --- Top nav ---
    el.navBuilderBtn.addEventListener("click", () => switchTopNav("builder"));
    el.navBoardBtn.addEventListener("click", () => switchTopNav("board"));
    el.goToBoardFilesBtn.addEventListener("click", () => switchTopNav("board"));

    // --- Team-Board: unlock ---
    el.unlockEditBtn.addEventListener("click", () => {
      el.unlockPasswordInput.classList.remove("hidden");
      el.unlockConfirmBtn.classList.remove("hidden");
      el.unlockPasswordInput.focus();
    });
    el.unlockConfirmBtn.addEventListener("click", () => {
      const pw = el.unlockPasswordInput.value;
      if (!pw) return;
      tryUnlockBoard(pw);
    });
    el.unlockPasswordInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); el.unlockConfirmBtn.click(); }
    });

    // --- Team-Board: deadlines ---
    el.deadlineTeamFilter.addEventListener("change", () => {
      deadlineTeamFilterValue = el.deadlineTeamFilter.value;
      renderDeadlines();
    });
    el.addDeadlineBtn.addEventListener("click", () => {
      resetDeadlineForm();
      el.deadlineForm.classList.remove("hidden");
    });
    el.deadlineSaveBtn.addEventListener("click", saveDeadline);
    el.deadlineCancelBtn.addEventListener("click", () => {
      el.deadlineForm.classList.add("hidden");
      resetDeadlineForm();
    });

    // --- Team-Board: shared files ---
    el.showSharedFileFormBtn.addEventListener("click", () => {
      resetSharedFileForm();
      el.sharedFileUploadForm.classList.remove("hidden");
    });
    el.sharedFileSelectBtn.addEventListener("click", () => el.sharedFileInput.click());
    el.sharedFileInput.addEventListener("change", () => {
      if (el.sharedFileInput.files.length) handleSharedFileSelected(el.sharedFileInput.files[0]);
    });
    el.sharedFileUploadBtn.addEventListener("click", uploadSharedFile);
    el.sharedFileCancelBtn.addEventListener("click", () => {
      el.sharedFileUploadForm.classList.add("hidden");
      resetSharedFileForm();
    });
    el.sharedFileSearch.addEventListener("input", renderSharedFiles);
    el.otherFilesToggle.addEventListener("click", () => {
      const expanded = el.otherFilesToggle.getAttribute("aria-expanded") === "true";
      el.otherFilesToggle.setAttribute("aria-expanded", String(!expanded));
      el.otherFilesBody.classList.toggle("hidden", expanded);
    });
  }

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */

  function init() {
    cacheEls();
    bindEvents();

    const loaded = loadState();
    if (loaded) state = loaded;

    syncUploadConsentUi();
    renderAiModeOptions();

    renderAll();

    if (state.aiOptimizedPrompt) { renderAiCompare(); expandCollapsible(el.aiResultToggle, el.aiResultBody); }
    if (state.aiResult) { renderAiAnswer(); expandCollapsible(el.aiResultToggle, el.aiResultBody); }
    if (state.aiResultModel) el.aiModelStatus.textContent = `Modell: ${state.aiResultModel}`;

    // Team-Board setup (page itself stays hidden until the user opens the tab)
    renderDeadlineTeamFilter();
    renderTeamChipPicker(el.deadlineTeamChips, pendingDeadlineTeamIds);
    renderTeamChipPicker(el.sharedFileTeamChips, pendingSharedFileTeamIds);
    try {
      const savedPw = sessionStorage.getItem(BOARD_PASSWORD_SESSION_KEY);
      if (savedPw) tryUnlockBoard(savedPw, { silent: true });
    } catch (e) { /* sessionStorage unavailable — stay locked */ }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
