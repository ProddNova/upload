const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const urlModule = require("url");

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
//  MIDDLEWARE GENERICI
// ===============================

app.use(express.json());

// Serviamo tutti i file statici (index.html, spots.csv, ecc.)
app.use(express.static(path.join(__dirname)));

// Funzione getTipo (copia dal frontend)
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

// Funzione per seguire redirect e risolvere short URL Google Maps
async function resolveGoogleMapsUrl(shortUrl) {
  return new Promise((resolve, reject) => {
    const parsed = urlModule.parse(shortUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    let redirects = 0;
    const maxRedirects = 5;

    function follow(urlStr) {
      if (redirects >= maxRedirects) {
        return reject(new Error('Too many redirects'));
      }

      const url = urlModule.parse(urlStr);
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };

      const req = client.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirects++;
          return follow(res.headers.location);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Estrai lat/lng dall'URL finale o dal contenuto
          const finalUrl = res.responseUrl || urlStr;
          const match = finalUrl.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
          if (match) {
            resolve({
              lat: parseFloat(match[1]),
              lng: parseFloat(match[2]),
              name: '' // Nome non estratto, da frontend
            });
          } else {
            // Fallback: cerca nel contenuto (es. meta tags o testo)
            const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
            const name = titleMatch ? titleMatch[1].replace(' - Google Maps', '').trim() : '';
            const latLngMatch = data.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/) || data.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
            if (latLngMatch) {
              resolve({
                lat: parseFloat(latLngMatch[1]),
                lng: parseFloat(latLngMatch[2]),
                name
              });
            } else {
              reject(new Error('Impossibile estrarre coordinate'));
            }
          }
        });
      });

      req.on('error', reject);
      req.end();
    }

    follow(shortUrl);
  });
}

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

// DELETE singolo spot
app.delete("/api/spots-extra/:id", (req, res) => {
  try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    }
    current = current.filter(s => s.id !== req.params.id);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json({success: true});
  } catch(e) {
    res.status(500).json({error: "errore"});
  }
});

// PUT (update) singolo spot
app.put("/api/spots-extra/:id", (req, res) => {
  try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    }
    const index = current.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({error: "non trovato"});
    
    current[index] = { ...current[index], ...req.body, tipo: req.body.tipo || getTipo(req.body.name, req.body.desc) };
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json(current[index]);
  } catch(e) {
    res.status(500).json({error: "errore"});
  }
});

// NUOVO ENDPOINT: Parse Google Maps short URL
app.get("/api/parse-gmaps", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL obbligatorio" });
  }

  try {
    const result = await resolveGoogleMapsUrl(url);
    res.json(result);
  } catch (err) {
    console.error("Errore parsing GMaps URL:", err);
    res.status(500).json({ error: "Impossibile estrarre coordinate dal link" });
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
