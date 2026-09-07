// ============================================================
// ADELBODEN 2027 – SUPERPROMPT BUILDER
// Netlify Function: generate-ai
//
// Server-side bridge to the OpenAI Responses API.
// The OpenAI API key NEVER reaches the browser — it is read
// exclusively from the server-side environment variable
// OPENAI_API_KEY (set in Netlify: Site settings → Environment
// variables). See README.md for setup instructions.
//
// Zero npm dependencies on purpose: this file uses only Node's
// built-in `node:zlib` (for a minimal, dependency-free DOCX text
// extractor) and the global `fetch`. That keeps the deploy free
// of a build step / node_modules.
// ============================================================

import { inflateRawSync } from "node:zlib";

// ---- Central, easy-to-change model constant -----------------
const OPENAI_MODEL = "gpt-4o-mini";

// ---- Limits (kept in sync with FILE_UPLOAD_LIMITS in data.js) ----
const MAX_PROMPT_CHARS = 20000;
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB per file (raw, pre-base64)
const MAX_TOTAL_REQUEST_BYTES = 7 * 1024 * 1024; // guard on the raw JSON body itself
const MAX_CONTEXT_CHARS = 40000; // combined extracted text budget sent to the model
const MAX_OUTPUT_TOKENS = { improve: 1400, answer: 1800 };
const REQUEST_TIMEOUT_MS = 22000;

const AI_GUARDRAIL_TEXT =
  "Nutze die bereitgestellten Projektunterlagen als Wissensbasis. Erfinde keine Fakten, die darin nicht enthalten sind. Wenn Informationen fehlen oder widersprüchlich sind, kennzeichne dies klar.";

// ---- very small best-effort in-memory rate limit -------------
// NOTE: this is intentionally simple. Serverless functions do not
// share memory across cold starts or concurrent instances, so this
// only throttles bursts within one warm container — it is a
// starting point ("Rate-Limit-Vorbereitung"), not a guarantee.
// For real production protection, add Netlify's rate-limiting
// (netlify.toml [[edge_functions]] / Rate limiting add-on) or a
// Netlify Blobs/external-store backed counter.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateLimitBuckets = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  bucket.count += 1;
  return true;
}

// ---- helpers ---------------------------------------------------

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(status, { ok: false, code, message });
}

function decodeXmlEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Minimal, dependency-free DOCX (.docx = zip) text extractor.
// Locates word/document.xml in the ZIP central directory, decompresses
// it (stored or deflate — the only two methods Word/LibreOffice use),
// and strips the WordprocessingML markup down to plain text.
function extractDocxText(buf) {
  try {
    // Find End Of Central Directory record (search from the end).
    const sigEOCD = 0x06054b50;
    let eocdOffset = -1;
    const searchStart = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= searchStart; i--) {
      if (buf.readUInt32LE(i) === sigEOCD) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) return null;

    const totalRecords = buf.readUInt16LE(eocdOffset + 10);
    let cdOffset = buf.readUInt32LE(eocdOffset + 16);

    const sigCD = 0x02014b50;
    let targetLocalOffset = null;
    let targetMethod = null;
    let targetCompSize = null;

    for (let i = 0; i < totalRecords; i++) {
      if (buf.readUInt32LE(cdOffset) !== sigCD) break;
      const method = buf.readUInt16LE(cdOffset + 10);
      const compSize = buf.readUInt32LE(cdOffset + 20);
      const nameLen = buf.readUInt16LE(cdOffset + 28);
      const extraLen = buf.readUInt16LE(cdOffset + 30);
      const commentLen = buf.readUInt16LE(cdOffset + 32);
      const localOffset = buf.readUInt32LE(cdOffset + 42);
      const name = buf.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLen);

      if (name === "word/document.xml") {
        targetLocalOffset = localOffset;
        targetMethod = method;
        targetCompSize = compSize;
        break;
      }
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }

    if (targetLocalOffset === null) return null;

    const sigLocal = 0x04034b50;
    if (buf.readUInt32LE(targetLocalOffset) !== sigLocal) return null;
    const nameLen2 = buf.readUInt16LE(targetLocalOffset + 26);
    const extraLen2 = buf.readUInt16LE(targetLocalOffset + 28);
    const dataStart = targetLocalOffset + 30 + nameLen2 + extraLen2;
    const compressed = buf.subarray(dataStart, dataStart + targetCompSize);

    let raw;
    if (targetMethod === 0) raw = compressed;
    else if (targetMethod === 8) raw = inflateRawSync(compressed);
    else return null;

    let xml = raw.toString("utf8");
    xml = xml.replace(/<w:p[ >]/g, "\n$&");
    xml = xml.replace(/<w:tab\/>/g, "\t");
    xml = xml.replace(/<w:br\/>/g, "\n");
    xml = xml.replace(/<[^>]+>/g, "");
    xml = decodeXmlEntities(xml);
    xml = xml.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return xml;
  } catch (e) {
    return null;
  }
}

