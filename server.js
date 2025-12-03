const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// ======================
//  CONFIGURAZIONE PASSWORD
// ======================
// Cambia questa password oppure usa una variabile di ambiente APP_PASSWORD
const PASSWORD = process.env.APP_PASSWORD || "cambia-questa-password";

// File per salvare gli spot aggiuntivi
const EXTRA_FILE = path.join(__dirname, "spots-extra.json");

// Middleware Basic Auth molto semplice
app.use((req, res, next) => {
  const auth = req.headers["authorization"];

  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Mappa spot abbandonati"');
    return res.status(401).send("Authentication required.");
  }

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Basic") {
    return res.status(400).send("Bad Authorization header.");
  }

  const decoded = Buffer.from(parts[1], "base64").toString("utf8");
  const index = decoded.indexOf(":");
  const user = index >= 0 ? decoded.slice(0, index) : "";
  const pass = index >= 0 ? decoded.slice(index + 1) : decoded;

  if (pass !== PASSWORD) {
    return res.status(403).send("Accesso negato.");
  }

  req.user = user || "user";
  next();
});

// Per leggere JSON nel body delle richieste
app.use(express.json());

// Serviamo tutti i file statici dalla cartella corrente
app.use(express.static(path.join(__dirname)));

// Endpoint API per leggere gli spot aggiuntivi
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

// Endpoint API per aggiungere un nuovo spot
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
      createdAt: new Date().toISOString()
    };

    current.push(spot);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2), "utf8");

    res.status(201).json(spot);
  } catch (err) {
    console.error("Errore salvataggio spot:", err);
    res.status(500).json({ error: "Errore salvataggio spot" });
  }
});

// Route principale: index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Avvio server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server attivo su port " + port);
});
