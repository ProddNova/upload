const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const urlModule = require("url");
const app = express();

// ===============================
// CONFIG
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

// ===============================
// UTILS
// ===============================
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

// Risoluzione link Google Maps (anche maps.app.goo.gl)
async function resolveGoogleMapsUrl(inputUrl) {
  return new Promise((resolve, reject) => {
    let urlStr = inputUrl.trim();
    if (!/^https?:\/\//i.test(urlStr)) urlStr = "https://" + urlStr;

    const parsed = urlModule.parse(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;
    let redirects = 0;
    const maxRedirects = 10;

    function follow(currentUrl) {
      if (redirects++ > maxRedirects) return reject(new Error("Troppi redirect"));

      const opts = {
        hostname: urlModule.parse(currentUrl).hostname,
        path: urlModule.parse(currentUrl).path,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      };

      client.get(opts, res => {
        if (res.headers.location) {
          return follow(res.headers.location);
        }

        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          // Cerchiamo @lat,lng o data=...!3d...!4d...
          const finalUrl = res.responseUrl || currentUrl;
          let lat, lng, name = '';

          // 1. @lat,lng
          const atMatch = finalUrl.match(/@([0-9\.\-]+),([0-9\.\-]+)/);
          if (atMatch) {
            lat = parseFloat(atMatch[1]);
            lng = parseFloat(atMatch[2]);
          }

          // 2. !3d(lat)!4d(lng)
          if (!lat || !lng) {
            const dataMatch = finalUrl.match(/!3d([0-9\.\-]+)!4d([0-9\.\-]+)/);
            if (dataMatch) {
              lat = parseFloat(dataMatch[1]);
              lng = parseFloat(dataMatch[2]);
            }
          }

          // Estrai nome se presente
          const titleMatch = body.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            name = titleMatch[1].replace(/ - Google Maps.*/, '').trim();
          }

          if (lat && lng) {
            resolve({ lat, lng, name });
          } else {
            reject(new Error("Coordinate non trovate"));
          }
        });
      }).on('error', reject);
    }

    follow(urlStr);
  });
}

// ===============================
// API SPOTS-EXTRA
// ===============================
app.get("/api/spots-extra", (req, res) => {
  if (!fs.existsSync(EXTRA_FILE)) return res.json([]);
  try {
    const data = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error(e);
    res.json([]);
  }
});

app.post("/api/spots-extra", (req, res) => {
  const { name, desc = "", lat, lng, voto, tipo } = req.body;
  if (!name || lat == null || lng == null) return res.status(400).json({ error: "name, lat, lng obbligatori" });

  const latF = parseFloat(lat);
  const lngF = parseFloat(lng);
  if (isNaN(latF) || isNaN(lngF)) return res.status(400).json({ error: "Coordinate invalide" });

  let votoN = null;
  if (voto != null) {
    const v = parseInt(voto, 10);
    if (v >= 1 && v <= 6) votoN = v;
  }

  let current = [];
  if (fs.existsSync(EXTRA_FILE)) {
    try { current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]"); } catch (_) {}
  }

  const spot = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    name: String(name),
    desc: String(desc),
    lat: latF,
    lng: lngF,
    voto: votoN,
    tipo: tipo || getTipo(name, desc),
    createdAt: new Date().toISOString(),
    createdBy: "user"
  };

  current.push(spot);
  fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
  res.status(201).json(spot);
});

app.delete("/api/spots-extra/:id", (req, res) => {
  if (!fs.existsSync(EXTRA_FILE)) return res.json({ success: true });
  try {
    let data = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    data = data.filter(s => s.id !== req.params.id);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "errore" });
  }
});

app.put("/api/spots-extra/:id", (req, res) => {
  if (!fs.existsSync(EXTRA_FILE)) return res.status(404).json({ error: "non trovato" });
  try {
    let data = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    const idx = data.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "non trovato" });

    const { name, desc = "", lat, lng, voto } = req.body;
    const latF = parseFloat(lat);
    const lngF = parseFloat(lng);
    let votoN = null;
    if (voto != null) {
      const v = parseInt(voto, 10);
      if (v >= 1 && v <= 6) votoN = v;
    }

    data[idx] = {
      ...data[idx],
      name: name || data[idx].name,
      desc,
      lat: isNaN(latF) ? data[idx].lat : latF,
      lng: isNaN(lngF) ? data[idx].lng : lngF,
      voto: votoN,
      tipo: req.body.tipo || getTipo(name || data[idx].name, desc)
    };

    fs.writeFileSync(EXTRA_FILE, JSON.stringify(data, null, 2));
    res.json(data[idx]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "errore" });
  }
});

// NUOVO ENDPOINT: parsare link Google Maps (anche brevi)
app.get("/api/parse-gmaps", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url mancante" });

  try {
    const result = await resolveGoogleMapsUrl(url);
    res.json(result);
  } catch (err) {
    console.error("Parse GMaps fallito:", err.message);
    res.status(500).json({ error: err.message || "Impossibile parsare il link" });
  }
});

// ===============================
// SETTINGS
// ===============================
function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

app.get("/api/settings", (req, res) => res.json(readSettings()));

app.post("/api/settings", (req, res) => {
  try {
    const incoming = req.body || {};
    const current = readSettings();
    const updated = { ...current };

    if (["osm", "osmHot", "satellite"].includes(incoming.baseLayer)) updated.baseLayer = incoming.baseLayer;
    if (typeof incoming.randomIncludeLowRated === "boolean") updated.randomIncludeLowRated = incoming.randomIncludeLowRated;

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "errore salvataggio" });
  }
});

// ===============================
// ROUTES
// ===============================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server LTU attivo su http://localhost:${port}`);
  console.log(`Credenziali: ${USERNAME} / ${PASSWORD}`);
});
