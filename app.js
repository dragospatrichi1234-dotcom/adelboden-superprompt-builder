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
      style: ""
    };
  }

  let state = initialState();

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
      "promptOutput", "copyBtn", "exportTxtBtn", "exportMdBtn", "toast"
    ].forEach(id => { el[id] = document.getElementById(id); });
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

  function renderPreview() {
    el.promptOutput.textContent = generatePlainText();
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

  function copyPrompt() {
    const text = generatePlainText();
    const done = () => showToast("In Zwischenablage kopiert!");
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
    downloadFile(`superprompt_${team.id}.txt`, generatePlainText(), "text/plain;charset=utf-8");
    showToast("TXT exportiert.");
  }

  function exportMd() {
    if (!state.teamId) { showToast("Bitte zuerst ein Team auswählen."); return; }
    const team = getTeamById(state.teamId);
    downloadFile(`superprompt_${team.id}.md`, generateMarkdown(), "text/markdown;charset=utf-8");
    showToast("Markdown exportiert.");
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
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    el.advFachgebiet.innerHTML = "";
    el.advPhase.innerHTML = "";
    el.advStyle.innerHTML = "";
    renderAll();
    showToast("Zurückgesetzt.");
  }

  function loadDemo() {
    selectTeam(DEMO_DATA.teamId);
    state.mode = DEMO_DATA.mode;
    state.aufgabe = DEMO_DATA.aufgabe;
    state.fachgebiet = DEMO_DATA.fachgebiet;
    state.ziel = DEMO_DATA.ziel;
    state.zielgruppe = DEMO_DATA.zielgruppe;
    state.gaesteanzahl = DEMO_DATA.gaesteanzahl;
    state.phase = DEMO_DATA.phase;
    state.requirements = [...DEMO_DATA.requirements];
    DEMO_DATA.requirements.forEach(r => { if (!state.requirementPool.includes(r)) state.requirementPool.push(r); });
    state.interfaces = [...DEMO_DATA.interfaces];
    state.riskModuleEnabled = DEMO_DATA.riskModuleEnabled;
    state.risks = [...DEMO_DATA.risks];
    state.outputFormats = [...DEMO_DATA.outputFormats];
    state.style = DEMO_DATA.style;
    renderAll();
    saveState();
    showToast("Beispiel geladen: Sunrise Club Barkonzept.");
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
  }

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */

  function init() {
    cacheEls();
    bindEvents();

    const loaded = loadState();
    if (loaded) state = loaded;

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
