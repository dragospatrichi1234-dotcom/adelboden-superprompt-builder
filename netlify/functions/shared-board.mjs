/* ============================================================
   ADELBODEN 2027 – Supabase-Client
   Zentrale, gemeinsam genutzte strukturierte Projektdaten (Phase 1:
   nur Lesezugriff — Teams). Deadlines/Tasks/Phasen/Entscheidungen
   bleiben vorerst auf Netlify Blobs, bis ein sicherer Schreibweg
   (Netlify-Function-Proxy oder Supabase Auth + RLS) existiert.

   Nur der öffentliche "publishable" Key steht hier — das ist für den
   Browser vorgesehen und sicher. Der service_role/secret Key darf nie
   in Frontend-Code auftauchen.
   ============================================================ */

(function () {
  "use strict";

  var SUPABASE_URL = "https://mpewytnwqgflmlllqaay.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_vbGQs-Jk9WeWAgOtFaWJTQ_V0E_bMkL";

  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    window.sbClient = null;
    console.error("Supabase-Client konnte nicht initialisiert werden (Bibliothek nicht geladen).");
  }
})();
