// ============================================================
// ADELBODEN 2027 – SUPERPROMPT BUILDER
// Netlify Function: shared-file-download
//
// Streams the raw bytes of a shared Team-Board file back to the
// browser. Reading/downloading is intentionally open to everyone
// (only uploading/deleting is password-protected, in shared-board.mjs).
// ============================================================

import { getStore } from "@netlify/blobs";

export default async (request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const meta = await getStore("shared-files-meta").get(id, { type: "json" });
  if (!meta) return new Response("Not found", { status: 404 });

  const data = await getStore("shared-files-content").get(id, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });

  const safeName = String(meta.name || "datei").replace(/["\r\n]/g, "");

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": meta.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "no-cache"
    }
  });
};
