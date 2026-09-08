// ============================================================
// ADELBODEN 2027 – SUPERPROMPT BUILDER
// Netlify Function: shared-board
//
// Shared, persistent Team-Board data (deadlines, shared project files,
// tasks), stored in Netlify Blobs — visible to everyone who opens the
// site, independent of localStorage/browser/device.
//
// Reading (list) is open to everyone. Writing requires a claimed
// identity ("actor": { name, teamId }) checked against the team
// roster below — NOT a real login system (this is a course-internal
// tool, per the project spec: "kein echtes Login-System nötig"). It
// guides correct behaviour for a trusted small group; it does not
// defend against a malicious actor forging requests.
//
// Actual file bytes are streamed back via the sibling function
// shared-file-download.mjs.
// ============================================================

import { getStore } from "@netlify/blobs";

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB (headroom under the ~6 MB function payload limit)
const MAX_TITLE_LEN = 200;
const MAX_NAME_LEN = 200;
const MAX_DESC_LEN = 2000;
const MAX_TEAMS = 20;

// Mirrors TEAM_ROSTER in data.js — keep both in sync manually if the
// roster changes (organigram update, new members, etc.).
const TEAM_ROSTER = [
  { id: "leitung", isLeitung: true, lead: ["Luana H.", "Alfredo"], stv: ["Lena", "Daniel"], members: ["Luana H.", "Alfredo", "Lena", "Daniel"] },
  { id: "food", lead: ["Saskia", "Ann-Sophie"], stv: ["Jiyan", "Ramon"], members: ["Dragos", "Gianluca", "Meret", "Jan", "Laura F.", "Jiyan", "Ramon", "Ann-Sophie", "Saskia"] },
  { id: "hospitality", lead: ["Ignacio"], stv: ["Céline"], members: ["William", "Laura H.", "Jessica", "Anna", "Lea", "Lars", "Ronnie", "Jan", "Céline", "Ignacio"] },
  { id: "club", lead: ["Rouven", "Thore"], stv: ["Raffaela", "Janina"], members: ["Nina", "Cyril", "Thore", "Janina", "Raffaela", "Rouven"] },
  { id: "operations", lead: ["Roger"], stv: ["Fabian"], members: ["Julia", "Janis", "Lukas", "Lena", "Fabienne", "Fabian", "Roger"] },
  { id: "marketing", lead: ["Luana F."], stv: ["Carolina"], members: ["Mailin", "Johann", "Maria", "Carolina", "Luana F."] },
  { id: "sustainability", lead: ["Daniel"], stv: ["Loredana"], members: ["Sarmilan", "Daniel", "Loredana"] },
  { id: "finance", lead: ["Timon"], stv: ["Jenny"], members: ["Vivianne", "Jenny", "Timon"] }
];

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(status, { ok: false, code, message });
}

// Resolves a claimed { name, teamId } against the roster. Returns
// { name, teamId, isLeitung } if the name genuinely belongs to that
// team, otherwise null. Trust-based (see file header) — this stops
// honest mistakes and mismatched team claims, not spoofing.
function resolveActor(actor) {
  if (!actor || typeof actor.name !== "string" || typeof actor.teamId !== "string") return null;
  const name = actor.name.trim();
  const team = TEAM_ROSTER.find(t => t.id === actor.teamId);
  if (!team || !name) return null;
  const belongs = team.members.includes(name) || team.lead.includes(name) || team.stv.includes(name);
  if (!belongs) return null;
  return { name, teamId: team.id, isLeitung: !!team.isLeitung };
}

function requireActor(payload) {
  const actor = resolveActor(payload.actor);
  if (!actor) return { ok: false, response: errorResponse(401, "unknown_identity", "Nicht erkannt. Bitte oben deinen Namen auswählen.") };
  return { ok: true, actor };
}