function base64ByteLength(b64) {
  return Math.floor((b64.length * 3) / 4);
}

function buildInstructions(task, hasFiles) {
  const guardrail = hasFiles ? `\n\n${AI_GUARDRAIL_TEXT}` : "";
  if (task === "improve") {
    return (
      "Du bist ein präziser Prompt-Optimierer für professionelle Hospitality-/Event-Projektarbeit. " +
      "Du erhältst einen bereits vollständig strukturierten KI-Prompt mit 11 nummerierten Abschnitten " +
      "(PERSONA/ROLLE, AUFGABE, KONTEXT, ZIEL, ZIELGRUPPE, ANFORDERUNGEN, SCHNITTSTELLEN, RISIKEN, " +
      "OUTPUT-FORMAT, STIL & TONALITÄT, QUALITÄTSCHECK). Verbessere ausschliesslich Klarheit, Präzision " +
      "und Widerspruchsfreiheit der Formulierungen — erfinde keine neuen inhaltlichen Fakten und behalte " +
      "die 11-Abschnitte-Struktur und Nummerierung exakt bei. Antworte NUR mit dem verbesserten Prompt, " +
      "ohne Vorwort, Nachwort oder Erklärungen." + guardrail
    );
  }
  return (
    "Du agierst als die im folgenden Prompt definierte KI-Persona für ein reales Hospitality-Projekt " +
    "(Sunrise VIP Cube, FIS Ski World Cup Adelboden 2027, Hotelfachschule Thun). Befolge den Prompt " +
    "vollständig und liefere den geforderten Output in den geforderten Formaten. Formatiere die Antwort " +
    "gut lesbar in Markdown (Überschriften, Listen, Tabellen wo sinnvoll)." + guardrail
  );
}

