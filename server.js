const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// ===============================
//  CONFIG: LOGIN E FILE DI STORAGE
// ===============================

// Utente e password di default (puoi sovrascrivere con variabili d'ambiente)
const USERNAME = process.env.APP_USER || "unit";
const PASSWORD = process.env.APP_PASSWORD || "ltunit";

// File dove salviamo gli spot aggiunti dagli utenti
const EXTRA_FILE = path.join(__dirname, "spots-extra.json");

// File dove salviamo le impostazioni condivise tra tutti
const SETTINGS_FILE = path.join(__dirname, "settings.json");

// Impostazioni di default se il file non esiste ancora
const DEFAULT_SETTINGS = {
  version: 1,
  baseLayer: "osm",            // "osm", "osmHot", "satellite"
  mapStyle: "default",         // per futuri temi
  randomIncludeLowRated: false // se includere voti 1-2 nel random
};

// ===============================
//  MIDDLEWARE: BASIC AUTH
// ===============================

app.use((req, res, next) => {
  const auth = req.headers["authorization"];

  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Lost Trace Unit"');
    return res.status(401).send("Authentication required.");
  }

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Basic") {
    return res.status(400).send("Bad Authorization header.");
  }

  const decoded = Buffer.from(parts[1], "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const user = idx >= 0 ? decoded.slice(0, idx) : "";
  const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;

  // Controllo sia user che password
  if (user !== USERNAME || pass !== PASSWORD) {
    return res.status(403).send("Accesso negato.");
  }

  req.user = user;
  next();
});
app.use((req, res, next) => {
  // blocca URL con credenziali nella barra
  if (req.originalUrl.includes("@")) {
    return res.status(400).send("Formato URL non permesso.");
  }
  next();
});
// ===============================
//  MIDDLEWARE GENERICI
// ===============================

app.use(express.json());

// Serviamo tutti i file statici (index.html, spots.csv, ecc.)
app.use(express.static(path.join(__dirname)));

// ===============================
//  API: SPOT EXTRA
// ===============================

// GET /api/spots-extra  -> lista spot aggiuntivi
app.get("/api/spots-extra", (req, res) => {
  try {
    if (!fs.existsSync(EXTRA_FILE)) {
      return res.json([]);
    }
    const raw = fs.readFileSync(EXTRA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return res.json([]);
    }
    res.json(data);
  } catch (err) {
    console.error("Errore lettura spots-extra:", err);
    res.status(500).json({ error: "Errore lettura spots-extra" });
  }
});

// POST /api/spots-extra  -> aggiunge un nuovo spot
app.post("/api/spots-extra", (req, res) => {
  try {
    const { name, desc, lat, lng, voto, tipo } = req.body || {};

    if (!name || lat == null || lng == null) {
      return res.status(400).json({ error: "name, lat, lng sono obbligatori" });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ error: "Coordinate non valide" });
    }

    let votoNum = null;
    if (voto != null) {
      const v = parseInt(voto, 10);
      if (v >= 1 && v <= 6) votoNum = v;
    }

    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      try {
        const raw = fs.readFileSync(EXTRA_FILE, "utf8");
        const data = JSON.parse(raw);
        if (Array.isArray(data)) current = data;
      } catch (e) {
        console.error("Errore parse spots-extra, resetto array:", e);
      }
    }

    const spot = {
      id: Date.now().toString(),
      name: String(name),
      desc: desc != null ? String(desc) : "",
      lat: latNum,
      lng: lngNum,
      voto: votoNum,
      tipo: tipo ? String(tipo) : null,
      createdAt: new Date().toISOString(),
      createdBy: req.user || "unit"
    };

    current.push(spot);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2), "utf8");

    res.status(201).json(spot);
  } catch (err) {
    console.error("Errore salvataggio spot:", err);
    res.status(500).json({ error: "Errore salvataggio spot" });
  }
});

// ===============================
//  API: SETTINGS CONDIVISE
// ===============================

// Funzione di utilità per leggere settings con fallback
function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...data };
  } catch (err) {
    console.error("Errore lettura settings:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

// GET /api/settings  -> restituisce le impostazioni condivise
app.get("/api/settings", (req, res) => {
  const settings = readSettings();
  res.json(settings);
});

// POST /api/settings  -> aggiorna le impostazioni condivise
app.post("/api/settings", (req, res) => {
  try {
    const incoming = req.body || {};
    const current = readSettings();

    const updated = { ...current };

    if (incoming.baseLayer && ["osm", "osmHot", "satellite"].includes(incoming.baseLayer)) {
      updated.baseLayer = incoming.baseLayer;
    }

    if (incoming.mapStyle && typeof incoming.mapStyle === "string") {
      updated.mapStyle = incoming.mapStyle;
    }

    if (typeof incoming.randomIncludeLowRated === "boolean") {
      updated.randomIncludeLowRated = incoming.randomIncludeLowRated;
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf8");

    res.json(updated);
  } catch (err) {
    console.error("Errore salvataggio settings:", err);
    res.status(500).json({ error: "Errore salvataggio settings" });
  }
});

// ===============================
//  ROUTE PRINCIPALE
// ===============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
//  AVVIO SERVER
// ===============================

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server attivo su port " + port);
  console.log("Login: user =", USERNAME, "password =", PASSWORD);
});