// For team-scoped resources (tasks): leitung can touch anything, everyone
// else only their own team's items.
function canEditTeam(actor, targetTeamId) {
  return actor.isLeitung || actor.teamId === targetTeamId;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clampTeamIds(arr) {
  return Array.isArray(arr) ? arr.filter(t => typeof t === "string").slice(0, MAX_TEAMS) : [];
}

function base64ByteLength(b64) {
  return Math.floor((b64.length * 3) / 4);
}

async function listAll(storeName) {
  const store = getStore(storeName);
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" }).catch(() => null)));
  return items.filter(Boolean);
}

const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"];
const TASK_PRIORITIES = ["low", "medium", "high"];

export default async (request) => {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Nur POST wird unterstützt.");
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return errorResponse(400, "invalid_request", "Ungültiges JSON.");
  }

  const { resource, op } = payload || {};

  // ---- IDENTITY CHECK (used by the "Wer bist du?" picker) ----
  if (resource === "identity" && op === "check") {
    const actor = resolveActor(payload.actor);
    if (!actor) return errorResponse(401, "unknown_identity", "Name/Team-Kombination nicht erkannt.");
    return jsonResponse(200, { ok: true, actor });
  }

  // ---- DEADLINES ----
  if (resource === "deadlines") {
    if (op === "list") {
      const items = await listAll("deadlines");
      items.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
      return jsonResponse(200, { ok: true, items });
    }

    const auth = requireActor(payload);
    if (!auth.ok) return auth.response;
    const store = getStore("deadlines");

    if (op === "create") {
      const d = payload.data || {};
      if (!d.title || !String(d.title).trim()) return errorResponse(400, "invalid_request", "Titel fehlt.");
      const item = {
        id: genId(),
        title: String(d.title).trim().slice(0, MAX_TITLE_LEN),
        date: typeof d.date === "string" ? d.date.slice(0, 10) : "",
        teamIds: clampTeamIds(d.teamIds),
        description: String(d.description || "").slice(0, MAX_DESC_LEN),
        status: "offen",
        createdBy: auth.actor.name,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await store.setJSON(item.id, item);
      return jsonResponse(200, { ok: true, item });
    }

    if (op === "update") {
      const { id, data } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      const existing = await store.get(id, { type: "json" });
      if (!existing) return errorResponse(404, "not_found", "Deadline nicht gefunden.");
      const d = data || {};
      const updated = {
        ...existing,
        title: d.title !== undefined ? String(d.title).trim().slice(0, MAX_TITLE_LEN) : existing.title,
        date: d.date !== undefined ? String(d.date).slice(0, 10) : existing.date,
        teamIds: d.teamIds !== undefined ? clampTeamIds(d.teamIds) : existing.teamIds,
        description: d.description !== undefined ? String(d.description).slice(0, MAX_DESC_LEN) : existing.description,
        status: d.status !== undefined ? (d.status === "erledigt" ? "erledigt" : "offen") : existing.status,
        updatedAt: Date.now()
      };
      await store.setJSON(id, updated);
      return jsonResponse(200, { ok: true, item: updated });
    }

    if (op === "delete") {
      const { id } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      await store.delete(id);
      return jsonResponse(200, { ok: true });
    }

    return errorResponse(400, "invalid_request", "Unbekannte Operation.");
  }

  // ---- SHARED FILES ----
  if (resource === "files") {
    if (op === "list") {
      const items = await listAll("shared-files-meta");
      items.sort((a, b) => {
        const imp = (b.important ? 1 : 0) - (a.important ? 1 : 0);
        if (imp !== 0) return imp;
        return (b.uploadedAt || 0) - (a.uploadedAt || 0);
      });
      return jsonResponse(200, { ok: true, items });
    }

    const auth = requireActor(payload);
    if (!auth.ok) return auth.response;

    if (op === "upload") {
      const d = payload.data || {};
      if (!d.name || !d.base64) return errorResponse(400, "invalid_request", "Datei fehlt.");
      const approxBytes = base64ByteLength(d.base64);
      if (approxBytes === 0) return errorResponse(400, "invalid_request", "Datei ist leer.");
      if (approxBytes > MAX_FILE_SIZE_BYTES) {
        return errorResponse(400, "file_too_large", `Datei zu gross (max. ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB).`);
      }

      let buf;
      try {
        buf = Buffer.from(d.base64, "base64");
      } catch (e) {
        return errorResponse(400, "invalid_request", "Datei konnte nicht gelesen werden.");
      }

      const id = genId();
      await getStore("shared-files-content").set(id, buf);

      const meta = {
        id,
        name: String(d.name).slice(0, MAX_NAME_LEN),
        mime: typeof d.mime === "string" ? d.mime : "application/octet-stream",
        size: approxBytes,
        teamIds: clampTeamIds(d.teamIds),
        description: String(d.description || "").slice(0, MAX_DESC_LEN),
        important: !!d.important,
        uploadedBy: auth.actor.name,
        uploadedAt: Date.now()
      };
      await getStore("shared-files-meta").setJSON(id, meta);

      return jsonResponse(200, { ok: true, item: meta });
    }

    if (op === "update") {
      const { id, data } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      const existing = await getStore("shared-files-meta").get(id, { type: "json" });
      if (!existing) return errorResponse(404, "not_found", "Datei nicht gefunden.");
      const d = data || {};
      const updated = {
        ...existing,
        important: d.important !== undefined ? !!d.important : existing.important,
        description: d.description !== undefined ? String(d.description).slice(0, MAX_DESC_LEN) : existing.description
      };
      await getStore("shared-files-meta").setJSON(id, updated);
      return jsonResponse(200, { ok: true, item: updated });
    }

    if (op === "delete") {
      const { id } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      await getStore("shared-files-meta").delete(id);
      await getStore("shared-files-content").delete(id);
      return jsonResponse(200, { ok: true });
    }

    return errorResponse(400, "invalid_request", "Unbekannte Operation.");
  }

  // ---- TASKS ----
  if (resource === "tasks") {
    if (op === "list") {
      const items = await listAll("tasks");
      items.sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
      return jsonResponse(200, { ok: true, items });
    }

    const auth = requireActor(payload);
    if (!auth.ok) return auth.response;
    const store = getStore("tasks");

    if (op === "create") {
      const d = payload.data || {};
      if (!d.title || !String(d.title).trim()) return errorResponse(400, "invalid_request", "Titel fehlt.");
      if (!d.teamId || typeof d.teamId !== "string") return errorResponse(400, "invalid_request", "Team fehlt.");
      if (!canEditTeam(auth.actor, d.teamId)) {
        return errorResponse(403, "wrong_team", "Du kannst nur Aufgaben für dein eigenes Team anlegen.");
      }
      const item = {
        id: genId(),
        teamId: d.teamId,
        title: String(d.title).trim().slice(0, MAX_TITLE_LEN),
        description: String(d.description || "").slice(0, MAX_DESC_LEN),
        deadline: typeof d.deadline === "string" ? d.deadline.slice(0, 10) : "",
        status: TASK_STATUSES.includes(d.status) ? d.status : "todo",
        priority: TASK_PRIORITIES.includes(d.priority) ? d.priority : "medium",
        affectedTeams: clampTeamIds(d.affectedTeams),
        createdBy: auth.actor.name,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await store.setJSON(item.id, item);
      return jsonResponse(200, { ok: true, item });
    }

    if (op === "update") {
      const { id, data } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      const existing = await store.get(id, { type: "json" });
      if (!existing) return errorResponse(404, "not_found", "Aufgabe nicht gefunden.");
      if (!canEditTeam(auth.actor, existing.teamId)) {
        return errorResponse(403, "wrong_team", "Du kannst nur Aufgaben deines eigenen Teams bearbeiten.");
      }
      const d = data || {};
      const updated = {
        ...existing,
        title: d.title !== undefined ? String(d.title).trim().slice(0, MAX_TITLE_LEN) : existing.title,
        description: d.description !== undefined ? String(d.description).slice(0, MAX_DESC_LEN) : existing.description,
        deadline: d.deadline !== undefined ? String(d.deadline).slice(0, 10) : existing.deadline,
        status: d.status !== undefined && TASK_STATUSES.includes(d.status) ? d.status : existing.status,
        priority: d.priority !== undefined && TASK_PRIORITIES.includes(d.priority) ? d.priority : existing.priority,
        affectedTeams: d.affectedTeams !== undefined ? clampTeamIds(d.affectedTeams) : existing.affectedTeams,
        updatedAt: Date.now()
      };
      await store.setJSON(id, updated);
      return jsonResponse(200, { ok: true, item: updated });
    }

    if (op === "delete") {
      const { id } = payload;
      if (!id) return errorResponse(400, "invalid_request", "ID fehlt.");
      const existing = await store.get(id, { type: "json" });
      if (!existing) return jsonResponse(200, { ok: true });
      if (!canEditTeam(auth.actor, existing.teamId)) {
        return errorResponse(403, "wrong_team", "Du kannst nur Aufgaben deines eigenen Teams löschen.");
      }
      await store.delete(id);
      return jsonResponse(200, { ok: true });
    }

    return errorResponse(400, "invalid_request", "Unbekannte Operation.");
  }

  return errorResponse(400, "invalid_request", "Unbekannte Ressource.");
};
