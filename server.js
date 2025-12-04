const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const app = express();
const basicAuth = require("basic-auth");

// ===============================
// CONFIG: LOGIN E FILE DI STORAGE
// ===============================
const USERNAME = process.env.APP_USER || "unit";
const PASSWORD = process.env.APP_PASSWORD || "ltunit";
const EXTRA_FILE = path.join(__dirname, "spots-extra.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

const DEFAULT_SETTINGS = {
  version: 1,
  baseLayer: "osm",
  mapStyle: "default",
  randomIncludeLowRated: false
};

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Middleware di autenticazione per operazioni critiche
const authMiddleware = (req, res, next) => {
  const user = basicAuth(req);
  if (!user || user.name !== USERNAME || user.pass !== PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="LTU Admin"');
    return res.status(401).json({ error: "Accesso non autorizzato" });
  }
  next();
};

// Funzione getTipo
function getTipo(name, desc) {
  const text = (name + " " + (desc || "")).toLowerCase();
  if (text.includes("hotel") || text.includes("ostello") || text.includes("residence")) return "hotel";
  if (text.includes("villa") || text.includes("villone") || text.includes("villino") || text.includes("villetta") || text.includes("ville")) return "villa";
  if (text.includes("casa") || text.includes("casetta") || text.includes("casone") || text.includes("case") || text.includes("cascina") || text.includes("casolare")) return "casa";
  if (text.includes("fabbrica") || text.includes("capannone") || text.includes("magazzino") || text.includes("distilleria") || text.includes("cantiere") || text.includes("impresa edile") || text.includes("stazione") || text.includes("centro commerciale")) return "industria";
  if (text.includes("scuola") || text.includes("itis")) return "scuola";
  if (text.includes("chiesa")) return "chiesa";
  if (text.includes("colonia")) return "colonia";
  if (text.includes("prigione") || text.includes("manicomio") || text.includes("ospedale") || text.includes("clinica") || text.includes("convento")) return "istituzione";
  if (text.includes("discoteca") || text.includes("bar") || text.includes("ristorante") || text.includes("pizzeria")) return "svago";
  if (text.includes("castello")) return "castello";
  if (text.includes("nave")) return "nave";
  if (text.includes("diga")) return "diga";
  if (text.includes("base nato")) return "militare";
  return "altro";
}

// ===============================
// API: SPOT EXTRA
// ===============================
app.get("/api/spots-extra", (req, res) => {
  try {
    if (!fs.existsSync(EXTRA_FILE)) return res.json([]);
    const raw = fs.readFileSync(EXTRA_FILE, "utf8");
    const data = JSON.parse(raw);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Errore lettura spots-extra:", err);
    res.status(500).json({ error: "Errore lettura spots-extra" });
  }
});

app.post("/api/spots-extra", authMiddleware, (req, res) => {
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
      tipo: tipo ? String(tipo) : getTipo(name, desc),
      createdAt: new Date().toISOString(),
      createdBy: req.user ? req.user.name : "unit"
    };

    current.push(spot);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2), "utf8");
    res.status(201).json(spot);
  } catch (err) {
    console.error("Errore salvataggio spot:", err);
    res.status(500).json({ error: "Errore salvataggio spot" });
  }
});

app.delete("/api/spots-extra/:id", authMiddleware, (req, res) => {
  try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    }
    current = current.filter(s => s.id !== req.params.id);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "errore" });
  }
});

app.put("/api/spots-extra/:id", authMiddleware, (req, res) => {
  try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    }
    const index = current.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "non trovato" });

    current[index] = { 
      ...current[index], 
      ...req.body, 
      tipo: req.body.tipo || getTipo(req.body.name, req.body.desc),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json(current[index]);
  } catch (e) {
    res.status(500).json({ error: "errore" });
  }
});

// ===============================
// API: DECODE GOOGLE MAPS URL
// ===============================
app.post("/api/decode-gmaps-url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL richiesto" });

    let finalUrl = url;
    
    // Risolvi short URL
    if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
      try {
        const resolved = await resolveShortUrl(url);
        finalUrl = resolved;
      } catch (e) {
        console.warn("Impossibile risolvere short URL:", e);
      }
    }

    // Estrai coordinate
    const coords = extractCoordsFromUrl(finalUrl);
    if (!coords) return res.status(400).json({ error: "Coordinate non trovate nell'URL" });

    res.json({
      lat: coords.lat,
      lng: coords.lng,
      sourceUrl: finalUrl
    });
  } catch (err) {
    console.error("Errore decodifica URL:", err);
    res.status(500).json({ error: "Errore decodifica URL" });
  }
});

// ===============================
// API: SETTINGS CONDIVISE
// ===============================
function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...data };
  } catch (err) {
    console.error("Errore lettura settings:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

app.get("/api/settings", (req, res) => {
  const settings = readSettings();
  res.json(settings);
});

app.post("/api/settings", authMiddleware, (req, res) => {
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
// HELPER FUNCTIONS
// ===============================
function extractCoordsFromUrl(url) {
  try {
    // Cerca pattern @lat,lng
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }

    // Cerca pattern /place/lat,lng
    const placeMatch = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    }

    // Cerca pattern ?q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }

    // Cerca pattern data=!4d...!3d...
    const dataMatch = url.match(/data=!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dataMatch) {
      return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) };
    }

    return null;
  } catch (e) {
    return null;
  }
}

function resolveShortUrl(shortUrl) {
  return new Promise((resolve, reject) => {
    https.get(shortUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(response.headers.location);
      } else {
        reject(new Error("Impossibile risolvere short URL"));
      }
    }).on("error", reject);
  });
}

// ===============================
// ROUTE PRINCIPALE
// ===============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
// AVVIO SERVER
// ===============================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server attivo su http://localhost:${port}`);
  console.log(`Login: user="${USERNAME}" password="${PASSWORD}"`);
});