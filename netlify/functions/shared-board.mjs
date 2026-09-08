// ============================================================
// ADELBODEN 2027 – SUPERPROMPT BUILDER
// Netlify Function: shared-board
//
// Shared, persistent Team-Board data (deadlines + shared project
// files metadata), stored in Netlify Blobs — visible to everyone
// who opens the site, independent of localStorage/browser/device.
//
// Reading (list) is open to everyone. Writing (create/update/
// delete/upload) requires the shared BOARD_EDIT_PASSWORD
// environment variable, set only in Netlify (never in the repo).
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

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(status, { ok: false, code, message });
}

function checkPassword(provided) {
  const expected = process.env.BOARD_EDIT_PASSWORD;
  if (!expected) return { configured: false, valid: false };
  return { configured: true, valid: typeof provided === "string" && provided.length > 0 && provided === expected };
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

  // ---- AUTH CHECK (used by the "Bearbeitung entsperren" unlock UI) ----
  if (resource === "auth" && op === "check") {
    const { configured, valid } = checkPassword(payload.editPassword);
    if (!configured) return jsonResponse(200, { ok: false, code: "not_configured", message: "Bearbeitung ist noch nicht konfiguriert. Bitte Administrator kontaktieren." });
    if (!valid) return errorResponse(401, "wrong_password", "Falsches Passwort.");
    return jsonResponse(200, { ok: true });
  }

  // ---- DEADLINES ----
  if (resource === "deadlines") {
    if (op === "list") {
      const items = await listAll("deadlines");
      items.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
      return jsonResponse(200, { ok: true, items });
    }

    const { configured, valid } = checkPassword(payload.editPassword);
    if (!configured) return jsonResponse(200, { ok: false, code: "not_configured", message: "Bearbeitung ist noch nicht konfiguriert. Bitte Administrator kontaktieren." });
    if (!valid) return errorResponse(401, "wrong_password", "Falsches Passwort.");

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
      items.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      return jsonResponse(200, { ok: true, items });
    }

    const { configured, valid } = checkPassword(payload.editPassword);
    if (!configured) return jsonResponse(200, { ok: false, code: "not_configured", message: "Bearbeitung ist noch nicht konfiguriert. Bitte Administrator kontaktieren." });
    if (!valid) return errorResponse(401, "wrong_password", "Falsches Passwort.");

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
        uploadedAt: Date.now()
      };
      await getStore("shared-files-meta").setJSON(id, meta);

      return jsonResponse(200, { ok: true, item: meta });
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

  return errorResponse(400, "invalid_request", "Unbekannte Ressource.");
};