async function callOpenAI({ apiKey, task, promptText, fileBlocks }) {
  const instructions = buildInstructions(task, fileBlocks.length > 0);

  const userContent = [{ type: "input_text", text: promptText }];
  for (const block of fileBlocks) {
    if (block.type === "text") {
      userContent.push({ type: "input_text", text: `\n\n### Datei: ${block.name}\n\n${block.text}` });
    } else if (block.type === "pdf") {
      userContent.push({
        type: "input_file",
        filename: block.name,
        file_data: `data:application/pdf;base64,${block.base64}`
      });
    }
  }

  const body = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: [{ type: "input_text", text: instructions }] },
      { role: "user", content: userContent }
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS[task] || 1400
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch (e) { /* ignore */ }
    const err = new Error(detail || `OpenAI request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return { text: data.output_text.trim(), model: data.model || OPENAI_MODEL };
  }

  let text = "";
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === "string") text += c.text;
        }
      }
    }
  }
  return { text: text.trim(), model: data.model || OPENAI_MODEL };
}

// ---- main handler (Netlify Functions v2 API) --------------------

export default async (request, context) => {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Nur POST wird unterstützt.");
  }

  const ip =
    context?.ip ||
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return errorResponse(429, "rate_limited", "Zu viele Anfragen in kurzer Zeit. Bitte kurz warten und erneut versuchen.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(200, {
      ok: false,
      code: "not_configured",
      message: "KI-Funktion ist noch nicht konfiguriert. Bitte Administrator kontaktieren."
    });
  }

  // Guard against oversized raw request bodies before even parsing JSON.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_TOTAL_REQUEST_BYTES) {
    return errorResponse(400, "request_too_large", "Die Anfrage (Prompt + Dateien) ist zu gross. Bitte Dateien entfernen oder verkleinern.");
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return errorResponse(400, "invalid_request", "Ungültige Anfrage (kein gültiges JSON).");
  }

  const { task, prompt, files } = payload || {};

  if (task !== "improve" && task !== "answer") {
    return errorResponse(400, "invalid_request", "Ungültiger KI-Modus.");
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return errorResponse(400, "invalid_request", "Kein Prompt übergeben.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return errorResponse(400, "invalid_request", `Der Prompt ist zu lang (max. ${MAX_PROMPT_CHARS} Zeichen).`);
  }

  const fileList = Array.isArray(files) ? files : [];
  if (fileList.length > MAX_FILES) {
    return errorResponse(400, "invalid_request", `Maximal ${MAX_FILES} Dateien erlaubt.`);
  }

  const fileBlocks = [];
  let contextCharsUsed = 0;

  for (const f of fileList) {
    if (!f || typeof f.name !== "string" || typeof f.kind !== "string") {
      return errorResponse(400, "invalid_request", "Ungültige Datei-Angaben.");
    }

    if (f.kind === "text") {
      if (typeof f.text !== "string") {
        return errorResponse(400, "invalid_request", `Datei "${f.name}": kein Textinhalt übermittelt.`);
      }
      if (!f.text.trim()) {
        return errorResponse(400, "invalid_request", `Datei "${f.name}" ist leer.`);
      }
      let text = f.text;
      const remaining = MAX_CONTEXT_CHARS - contextCharsUsed;
      if (remaining <= 0) continue; // budget used up — silently skip remaining files' text
      if (text.length > remaining) text = text.slice(0, remaining) + "\n[... gekürzt ...]";
      contextCharsUsed += text.length;
      fileBlocks.push({ type: "text", name: f.name, text });
    } else if (f.kind === "pdf" || f.kind === "docx") {
      if (typeof f.base64 !== "string" || !f.base64) {
        return errorResponse(400, "invalid_request", `Datei "${f.name}": kein Dateiinhalt übermittelt.`);
      }
      const approxBytes = base64ByteLength(f.base64);
      if (approxBytes === 0) {
        return errorResponse(400, "invalid_request", `Datei "${f.name}" ist leer.`);
      }
      if (approxBytes > MAX_FILE_SIZE_BYTES) {
        return errorResponse(400, "file_too_large", `Datei "${f.name}" ist zu gross (max. ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB).`);
      }

      if (f.kind === "pdf") {
        fileBlocks.push({ type: "pdf", name: f.name, base64: f.base64 });
      } else {
        // docx: extract text server-side (zero-dependency zip/inflate)
        let buf;
        try {
          buf = Buffer.from(f.base64, "base64");
        } catch (e) {
          return errorResponse(400, "invalid_request", `Datei "${f.name}" konnte nicht gelesen werden.`);
        }
        const extracted = extractDocxText(buf);
        if (!extracted) {
          // Don't fail the whole request — just skip this file's context.
          fileBlocks.push({ type: "text", name: f.name, text: "[Dokument konnte nicht verarbeitet werden — Inhalt nicht verfügbar.]" });
          continue;
        }
        let text = extracted;
        const remaining = MAX_CONTEXT_CHARS - contextCharsUsed;
        if (remaining <= 0) continue;
        if (text.length > remaining) text = text.slice(0, remaining) + "\n[... gekürzt ...]";
        contextCharsUsed += text.length;
        fileBlocks.push({ type: "text", name: f.name, text });
      }
    } else {
      return errorResponse(400, "invalid_request", `Nicht unterstützter Dateityp bei "${f.name}".`);
    }
  }

  try {
    const { text, model } = await callOpenAI({ apiKey, task, promptText: prompt, fileBlocks });
    if (!text) {
      return errorResponse(502, "upstream_error", "KI momentan nicht verfügbar. Bitte später erneut versuchen.");
    }
    return jsonResponse(200, { ok: true, result: text, model });
  } catch (err) {
    if (err?.name === "AbortError") {
      return errorResponse(504, "timeout", "Die KI-Anfrage hat zu lange gedauert. Bitte erneut versuchen oder Kontext verkleinern.");
    }
    const status = err?.status;
    // eslint-disable-next-line no-console
    console.error("generate-ai upstream error:", status, err?.message);
    if (status === 401 || status === 403) {
      return errorResponse(500, "misconfigured", "KI-Funktion ist falsch konfiguriert. Bitte Administrator kontaktieren.");
    }
    if (status === 429) {
      return errorResponse(429, "rate_limited", "Die KI ist gerade stark ausgelastet. Bitte kurz warten und erneut versuchen.");
    }
    return errorResponse(502, "upstream_error", "KI momentan nicht verfügbar. Bitte später erneut versuchen.");
  }
};
