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
  let boardDeadlines = [];
  let boardFiles = [];
  let boardTasks = [];
  let boardDeadlinesLoaded = false;
  let deadlineTeamFilterValue = "all";
  let pendingDeadlineTeamIds = [];
  let pendingSharedFileTeamIds = [];
  let pendingTaskAffectedTeams = [];
  let selectedSharedFile = null;
  let selectedSidebarTeamId = null;

  // Supabase (Phase 1, read-only, additive): central "teams" table.
  // Deliberately NOT wired into the existing deadline UI yet — that UI's
  // create/update/delete still runs entirely on Netlify Blobs, and mixing
  // read sources for the same list would desync (a saved deadline would
  // not show up). Kept separate until a real write path exists.
  let sbTeams = [];
  let sbTeamsLoaded = false;

  // Team-Board Etapa 2: team phases (Roadmap), decisions (Entscheidungs-
  // Journal) and the tab/hub navigation state — same "always fetch fresh"
  // pattern as deadlines/files/tasks above.
  let boardPhases = [];
  let boardDecisions = [];
  let currentTeamTab = "tasks";
  let currentLeitungTab = "overview";
  let selectedRoadmapPhaseId = null;
  let roadmapHintShown = false;
  let decisionTypeFilterValue = "";
  let decisionTeamFilterValue = "";

  // Identity ("Wer bist du?") replaces the old shared-password model —
  // matches the project spec: no real login, just a claimed name/team
  // checked against the roster, purely to guide correct behaviour.
  const IDENTITY_SESSION_KEY = "adelboden2027_board_identity";
  let currentIdentity = null; // { name, teamId, isLeitung } | null
  let boardUnlocked = false;  // true once currentIdentity is set — kept as
                               // a simple alias so existing gating checks
                               // below read naturally.

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
      "improveBtn", "demoBtn", "resetBtn",
      "scoreRing", "scoreRingProgress", "scoreNumber", "scoreLabel", "scoreSuggestions",
      "promptOutput", "copyBtn", "exportTxtBtn", "exportMdBtn", "toast",
      "filesCard", "filesToggle", "filesBody", "uploadConsent", "dropzone", "fileInput",
      "fileSelectBtn", "fileList",
      "stepProgressLabel", "showPromptLink", "copyBtnQuickLink", "goToFilesCardBtn",
      "advSettingsToggle", "advSettingsBody",
      "aiModeSelect", "aiModeHint", "contextCharCount", "aiGenerateBtn",
      "promptOverrideBadge", "revertOverrideBtn",
      "aiResultToggle", "aiResultBody", "aiModelStatus",
      "aiLoading", "aiLoadingText", "aiError",
      "aiCompare", "aiCompareOriginal", "aiCompareOptimized", "aiAcceptBtn", "aiDiscardBtn",
      "aiAnswerWrap", "aiAnswer", "aiCopyBtn", "aiExportMdBtn", "aiRegenerateBtn", "aiClearBtn",
      "aiEmptyHint",
      "navBuilderBtn", "navBoardBtn", "builderPage", "boardPage", "goToBoardFilesBtn",
      "supabaseStatusBadge",
      "identityPicker", "identityStatus", "identityNameSelect", "identityTeamDisambigSelect",
      "teamSidebar", "teamMainTitle", "teamMainLead", "teamMainEmpty", "teamTaskArea",
      "addTaskBtn", "taskListWeek", "taskListLater", "taskListBlocked",
      "taskForm", "taskTitleInput", "taskDescInput", "taskDeadlineInput", "taskPriorityInput",
      "taskAffectedTeamChips", "taskSaveBtn", "taskCancelBtn", "taskPhaseSelect",
      "deadlineTeamFilter", "deadlineList", "deadlineEmptyHint", "addDeadlineBtn",
      "deadlineForm", "deadlineTitleInput", "deadlineDateInput", "deadlineTeamChips",
      "deadlineDescInput", "deadlineSaveBtn", "deadlineCancelBtn",
      "sharedFileList", "sharedFileEmptyHint", "showSharedFileFormBtn",
      "sharedFileUploadForm", "sharedFileInput", "sharedFileSelectBtn", "sharedFileSelectedName",
      "sharedFileDescInput", "sharedFileTeamChips", "sharedFileUploadBtn", "sharedFileCancelBtn",
      "sharedFileCategorySelect", "sharedFileCategoryFilter", "teamDocsCategoryFilter",
      "importantFileList", "importantFileEmptyHint",
      "otherFilesToggle", "otherFilesToggleLabel", "otherFilesBody", "sharedFileSearch",
      "sharedFileImportantCheckbox",
      "teamTabsWrap", "teamRoadmapArea", "teamDocsArea",
      "roadmapFirstHint", "roadmapEmptyHint", "seedPhasesBtn", "roadmapTimeline", "roadmapPhaseTasks",
      "addPhaseBtn", "phaseForm", "phaseNameInput", "phasePeriodInput", "phaseSummaryInput", "phaseSaveBtn", "phaseCancelBtn",
      "teamDocsSearch", "teamDocsPhaseFilter", "teamDocsList", "teamDocsEmptyHint", "goToUploadFromDocsBtn",
      "leitungHub", "leitungOverview", "leitungRoadmap", "leitungDecisions", "leitungOrg",
      "teamOverviewCards", "masterRoadmapTimeline",
      "decisionTypeFilter", "decisionTeamFilter", "addDecisionBtn",
      "decisionForm", "decisionTeamSelect", "decisionTypeSelect", "decisionTextInput",
      "decisionSaveBtn", "decisionCancelBtn", "decisionList", "decisionEmptyHint",
      "orgChartCards"
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
     ADVANCED MODE — 4-step wizard
     --------------------------------------------------------- */

  const STEP_LABELS = { 1: "Aufgabe", 2: "Kontext", 3: "Anforderungen", 4: "Ergebnis" };
  let currentAdvancedStep = 1;

  function switchStep(n) {
    currentAdvancedStep = n;
    document.querySelectorAll(".step-tab").forEach(tab => {
      tab.classList.toggle("is-active", Number(tab.dataset.step) === n);
    });
    document.querySelectorAll(".step-panel").forEach(panel => {
      panel.classList.toggle("hidden", Number(panel.dataset.stepPanel) !== n);
    });
    if (el.stepProgressLabel) el.stepProgressLabel.textContent = `Schritt ${n} von 4 — ${STEP_LABELS[n]}`;
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
    // The primary button is always usable now: with "Prompt nur erstellen"
    // it just assembles the prompt locally (free); only an in-flight AI
    // request disables it.
    el.aiGenerateBtn.disabled = aiRequestInFlight;
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
      el.aiGenerateBtn.textContent = "✨ Mit KI erstellen";
      updateAiModeHint();
    }
  }

  function scrollToPreview() {
    if (window.matchMedia("(max-width: 980px)").matches) {
      document.querySelector(".preview-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Single dominant action for Advanced Mode: with "Prompt nur erstellen"
  // (default, free) it just assembles the prompt locally — the exact
  // behaviour the old separate "Prompt generieren" button had. With an AI
  // mode selected, it triggers the corresponding paid AI call instead.
  function generateOrCallAi() {
    if (state.aiMode === "improve") { callAi("improve"); return; }
    if (state.aiMode === "answer") { callAi("answer"); return; }
    renderAll();
    saveState();
    showToast(state.teamId ? "Prompt generiert." : "Bitte zuerst ein Team auswählen.");
    scrollToPreview();
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
    if (isBoard && !sbTeamsLoaded) {
      loadSupabaseTeams();
    }
  }

  // Never throws — network failures and non-JSON responses (e.g. the
  // function not being deployed yet) resolve to { data: null } instead,
  // so every caller's existing "if (data && data.ok)" check already
  // handles it via handleBoardWriteError's fallback branch.
  async function postBoard(body) {
    try {
      const res = await fetch("/.netlify/functions/shared-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON response */ }
      return { httpOk: res.ok, data };
    } catch (e) {
      return { httpOk: false, data: null };
    }
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

  // Supabase Phase 1: read-only "teams" load. Independent of loadBoardData()
  // on purpose — does not gate, block, or feed the existing (Blobs-backed)
  // deadline/task/file rendering. Only surfaces a small status badge so the
  // connection is visibly verifiable without touching working functionality.
  async function loadSupabaseTeams() {
    if (!window.sbClient) {
      el.supabaseStatusBadge.textContent = "🗄️ Supabase: Client nicht verfügbar.";
      el.supabaseStatusBadge.classList.remove("hidden");
      return;
    }
    try {
      const { data, error } = await window.sbClient.from("teams").select("*").order("name");
      if (error) throw error;
      sbTeams = data || [];
      sbTeamsLoaded = true;
      el.supabaseStatusBadge.textContent = `🗄️ Supabase verbunden — ${sbTeams.length} Teams geladen.`;
      el.supabaseStatusBadge.classList.remove("hidden");
    } catch (e) {
      console.error("Fehler beim Laden der Teams aus Supabase:", e);
      el.supabaseStatusBadge.textContent = "🗄️ Supabase: Teams konnten nicht geladen werden.";
      el.supabaseStatusBadge.classList.remove("hidden");
    }
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
    const { data } = await postBoard({ resource: "deadlines", op: "update", actor: currentIdentity, id: d.id, data: { status: newStatus } });
    if (data && data.ok) {
      d.status = newStatus;
      renderDeadlines();
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteDeadline(id) {
    if (!confirm("Diese Deadline wirklich löschen?")) return;
    const { data } = await postBoard({ resource: "deadlines", op: "delete", actor: currentIdentity, id });
    if (data && data.ok) {
      boardDeadlines = boardDeadlines.filter(d => d.id !== id);
      renderDeadlines();
      showToast("Deadline gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function humanFileSizeBoard(bytes) { return humanFileSize(bytes); }

  const CATEGORY_LABELS = {
    Konzept: "Konzept", Kalkulation: "Kalkulation / Budget", Protokoll: "Protokoll",
    Vorlage: "Vorlage / Vorschrift", Bestellung: "Bestellung / Logistik",
    Praesentation: "Präsentation", Sonstiges: "Sonstiges"
  };

  // Icon purely from mime/filename — no extra data entry needed from the user.
  function fileTypeIcon(f) {
    const mime = (f.mime || "").toLowerCase();
    const name = (f.name || "").toLowerCase();
    if (mime.includes("wordprocessingml") || mime.includes("msword") || name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
    if (mime.includes("spreadsheetml") || mime.includes("ms-excel") || name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "📊";
    if (mime.includes("presentationml") || mime.includes("ms-powerpoint") || name.endsWith(".ppt") || name.endsWith(".pptx")) return "📽️";
    if (mime.includes("pdf") || name.endsWith(".pdf")) return "📕";
    if (mime.startsWith("image/")) return "🖼️";
    return "📄";
  }

  function populateCategoryFilterOptions(selectEl) {
    Object.keys(CATEGORY_LABELS).forEach(key => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = CATEGORY_LABELS[key];
      selectEl.appendChild(opt);
    });
  }

  function buildSharedFileCard(f) {
    const row = document.createElement("div");
    row.className = "file-item" + (f.important ? " is-important" : "");
    const teamNames = getTeamNamesByIds(f.teamIds || []);
    row.innerHTML = `
      <span class="file-item-icon">${fileTypeIcon(f)}</span>
      <span class="file-item-info">
        <span class="file-item-name">${escapeHtml(f.name)}</span>
        <span class="file-item-meta">${humanFileSizeBoard(f.size)}${f.description ? " · " + escapeHtml(f.description) : ""}</span>
        ${f.category && CATEGORY_LABELS[f.category] ? `<span class="file-category-badge">${escapeHtml(CATEGORY_LABELS[f.category])}</span>` : ""}
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

    const categoryFilter = el.sharedFileCategoryFilter.value;
    if (categoryFilter) others = others.filter(f => f.category === categoryFilter);

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
    const { data } = await postBoard({ resource: "files", op: "update", actor: currentIdentity, id: f.id, data: { important: !f.important } });
    if (data && data.ok) {
      f.important = data.item.important;
      renderSharedFiles();
      if (el.teamDocsArea && !el.teamDocsArea.classList.contains("hidden")) renderTeamDocs();
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteSharedFile(id) {
    if (!confirm("Diese Datei wirklich löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const { data } = await postBoard({ resource: "files", op: "delete", actor: currentIdentity, id });
    if (data && data.ok) {
      boardFiles = boardFiles.filter(f => f.id !== id);
      renderSharedFiles();
      if (el.teamDocsArea && !el.teamDocsArea.classList.contains("hidden")) renderTeamDocs();
      showToast("Datei gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function handleBoardWriteError(data) {
    if (!data) {
      showToast("Netzwerkfehler — bitte Verbindung prüfen und erneut versuchen.");
    } else if (data.code === "unknown_identity") {
      showToast("Nicht erkannt — bitte oben deinen Namen erneut auswählen.");
      clearIdentity();
    } else if (data.code === "wrong_team") {
      showToast(data.message || "Das gehört nicht zu deinem Team.");
    } else {
      showToast(data.message || "Aktion fehlgeschlagen.");
    }
  }

  function clearIdentity() {
    currentIdentity = null;
    boardUnlocked = false;
    try { sessionStorage.removeItem(IDENTITY_SESSION_KEY); } catch (e) { /* ignore */ }
    renderIdentityUi();
    el.addDeadlineBtn.disabled = true;
    el.showSharedFileFormBtn.disabled = true;
    renderDeadlines();
    renderSharedFiles();
    renderTeamSidebar();
    refreshActiveTeamView();
  }

  function refreshActiveTeamView() {
    if (!selectedSidebarTeamId) return;
    const team = getRosterTeamById(selectedSidebarTeamId);
    if (!team) return;
    if (team.isLeitung) {
      renderLeitungOverview();
      renderMasterRoadmap();
      renderDecisionJournal();
      renderOrgChart();
    } else {
      renderTaskArea();
      renderRoadmap();
      renderTeamDocs();
    }
  }

  function renderIdentityUi() {
    el.identityPicker.classList.toggle("is-identified", !!currentIdentity);
    if (currentIdentity) {
      const team = getRosterTeamById(currentIdentity.teamId);
      el.identityStatus.textContent = `👤 ${currentIdentity.name} (${team ? team.name : currentIdentity.teamId})`;
    } else {
      el.identityStatus.textContent = "👤 Nicht angemeldet";
    }
  }

  async function finalizeIdentity(name, teamId, { silent } = {}) {
    const { data } = await postBoard({ resource: "identity", op: "check", actor: { name, teamId } });
    if (data && data.ok) {
      currentIdentity = data.actor;
      boardUnlocked = true;
      try { sessionStorage.setItem(IDENTITY_SESSION_KEY, JSON.stringify(currentIdentity)); } catch (e) { /* ignore */ }
      renderIdentityUi();
      el.addDeadlineBtn.disabled = false;
      el.showSharedFileFormBtn.disabled = false;
      renderDeadlines();
      renderSharedFiles();
      renderTeamSidebar();
      refreshActiveTeamView();
      if (!silent) showToast(`Angemeldet als ${currentIdentity.name}.`);
      return true;
    }
    if (!silent) handleBoardWriteError(data);
    return false;
  }

  /* ---------------------------------------------------------
     TEAM SIDEBAR + TASKS ("Nächste Schritte")
     --------------------------------------------------------- */

  // Deadlines/shared-files still tag teams using the OLD Superprompt-Builder
  // TEAMS ids (from before the Team-Board roster existed) — a full data
  // migration is out of scope here, so this is a small local id-bridge used
  // only to pre-select the right chip when jumping from a TEAM_ROSTER context
  // (Dokumente-Tab) into that legacy-id-based upload form.
  const ROSTER_TO_LEGACY_TEAM_ID = {
    leitung: "projektleitung", food: "fnb", hospitality: "guest", club: "sunrise",
    operations: "ops", marketing: "marketing", sustainability: "sustainability", finance: "finance"
  };

  const rosterNameIndex = buildRosterNameIndex();
  let doubleRoleHintShown = false;

  // Grouped by team (optgroup) + alphabetical within each group — per the
  // user-journey review, a flat ~40-name list is tedious to scan.
  function renderIdentityNameOptions() {
    el.identityNameSelect.innerHTML = '<option value="">Wer bist du?</option>';
    TEAM_ROSTER.forEach(team => {
      const namesInTeam = [...new Set([...team.lead, ...team.stv, ...team.members])].sort((a, b) => a.localeCompare(b, "de"));
      if (!namesInTeam.length) return;
      const group = document.createElement("optgroup");
      group.label = team.name;
      namesInTeam.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        group.appendChild(opt);
      });
      el.identityNameSelect.appendChild(group);
    });
  }

  function renderTeamSidebar() {
    el.teamSidebar.innerHTML = "";

    const leitungTeam = TEAM_ROSTER.find(t => t.isLeitung);
    const otherTeams = TEAM_ROSTER.filter(t => !t.isLeitung);

    function buildItem(team) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-sidebar-item" + (selectedSidebarTeamId === team.id ? " is-active" : "");
      btn.innerHTML = `<span class="team-sidebar-dot" style="background:${team.color}"></span><span>${escapeHtml(team.name)}</span>`;
      btn.addEventListener("click", () => selectSidebarTeam(team.id));
      return btn;
    }

    if (leitungTeam) el.teamSidebar.appendChild(buildItem(leitungTeam));
    const divider = document.createElement("div");
    divider.className = "team-sidebar-divider";
    el.teamSidebar.appendChild(divider);
    otherTeams.forEach(t => el.teamSidebar.appendChild(buildItem(t)));
  }

  function selectSidebarTeam(teamId) {
    selectedSidebarTeamId = teamId;
    renderTeamSidebar();
    const team = getRosterTeamById(teamId);
    if (!team) return;
    el.teamMainTitle.textContent = team.name;
    el.teamMainLead.textContent = "Lead: " + [...team.lead, ...team.stv].join(", ");
    el.teamMainEmpty.classList.add("hidden");

    if (team.isLeitung) {
      el.teamTabsWrap.classList.add("hidden");
      el.leitungHub.classList.remove("hidden");
      loadLeitungData();
      return;
    }

    el.leitungHub.classList.add("hidden");
    el.teamTabsWrap.classList.remove("hidden");
    switchTeamTab("tasks");
    ensureTasksAndPhasesLoaded().then(() => {
      renderTaskArea();
      renderRoadmap();
      renderTeamDocs();
    });
  }

  async function fetchTasksFresh() {
    const { data } = await postBoard({ resource: "tasks", op: "list" });
    if (data && data.ok) boardTasks = data.items || [];
    return boardTasks;
  }

  async function fetchPhasesFresh() {
    const { data } = await postBoard({ resource: "phases", op: "list" });
    if (data && data.ok) boardPhases = data.items || [];
    return boardPhases;
  }

  async function fetchDecisionsFresh() {
    const { data } = await postBoard({ resource: "decisions", op: "list" });
    if (data && data.ok) boardDecisions = data.items || [];
    return boardDecisions;
  }

  let tasksAndPhasesLoaded = false;
  async function ensureTasksAndPhasesLoaded() {
    if (tasksAndPhasesLoaded) return;
    tasksAndPhasesLoaded = true;
    await Promise.all([fetchTasksFresh(), fetchPhasesFresh()]);
  }

  async function loadLeitungData() {
    await ensureTasksAndPhasesLoaded();
    if (!boardDecisions.length) await fetchDecisionsFresh();
    renderLeitungOverview();
    renderMasterRoadmap();
    renderDecisionJournal();
    renderOrgChart();
  }

  /* ---------------------------------------------------------
     TEAM TABS (Nächste Schritte / Roadmap / Dokumente)
     --------------------------------------------------------- */

  function switchTeamTab(tabName) {
    currentTeamTab = tabName;
    document.querySelectorAll(".team-tabs [data-team-tab]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.teamTab === tabName);
    });
    el.teamTaskArea.classList.toggle("hidden", tabName !== "tasks");
    el.teamRoadmapArea.classList.toggle("hidden", tabName !== "roadmap");
    el.teamDocsArea.classList.toggle("hidden", tabName !== "docs");
    if (tabName === "roadmap") {
      if (!roadmapHintShown) { roadmapHintShown = true; el.roadmapFirstHint.classList.remove("hidden"); }
      renderRoadmap();
    }
    if (tabName === "docs") renderTeamDocs();
  }

  /* ---------------------------------------------------------
     ROADMAP (team-eigene Phasen)
     --------------------------------------------------------- */

  function renderRoadmap() {
    if (!selectedSidebarTeamId) return;
    const team = getRosterTeamById(selectedSidebarTeamId);
    if (!team || team.isLeitung) return;
    const phases = boardPhases.filter(p => p.teamId === selectedSidebarTeamId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const canEdit = !!currentIdentity && (currentIdentity.isLeitung || currentIdentity.teamId === selectedSidebarTeamId);

    populateTaskPhaseSelect(phases);

    el.addPhaseBtn.disabled = !canEdit;
    el.addPhaseBtn.title = canEdit ? "" : "Nur das zuständige Team kann Phasen anlegen";

    if (!phases.length) {
      el.roadmapEmptyHint.classList.remove("hidden");
      el.seedPhasesBtn.classList.remove("hidden");
      el.seedPhasesBtn.disabled = !canEdit;
      el.seedPhasesBtn.title = canEdit ? "" : "Nur das zuständige Team kann Phasen anlegen";
      el.roadmapTimeline.innerHTML = "";
      el.roadmapPhaseTasks.innerHTML = "";
      return;
    }
    el.roadmapEmptyHint.classList.add("hidden");
    el.seedPhasesBtn.classList.add("hidden");

    el.roadmapTimeline.innerHTML = "";
    phases.forEach(p => {
      const teamTasks = boardTasks.filter(t => t.teamId === selectedSidebarTeamId && t.phaseId === p.id);
      const doneCount = teamTasks.filter(t => t.status === "done").length;
      const pct = teamTasks.length ? Math.round((doneCount / teamTasks.length) * 100) : 0;

      const node = document.createElement("button");
      node.type = "button";
      node.className = "roadmap-phase" +
        (p.status === "done" ? " is-done" : p.status === "active" ? " is-active" : "") +
        (selectedRoadmapPhaseId === p.id ? " is-selected" : "");
      node.style.setProperty("--tb-team-color", team.color);
      node.innerHTML = `
        <span class="roadmap-phase-dot"></span>
        <span class="roadmap-phase-name">${escapeHtml(p.name)}</span>
        ${p.period ? `<span class="roadmap-phase-period">${escapeHtml(p.period)}</span>` : ""}
        <span class="roadmap-phase-progress">${teamTasks.length ? pct + "%" : "–"}</span>
      `;
      node.addEventListener("click", () => {
        selectedRoadmapPhaseId = selectedRoadmapPhaseId === p.id ? null : p.id;
        renderRoadmap();
      });
      el.roadmapTimeline.appendChild(node);
    });

    el.roadmapPhaseTasks.innerHTML = "";
    if (selectedRoadmapPhaseId) {
      const phase = phases.find(p => p.id === selectedRoadmapPhaseId);
      const tasksInPhase = boardTasks.filter(t => t.teamId === selectedSidebarTeamId && t.phaseId === selectedRoadmapPhaseId);

      if (phase) {
        const detail = document.createElement("div");
        detail.className = "roadmap-phase-detail";
        detail.innerHTML = `
          <h5 class="task-column-title">${escapeHtml(phase.name)}${phase.period ? ` <span class="roadmap-phase-period-inline">— ${escapeHtml(phase.period)}</span>` : ""}</h5>
          ${phase.summary ? `<p class="roadmap-phase-summary">${escapeHtml(phase.summary)}</p>` : ""}
        `;
        if (canEdit) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "decision-delete-btn";
          delBtn.textContent = "✕ Phase löschen";
          delBtn.addEventListener("click", () => deletePhase(phase.id));
          detail.appendChild(delBtn);
        }
        el.roadmapPhaseTasks.appendChild(detail);
      }

      const heading = document.createElement("h5");
      heading.className = "task-column-title";
      heading.textContent = "Zugeordnete Aufgaben";
      el.roadmapPhaseTasks.appendChild(heading);
      if (tasksInPhase.length) {
        const list = document.createElement("div");
        list.className = "task-card-list";
        tasksInPhase.forEach(t => list.appendChild(buildTaskCard(t, { showTeamBadge: false })));
        el.roadmapPhaseTasks.appendChild(list);
      } else {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "Noch keine Aufgaben dieser Phase zugeordnet.";
        el.roadmapPhaseTasks.appendChild(hint);
      }
    }
  }

  async function seedDefaultPhases() {
    if (!selectedSidebarTeamId || !currentIdentity) return;
    const { data } = await postBoard({ resource: "phases", op: "seedDefaults", actor: currentIdentity, teamId: selectedSidebarTeamId });
    if (data && data.ok) {
      boardPhases = boardPhases.filter(p => p.teamId !== selectedSidebarTeamId).concat(data.items || []);
      renderRoadmap();
      showToast("Standard-Phasen angelegt.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function resetPhaseForm() {
    el.phaseNameInput.value = "";
    el.phasePeriodInput.value = "";
    el.phaseSummaryInput.value = "";
  }

  async function savePhase() {
    const name = el.phaseNameInput.value.trim();
    if (!name) { showToast("Bitte einen Namen eingeben."); return; }
    if (!selectedSidebarTeamId) return;
    const payload = {
      teamId: selectedSidebarTeamId,
      name,
      period: el.phasePeriodInput.value.trim(),
      summary: el.phaseSummaryInput.value.trim()
    };
    const { data } = await postBoard({ resource: "phases", op: "create", actor: currentIdentity, data: payload });
    if (data && data.ok) {
      boardPhases.push(data.item);
      renderRoadmap();
      el.phaseForm.classList.add("hidden");
      resetPhaseForm();
      showToast("Phase gespeichert.");
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deletePhase(id) {
    if (!confirm("Diese Phase wirklich löschen?")) return;
    const { data } = await postBoard({ resource: "phases", op: "delete", actor: currentIdentity, id });
    if (data && data.ok) {
      boardPhases = boardPhases.filter(p => p.id !== id);
      if (selectedRoadmapPhaseId === id) selectedRoadmapPhaseId = null;
      renderRoadmap();
      showToast("Phase gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  function populateTaskPhaseSelect(phasesForTeam) {
    const phases = phasesForTeam || boardPhases.filter(p => p.teamId === selectedSidebarTeamId);
    const current = el.taskPhaseSelect.value;
    el.taskPhaseSelect.innerHTML = '<option value="">Keine Phase</option>';
    phases.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      el.taskPhaseSelect.appendChild(opt);
    });
    el.taskPhaseSelect.value = current || "";
  }

  /* ---------------------------------------------------------
     DOKUMENTE (gefilterte Sicht auf boardFiles)
     --------------------------------------------------------- */

  function renderTeamDocs() {
    if (!selectedSidebarTeamId) return;
    const team = getRosterTeamById(selectedSidebarTeamId);
    if (!team || team.isLeitung) return;

    const phases = boardPhases.filter(p => p.teamId === selectedSidebarTeamId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentPhaseFilter = el.teamDocsPhaseFilter.value;
    el.teamDocsPhaseFilter.innerHTML = '<option value="">Alle Phasen</option>';
    phases.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      el.teamDocsPhaseFilter.appendChild(opt);
    });
    el.teamDocsPhaseFilter.value = currentPhaseFilter || "";

    const legacyTeamId = ROSTER_TO_LEGACY_TEAM_ID[selectedSidebarTeamId];
    let docs = boardFiles.filter(f => (f.teamIds || []).includes(legacyTeamId) || (f.teamIds || []).includes(selectedSidebarTeamId));
    const phaseFilter = el.teamDocsPhaseFilter.value;
    if (phaseFilter) docs = docs.filter(f => f.phaseId === phaseFilter);
    const categoryFilter = el.teamDocsCategoryFilter.value;
    if (categoryFilter) docs = docs.filter(f => f.category === categoryFilter);
    const query = (el.teamDocsSearch.value || "").trim().toLowerCase();
    if (query) {
      docs = docs.filter(f => f.name.toLowerCase().includes(query) || (f.description || "").toLowerCase().includes(query));
    }

    el.teamDocsList.innerHTML = "";
    docs.forEach(f => el.teamDocsList.appendChild(buildSharedFileCard(f)));
    el.teamDocsEmptyHint.classList.toggle("hidden", docs.length > 0);
  }

  /* ---------------------------------------------------------
     PROJEKTLEITUNG-HUB: Tabs
     --------------------------------------------------------- */

  function switchLeitungTab(tabName) {
    currentLeitungTab = tabName;
    document.querySelectorAll(".team-tabs [data-leitung-tab]").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.leitungTab === tabName);
    });
    el.leitungOverview.classList.toggle("hidden", tabName !== "overview");
    el.leitungRoadmap.classList.toggle("hidden", tabName !== "roadmap");
    el.leitungDecisions.classList.toggle("hidden", tabName !== "decisions");
    el.leitungOrg.classList.toggle("hidden", tabName !== "org");
  }

  /* ---------------------------------------------------------
     ÜBERSICHT: Fortschritt pro Team
     --------------------------------------------------------- */

  function renderLeitungOverview() {
    el.teamOverviewCards.innerHTML = "";
    TEAM_ROSTER.filter(t => !t.isLeitung).forEach(team => {
      const teamTasks = boardTasks.filter(t => t.teamId === team.id);
      const doneCount = teamTasks.filter(t => t.status === "done").length;
      const pct = teamTasks.length ? Math.round((doneCount / teamTasks.length) * 100) : null;
      const openWithDeadline = teamTasks.filter(t => t.status !== "done" && t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
      const nextDeadline = openWithDeadline.length ? openWithDeadline[0].deadline : null;
      const criticalCount = teamTasks.filter(t => t.status === "blocked" || taskDeadlineUrgency(t.deadline, t.status) === "is-overdue").length;

      const card = document.createElement("div");
      card.className = "team-overview-card";
      card.style.setProperty("--tb-team-color", team.color);
      card.innerHTML = `
        <div class="toc-header">
          <span class="toc-avatar" style="background:${team.color}">${escapeHtml((team.name || "?").charAt(0))}</span>
          <div>
            <div class="toc-name">${escapeHtml(team.name)}</div>
            <div class="toc-lead">Lead: ${escapeHtml([...team.lead, ...team.stv].join(", "))}</div>
          </div>
        </div>
        <div class="toc-progress-bar"><div class="toc-progress-fill" style="width:${pct === null ? 0 : pct}%; background:${team.color}"></div></div>
        <div class="toc-meta">
          <span>${pct === null ? "Keine Aufgaben" : pct + "% erledigt"}</span>
          <span>${nextDeadline ? "Nächste Deadline: " + relativeDeadlineLabel(nextDeadline) : "Keine offene Deadline"}</span>
        </div>
        ${criticalCount > 0 ? `<div class="toc-critical">⚠ ${criticalCount} kritisch (blockiert/überfällig)</div>` : ""}
      `;
      card.addEventListener("click", () => selectSidebarTeam(team.id));
      el.teamOverviewCards.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     MASTER-ROADMAP: globale Projektphasen + aktuelle Team-Phasen
     --------------------------------------------------------- */

  function renderMasterRoadmap() {
    el.masterRoadmapTimeline.innerHTML = "";

    const globalWrap = document.createElement("div");
    globalWrap.className = "master-roadmap-global";
    [...PROJECT_PHASES].sort((a, b) => a.order - b.order).forEach(p => {
      const node = document.createElement("div");
      node.className = "master-roadmap-phase";
      node.textContent = p.name;
      globalWrap.appendChild(node);
    });
    el.masterRoadmapTimeline.appendChild(globalWrap);

    const teamsWithActivePhase = TEAM_ROSTER.filter(t => !t.isLeitung).map(team => {
      const phases = boardPhases.filter(p => p.teamId === team.id);
      const active = phases.find(p => p.status === "active") || phases.sort((a, b) => (a.order || 0) - (b.order || 0)).find(p => p.status !== "done");
      return { team, active, hasPhases: phases.length > 0 };
    });

    const milestonesWrap = document.createElement("div");
    milestonesWrap.className = "master-roadmap-milestones";
    milestonesWrap.innerHTML = '<h5 class="task-column-title">Wo steht jedes Team gerade?</h5>';
    teamsWithActivePhase.forEach(({ team, active, hasPhases }) => {
      const row = document.createElement("div");
      row.className = "master-roadmap-team-row";
      row.innerHTML = `
        <span class="team-sidebar-dot" style="background:${team.color}"></span>
        <span class="mrt-team-name">${escapeHtml(team.name)}</span>
        <span class="mrt-phase">${!hasPhases ? "Noch keine Phasen angelegt" : (active ? escapeHtml(active.name) : "Alle Phasen abgeschlossen")}</span>
      `;
      milestonesWrap.appendChild(row);
    });
    el.masterRoadmapTimeline.appendChild(milestonesWrap);
  }

  /* ---------------------------------------------------------
     ENTSCHEIDUNGS-JOURNAL
     --------------------------------------------------------- */

  const DECISION_TYPE_LABELS = { FAKT: "Fakt", ANNAHME: "Annahme", EMPFEHLUNG: "Empfehlung", OFFENE_FRAGE: "Offene Frage" };

  function populateDecisionTeamSelects() {
    const fillSelect = (selectEl, includeAllOption) => {
      const current = selectEl.value;
      selectEl.innerHTML = includeAllOption ? '<option value="">Alle Teams</option>' : "";
      TEAM_ROSTER.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name;
        selectEl.appendChild(opt);
      });
      selectEl.value = current || "";
    };
    fillSelect(el.decisionTeamFilter, true);
    fillSelect(el.decisionTeamSelect, false);
  }

  function renderDecisionJournal() {
    let items = [...boardDecisions];
    if (decisionTypeFilterValue) items = items.filter(d => d.type === decisionTypeFilterValue);
    if (decisionTeamFilterValue) items = items.filter(d => d.teamId === decisionTeamFilterValue);

    el.decisionList.innerHTML = "";
    el.decisionEmptyHint.classList.toggle("hidden", items.length > 0);

    items.forEach(d => {
      const team = getRosterTeamById(d.teamId);
      const canEdit = !!currentIdentity && (currentIdentity.isLeitung || currentIdentity.teamId === d.teamId);
      const card = document.createElement("div");
      card.className = `decision-card type-${d.type}`;
      const date = d.createdAt ? new Date(d.createdAt).toLocaleDateString("de-DE") : "";
      card.innerHTML = `
        <div class="decision-card-top">
          <span class="decision-type-badge type-${d.type}">${DECISION_TYPE_LABELS[d.type] || d.type}</span>
          <span class="decision-team-name">${team ? escapeHtml(team.name) : ""}</span>
        </div>
        <div class="decision-text">${escapeHtml(d.text)}</div>
        <div class="decision-meta">${escapeHtml(d.createdBy || "")}${date ? " · " + date : ""}</div>
      `;
      if (canEdit) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "decision-delete-btn";
        delBtn.textContent = "✕ Löschen";
        delBtn.addEventListener("click", () => deleteDecision(d.id));
        card.appendChild(delBtn);
      }
      el.decisionList.appendChild(card);
    });

    el.addDecisionBtn.disabled = !currentIdentity;
    el.addDecisionBtn.title = currentIdentity ? "" : "Zuerst anmelden";
  }

  function resetDecisionForm() {
    el.decisionTextInput.value = "";
    el.decisionTypeSelect.value = "FAKT";
    if (currentIdentity && !currentIdentity.isLeitung) el.decisionTeamSelect.value = currentIdentity.teamId;
  }

  async function saveDecision() {
    const text = el.decisionTextInput.value.trim();
    if (!text) { showToast("Bitte einen Text eingeben."); return; }
    const payload = {
      teamId: el.decisionTeamSelect.value,
      type: el.decisionTypeSelect.value,
      text
    };
    const { data } = await postBoard({ resource: "decisions", op: "create", actor: currentIdentity, data: payload });
    if (data && data.ok) {
      boardDecisions.unshift(data.item);
      renderDecisionJournal();
      el.decisionForm.classList.add("hidden");
      resetDecisionForm();
      showToast("Eintrag gespeichert.");
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteDecision(id) {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    const { data } = await postBoard({ resource: "decisions", op: "delete", actor: currentIdentity, id });
    if (data && data.ok) {
      boardDecisions = boardDecisions.filter(d => d.id !== id);
      renderDecisionJournal();
      showToast("Eintrag gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  /* ---------------------------------------------------------
     ORGANIGRAMM
     --------------------------------------------------------- */

  function renderOrgChart() {
    el.orgChartCards.innerHTML = "";
    TEAM_ROSTER.forEach(team => {
      const card = document.createElement("div");
      card.className = "org-card";
      card.style.setProperty("--tb-team-color", team.color);
      const memberBadges = team.members.map(name => {
        const isDual = (rosterNameIndex[name] || []).length > 1;
        return `<span class="org-member-chip${isDual ? " org-dual-role-badge" : ""}" title="${isDual ? "Doppelrolle: " + rosterNameIndex[name].map(id => { const t = getRosterTeamById(id); return t ? t.name : id; }).join(" + ") : ""}">${escapeHtml(name)}</span>`;
      }).join("");
      card.innerHTML = `
        <div class="org-card-header" style="border-color:${team.color}">
          <span class="team-sidebar-dot" style="background:${team.color}"></span>
          <span class="org-card-name">${escapeHtml(team.name)}</span>
        </div>
        <div class="org-card-role"><strong>Lead:</strong> ${escapeHtml(team.lead.join(", "))}</div>
        ${team.stv.length ? `<div class="org-card-role"><strong>Stv.:</strong> ${escapeHtml(team.stv.join(", "))}</div>` : ""}
        <div class="org-card-members">${memberBadges}</div>
      `;
      el.orgChartCards.appendChild(card);
    });
  }

  function canEditTask(task) {
    if (!currentIdentity) return false;
    return currentIdentity.isLeitung || currentIdentity.teamId === task.teamId;
  }

  function taskDeadlineUrgency(dateStr, status) {
    if (status === "done") return "";
    if (!dateStr) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays < 0) return "is-overdue";
    if (diffDays <= 3) return "is-soon";
    return "";
  }

  function relativeDeadlineLabel(dateStr) {
    if (!dateStr) return "kein Datum";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays === 0) return "heute";
    if (diffDays === 1) return "morgen";
    if (diffDays > 1 && diffDays <= 14) return `in ${diffDays} Tagen`;
    if (diffDays < 0) return `${Math.abs(diffDays)} Tage überfällig`;
    return dateStr;
  }

  const TASK_STATUS_LABELS = { todo: "Offen", in_progress: "In Arbeit", done: "Erledigt", blocked: "Blockiert" };
  const TASK_STATUS_ORDER = ["todo", "in_progress", "done", "blocked"];

  function buildTaskCard(task, { showTeamBadge } = {}) {
    const card = document.createElement("div");
    card.className = "task-card";
    const urgency = taskDeadlineUrgency(task.deadline, task.status);
    const editable = canEditTask(task);
    const team = getRosterTeamById(task.teamId);

    const top = document.createElement("div");
    top.className = "task-card-top";

    const statusBtn = document.createElement("button");
    statusBtn.type = "button";
    statusBtn.className = `task-status-pill status-${task.status}`;
    statusBtn.textContent = TASK_STATUS_LABELS[task.status] || task.status;
    statusBtn.disabled = !editable;
    statusBtn.title = editable ? "Status weiterschalten" : "Nur das zuständige Team kann den Status ändern";
    statusBtn.addEventListener("click", () => cycleTaskStatus(task));
    top.appendChild(statusBtn);

    const prio = document.createElement("span");
    prio.className = `task-priority-dot priority-${task.priority}`;
    prio.title = "Priorität: " + task.priority;
    top.appendChild(prio);

    if (showTeamBadge && team) {
      const badge = document.createElement("span");
      badge.className = "task-team-badge";
      badge.style.background = team.color + "26"; // ~15% opacity
      badge.style.color = team.color;
      badge.textContent = team.name;
      top.appendChild(badge);
    }

    card.appendChild(top);

    const title = document.createElement("div");
    title.className = "task-card-title" + (task.status === "done" ? " is-done" : "");
    title.textContent = task.title;
    card.appendChild(title);

    const deadline = document.createElement("div");
    deadline.className = "task-card-deadline" + (urgency ? " " + urgency : "");
    deadline.textContent = relativeDeadlineLabel(task.deadline);
    card.appendChild(deadline);

    const affectedNames = getTeamNamesFromRoster(task.affectedTeams || []);
    if (affectedNames.length) {
      const teamsWrap = document.createElement("div");
      teamsWrap.className = "task-card-teams";
      affectedNames.forEach(n => {
        const b = document.createElement("span");
        b.className = "task-team-badge";
        b.style.background = "var(--ice)";
        b.style.color = "var(--navy-2)";
        b.textContent = n;
        teamsWrap.appendChild(b);
      });
      card.appendChild(teamsWrap);
    }

    if (editable) {
      const actions = document.createElement("div");
      actions.className = "task-card-actions";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "✕ Löschen";
      delBtn.addEventListener("click", () => deleteTask(task.id));
      actions.appendChild(delBtn);
      card.appendChild(actions);
    }

    return card;
  }

  function getTeamNamesFromRoster(ids) {
    return ids.map(id => { const t = getRosterTeamById(id); return t ? t.name : id; });
  }

  async function cycleTaskStatus(task) {
    const idx = TASK_STATUS_ORDER.indexOf(task.status);
    const next = TASK_STATUS_ORDER[(idx + 1) % TASK_STATUS_ORDER.length];
    const { data } = await postBoard({ resource: "tasks", op: "update", actor: currentIdentity, id: task.id, data: { status: next } });
    if (data && data.ok) {
      task.status = data.item.status;
      renderTaskArea();
      renderRoadmap();
    } else {
      handleBoardWriteError(data);
    }
  }

  async function deleteTask(id) {
    if (!confirm("Diese Aufgabe wirklich löschen?")) return;
    const { data } = await postBoard({ resource: "tasks", op: "delete", actor: currentIdentity, id });
    if (data && data.ok) {
      boardTasks = boardTasks.filter(t => t.id !== id);
      renderTaskArea();
      renderRoadmap();
      showToast("Aufgabe gelöscht.");
    } else {
      handleBoardWriteError(data);
    }
  }

  // "Für euch" (owned by the selected team) vs "Betrifft euch auch"
  // (selected team is only listed as an affected/interface team) — kept
  // as two visually separate groups per the user-journey review, rather
  // than mixing both into one badge-heavy list.
  function renderTaskArea() {
    if (!selectedSidebarTeamId) return;
    const ownTasks = boardTasks.filter(t => t.teamId === selectedSidebarTeamId);
    const affectingTasks = boardTasks.filter(t => t.teamId !== selectedSidebarTeamId && (t.affectedTeams || []).includes(selectedSidebarTeamId));

    const week = [], later = [], blocked = [];
    ownTasks.forEach(t => {
      if (t.status === "blocked") { blocked.push(t); return; }
      const urgency = taskDeadlineUrgency(t.deadline, t.status);
      if (!t.deadline || urgency === "is-overdue" || urgency === "is-soon" || t.status === "in_progress") week.push(t);
      else later.push(t);
    });

    const fillColumn = (containerEl, tasks) => {
      containerEl.innerHTML = "";
      tasks.forEach(t => containerEl.appendChild(buildTaskCard(t, { showTeamBadge: false })));
      const emptyHint = document.querySelector(`[data-empty-for="${containerEl.id}"]`);
      if (emptyHint) emptyHint.classList.toggle("hidden", tasks.length > 0);
    };
    fillColumn(el.taskListWeek, week);
    fillColumn(el.taskListLater, later);
    fillColumn(el.taskListBlocked, blocked);

    // "Betrifft euch auch" — rendered inline after the three columns.
    let affectingWrap = document.getElementById("affectingTasksWrap");
    if (!affectingWrap) {
      affectingWrap = document.createElement("div");
      affectingWrap.id = "affectingTasksWrap";
      affectingWrap.className = "affecting-tasks-wrap";
      el.teamTaskArea.appendChild(affectingWrap);
    }
    if (affectingTasks.length) {
      affectingWrap.innerHTML = '<h5 class="task-column-title">Betrifft euch auch (Schnittstellen)</h5>';
      const list = document.createElement("div");
      list.className = "task-card-list affecting-tasks-list";
      affectingTasks.forEach(t => list.appendChild(buildTaskCard(t, { showTeamBadge: true })));
      affectingWrap.appendChild(list);
    } else {
      affectingWrap.innerHTML = "";
    }

    el.addTaskBtn.disabled = !currentIdentity || !(currentIdentity.isLeitung || currentIdentity.teamId === selectedSidebarTeamId);
    el.addTaskBtn.title = el.addTaskBtn.disabled ? "Nur das zuständige Team kann Aufgaben anlegen" : "";
  }

  function resetTaskForm() {
    el.taskTitleInput.value = "";
    el.taskDescInput.value = "";
    el.taskDeadlineInput.value = "";
    el.taskPriorityInput.value = "medium";
    populateTaskPhaseSelect();
    el.taskPhaseSelect.value = "";
    pendingTaskAffectedTeams = [];
    renderRosterTeamChipPicker(el.taskAffectedTeamChips, pendingTaskAffectedTeams, selectedSidebarTeamId);
  }

  async function saveTask() {
    const title = el.taskTitleInput.value.trim();
    if (!title) { showToast("Bitte einen Titel eingeben."); return; }
    if (!selectedSidebarTeamId) return;
    const payload = {
      teamId: selectedSidebarTeamId,
      title,
      description: el.taskDescInput.value.trim(),
      deadline: el.taskDeadlineInput.value || "",
      priority: el.taskPriorityInput.value,
      phaseId: el.taskPhaseSelect.value || "",
      affectedTeams: [...pendingTaskAffectedTeams]
    };
    const { data } = await postBoard({ resource: "tasks", op: "create", actor: currentIdentity, data: payload });
    if (data && data.ok) {
      boardTasks.push(data.item);
      renderTaskArea();
      renderRoadmap();
      el.taskForm.classList.add("hidden");
      resetTaskForm();
      showToast("Aufgabe gespeichert.");
    } else {
      handleBoardWriteError(data);
    }
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

  // Same pattern, but over the real Team-Board roster (TEAM_ROSTER) — used
  // for Task "Schnittstellen", which must match the ids the server checks
  // against (food/hospitality/club/… — different from the Superprompt
  // Builder's own 9-team list used by renderTeamChipPicker above).
  function renderRosterTeamChipPicker(container, selectedIds, excludeTeamId) {
    container.innerHTML = "";
    TEAM_ROSTER.filter(t => t.id !== excludeTeamId).forEach(t => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selectedIds.includes(t.id) ? " is-selected" : "");
      btn.textContent = t.name;
      btn.addEventListener("click", () => {
        toggleInArray(selectedIds, t.id);
        renderRosterTeamChipPicker(container, selectedIds, excludeTeamId);
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
    const { data } = await postBoard({ resource: "deadlines", op: "create", actor: currentIdentity, data: payload });
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
    el.sharedFileCategorySelect.value = "";
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
        category: el.sharedFileCategorySelect.value,
        important: el.sharedFileImportantCheckbox.checked
      };
      const { data } = await postBoard({ resource: "files", op: "upload", actor: currentIdentity, data: payload });
      if (data && data.ok) {
        boardFiles.unshift(data.item);
        renderSharedFiles();
        if (el.teamDocsArea && !el.teamDocsArea.classList.contains("hidden")) renderTeamDocs();
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

    el.improveBtn.addEventListener("click", improvePrompt);
    el.demoBtn.addEventListener("click", loadDemo);
    el.resetBtn.addEventListener("click", () => {
      if (confirm("Wirklich alle Eingaben zurücksetzen?")) resetAll();
    });

    el.copyBtn.addEventListener("click", copyPrompt);
    el.exportTxtBtn.addEventListener("click", exportTxt);
    el.exportMdBtn.addEventListener("click", exportMd);

    // --- Advanced Mode: step wizard ---
    document.querySelectorAll(".step-tab").forEach(tab => {
      tab.addEventListener("click", () => switchStep(Number(tab.dataset.step)));
    });

    // --- Advanced Mode: secondary quick-actions ---
    if (el.showPromptLink) el.showPromptLink.addEventListener("click", scrollToPreview);
    if (el.copyBtnQuickLink) el.copyBtnQuickLink.addEventListener("click", copyPrompt);
    if (el.goToFilesCardBtn) el.goToFilesCardBtn.addEventListener("click", () => {
      expandCollapsible(el.filesToggle, el.filesBody);
      el.filesCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // --- Collapsible sections ---
    bindCollapsible(el.filesToggle, el.filesBody);
    bindCollapsible(el.aiResultToggle, el.aiResultBody);
    bindCollapsible(el.advSettingsToggle, el.advSettingsBody);

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
    el.aiGenerateBtn.addEventListener("click", generateOrCallAi);
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

    // --- Team-Board: identity ("Wer bist du?") ---
    el.identityNameSelect.addEventListener("change", () => {
      const name = el.identityNameSelect.value;
      el.identityTeamDisambigSelect.classList.add("hidden");
      el.identityTeamDisambigSelect.innerHTML = "";
      if (!name) return;
      const teamIds = rosterNameIndex[name] || [];
      if (teamIds.length === 1) {
        finalizeIdentity(name, teamIds[0]);
      } else if (teamIds.length > 1) {
        const hint = document.createElement("option");
        hint.value = "";
        hint.textContent = "Du hast zwei Rollen — als welches Team?";
        el.identityTeamDisambigSelect.appendChild(hint);
        teamIds.forEach(tid => {
          const team = getRosterTeamById(tid);
          const opt = document.createElement("option");
          opt.value = tid;
          opt.textContent = team ? team.name : tid;
          el.identityTeamDisambigSelect.appendChild(opt);
        });
        el.identityTeamDisambigSelect.classList.remove("hidden");
        el.identityTeamDisambigSelect.focus();
        if (!doubleRoleHintShown) {
          doubleRoleHintShown = true;
          showToast("Du hast zwei Rollen — wähle, in welcher du gerade arbeitest.");
        }
      }
    });
    el.identityTeamDisambigSelect.addEventListener("change", () => {
      const teamId = el.identityTeamDisambigSelect.value;
      const name = el.identityNameSelect.value;
      if (teamId && name) finalizeIdentity(name, teamId);
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
    el.sharedFileCategoryFilter.addEventListener("change", renderSharedFiles);
    el.otherFilesToggle.addEventListener("click", () => {
      const expanded = el.otherFilesToggle.getAttribute("aria-expanded") === "true";
      el.otherFilesToggle.setAttribute("aria-expanded", String(!expanded));
      el.otherFilesBody.classList.toggle("hidden", expanded);
    });

    // --- Team-Board: tasks ---
    el.addTaskBtn.addEventListener("click", () => {
      resetTaskForm();
      el.taskForm.classList.remove("hidden");
    });
    el.taskSaveBtn.addEventListener("click", saveTask);
    el.taskCancelBtn.addEventListener("click", () => {
      el.taskForm.classList.add("hidden");
      resetTaskForm();
    });

    // --- Team-Board: team tabs (Nächste Schritte / Roadmap / Dokumente) ---
    document.querySelectorAll(".team-tabs [data-team-tab]").forEach(btn => {
      btn.addEventListener("click", () => switchTeamTab(btn.dataset.teamTab));
    });

    // --- Team-Board: Roadmap ---
    el.seedPhasesBtn.addEventListener("click", seedDefaultPhases);
    el.addPhaseBtn.addEventListener("click", () => {
      resetPhaseForm();
      el.phaseForm.classList.remove("hidden");
    });
    el.phaseSaveBtn.addEventListener("click", savePhase);
    el.phaseCancelBtn.addEventListener("click", () => {
      el.phaseForm.classList.add("hidden");
      resetPhaseForm();
    });

    // --- Team-Board: Dokumente-Tab ---
    el.teamDocsSearch.addEventListener("input", renderTeamDocs);
    el.teamDocsCategoryFilter.addEventListener("change", renderTeamDocs);
    el.teamDocsPhaseFilter.addEventListener("change", renderTeamDocs);
    el.goToUploadFromDocsBtn.addEventListener("click", () => {
      const legacyTeamId = selectedSidebarTeamId ? ROSTER_TO_LEGACY_TEAM_ID[selectedSidebarTeamId] : null;
      if (legacyTeamId && !pendingSharedFileTeamIds.includes(legacyTeamId)) {
        pendingSharedFileTeamIds.push(legacyTeamId);
      }
      renderTeamChipPicker(el.sharedFileTeamChips, pendingSharedFileTeamIds);
      expandCollapsible(el.filesToggle, el.filesBody);
      el.sharedFileUploadForm.classList.remove("hidden");
      el.filesCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // --- Projektleitung-Hub: Tabs ---
    document.querySelectorAll(".team-tabs [data-leitung-tab]").forEach(btn => {
      btn.addEventListener("click", () => switchLeitungTab(btn.dataset.leitungTab));
    });

    // --- Projektleitung-Hub: Entscheidungs-Journal ---
    el.decisionTypeFilter.addEventListener("change", () => {
      decisionTypeFilterValue = el.decisionTypeFilter.value;
      renderDecisionJournal();
    });
    el.decisionTeamFilter.addEventListener("change", () => {
      decisionTeamFilterValue = el.decisionTeamFilter.value;
      renderDecisionJournal();
    });
    el.addDecisionBtn.addEventListener("click", () => {
      resetDecisionForm();
      el.decisionForm.classList.remove("hidden");
    });
    el.decisionSaveBtn.addEventListener("click", saveDecision);
    el.decisionCancelBtn.addEventListener("click", () => {
      el.decisionForm.classList.add("hidden");
      resetDecisionForm();
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
    renderIdentityNameOptions();
    renderTeamSidebar();
    populateDecisionTeamSelects();
    populateCategoryFilterOptions(el.sharedFileCategoryFilter);
    populateCategoryFilterOptions(el.teamDocsCategoryFilter);
    try {
      const saved = sessionStorage.getItem(IDENTITY_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name && parsed.teamId) finalizeIdentity(parsed.name, parsed.teamId, { silent: true });
      }
    } catch (e) { /* sessionStorage unavailable — stay unidentified */ }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
