const express = require("express");
const path = require("path");
const fs = require("fs");
const fs = require("fs").promises;
const https = require("https");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ===============================
@@ -12,170 +14,696 @@ const PASSWORD = process.env.APP_PASSWORD || "ltunit";
const EXTRA_FILE = path.join(__dirname, "spots-extra.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");

// Locks per prevenire race conditions
const locks = {
  spots: { locked: false, queue: [] },
  settings: { locked: false, queue: [] }
};

const DEFAULT_SETTINGS = {
  version: 1,
  version: 2,
baseLayer: "osm",
mapStyle: "default",
  randomIncludeLowRated: false
  randomIncludeLowRated: false,
  lastUpdated: null
};

// ===============================
// UTILITY FUNCTIONS CON LOCKING ROBUSTO
// ===============================
async function acquireLock(resource) {
  return new Promise((resolve, reject) => {
    const lock = locks[resource];
    
    const tryAcquire = () => {
      if (!lock.locked) {
        lock.locked = true;
        resolve(() => {
          lock.locked = false;
          if (lock.queue.length > 0) {
            const next = lock.queue.shift();
            setTimeout(next, 0);
          }
        });
      } else {
        lock.queue.push(tryAcquire);
      }
    };
    
    tryAcquire();
    
    // Timeout dopo 10 secondi per evitare deadlock
    setTimeout(() => {
      if (lock.queue.includes(tryAcquire)) {
        const index = lock.queue.indexOf(tryAcquire);
        if (index > -1) lock.queue.splice(index, 1);
        reject(new Error(`Timeout acquiring lock for ${resource}`));
      }
    }, 10000);
  });
}

async function withLock(resource, operation) {
  const release = await acquireLock(resource);
  try {
    const result = await operation();
    return result;
  } finally {
    release();
  }
}

async function safeReadJson(filePath, defaultValue = null) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Validazione base
    if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
      console.warn(`Invalid data format in ${filePath}, returning default`);
      return defaultValue;
    }
    
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File non esiste, crea con valore di default
      try {
        await safeWriteJson(filePath, defaultValue);
        return defaultValue;
      } catch (writeError) {
        console.error(`Failed to create ${filePath}:`, writeError);
        return defaultValue;
      }
    }
    
    console.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

async function safeWriteJson(filePath, data) {
  const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Scrive su file temporaneo
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
    
    // Verifica che il file sia valido JSON
    const verifyData = await fs.readFile(tempFile, 'utf8');
    JSON.parse(verifyData); // Se fallisce, throw
    
    // Backup del file originale se esiste
    try {
      const backupFile = `${filePath}.backup.${Date.now()}`;
      await fs.copyFile(filePath, backupFile);
    } catch (e) {
      // Ignora errori di backup
    }
    
    // Rinomina atomico
    await fs.rename(tempFile, filePath);
    
    // Pulisci vecchi file temporanei
    try {
      const files = await fs.readdir(path.dirname(filePath));
      const tempFiles = files.filter(f => f.includes('.tmp.'));
      for (const tempFile of tempFiles) {
        const fileAge = Date.now() - parseInt(tempFile.split('.')[2]);
        if (fileAge > 3600000) { // Più vecchio di 1 ora
          await fs.unlink(path.join(path.dirname(filePath), tempFile));
        }
      }
    } catch (e) {
      // Ignora errori di pulizia
    }
    
    return true;
  } catch (error) {
    // Cleanup in caso di errore
    try {
      await fs.unlink(tempFile).catch(() => {});
    } catch (e) {}
    
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Middleware di autenticazione senza dipendenze esterne
// CORS middleware completo
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Permetti qualsiasi origine in sviluppo, o specifica in produzione
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${timestamp} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  
  next();
});

// Middleware di autenticazione
const authMiddleware = (req, res, next) => {
  // Skip auth per GET requests (solo lettura)
  if (req.method === 'GET') {
    return next();
  }
  
const authHeader = req.headers.authorization;
if (!authHeader || !authHeader.startsWith('Basic ')) {
res.set("WWW-Authenticate", 'Basic realm="LTU Admin"');
    return res.status(401).json({ error: "Accesso non autorizzato" });
    return res.status(401).json({ 
      error: "Accesso non autorizzato",
      code: "AUTH_REQUIRED"
    });
}

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  if (username !== USERNAME || password !== PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="LTU Admin"');
    return res.status(401).json({ error: "Accesso non autorizzato" });
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');
    
    if (username !== USERNAME || password !== PASSWORD) {
      res.set("WWW-Authenticate", 'Basic realm="LTU Admin"');
      return res.status(401).json({ 
        error: "Credenziali non valide",
        code: "INVALID_CREDENTIALS"
      });
    }
    
    req.user = { 
      name: username,
      ip: req.ip,
      timestamp: new Date().toISOString()
    };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(400).json({ 
      error: "Formato autorizzazione non valido",
      code: "INVALID_AUTH_FORMAT"
    });
}
  
  req.user = { name: username };
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
  const text = ((name || '') + ' ' + (desc || '')).toLowerCase();
  
  const patterns = {
    hotel: ['hotel', 'ostello', 'residence', 'albergo', 'motel', 'bed and breakfast', 'b&b'],
    villa: ['villa', 'villone', 'villino', 'villetta', 'ville', 'villette'],
    casa: ['casa', 'casetta', 'casone', 'case', 'cascina', 'casolare', 'abitazione', 'appartamento'],
    industria: ['fabbrica', 'capannone', 'magazzino', 'distilleria', 'cantiere', 'impresa edile', 'stazione', 'centro commerciale', 'officina', 'stabilimento', 'deposito'],
    scuola: ['scuola', 'itis', 'liceo', 'istituto', 'università', 'college', 'asilo'],
    chiesa: ['chiesa', 'cattedrale', 'basilica', 'santuario', 'duomo', 'tempio'],
    colonia: ['colonia', 'campeggio', 'villaggio vacanze'],
    istituzione: ['prigione', 'manicomio', 'ospedale', 'clinica', 'convento', 'monastero', 'carcere', 'caserma'],
    svago: ['discoteca', 'bar', 'ristorante', 'pizzeria', 'cinema', 'teatro', 'pub', 'locale'],
    castello: ['castello', 'forte', 'fortezza', 'rocca', 'palazzo'],
    nave: ['nave', 'barca', 'imbarcazione', 'relitto', 'traghetto'],
    diga: ['diga', 'sbarramento', 'bacino'],
    militare: ['base nato', 'militare', 'caserma', 'poligono', 'installazione militare']
  };
  
  for (const [tipo, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return tipo;
    }
  }
  
return "altro";
}

// ===============================
// API: SPOT EXTRA
// API: SPOT EXTRA CON LOCKING
// ===============================
app.get("/api/spots-extra", (req, res) => {
app.get("/api/spots-extra", async (req, res) => {
try {
    if (!fs.existsSync(EXTRA_FILE)) return res.json([]);
    const raw = fs.readFileSync(EXTRA_FILE, "utf8");
    const data = JSON.parse(raw);
    res.json(Array.isArray(data) ? data : []);
    const data = await withLock('spots', async () => {
      return await safeReadJson(EXTRA_FILE, []);
    });
    
    res.json({
      success: true,
      data: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0,
      timestamp: new Date().toISOString()
    });
} catch (err) {
console.error("Errore lettura spots-extra:", err);
    res.status(500).json({ error: "Errore lettura spots-extra" });
    res.status(500).json({ 
      success: false,
      error: "Errore lettura spots-extra",
      message: err.message,
      code: "READ_ERROR"
    });
}
});

app.post("/api/spots-extra", authMiddleware, (req, res) => {
app.post("/api/spots-extra", authMiddleware, async (req, res) => {
try {
const { name, desc, lat, lng, voto, tipo } = req.body || {};
    if (!name || lat == null || lng == null) {
      return res.status(400).json({ error: "name, lat, lng sono obbligatori" });
    
    // Validazione input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Il nome è obbligatorio",
        code: "MISSING_NAME"
      });
}

    
    if (lat == null || lng == null) {
      return res.status(400).json({ 
        success: false,
        error: "Le coordinate sono obbligatorie",
        code: "MISSING_COORDINATES"
      });
    }
    
const latNum = parseFloat(lat);
const lngNum = parseFloat(lng);
    
if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ error: "Coordinate non valide" });
      return res.status(400).json({ 
        success: false,
        error: "Coordinate non valide",
        code: "INVALID_COORDINATES"
      });
}

    
    // Validazione range coordinate
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ 
        success: false,
        error: "Coordinate fuori range valido",
        code: "COORDINATES_OUT_OF_RANGE"
      });
    }
    
let votoNum = null;
    if (voto != null) {
    if (voto != null && voto !== "" && !isNaN(voto)) {
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
    
    const newSpot = {
      id: uuidv4(),
      name: String(name).trim(),
      desc: desc != null ? String(desc).trim() : "",
lat: latNum,
lng: lngNum,
voto: votoNum,
tipo: tipo ? String(tipo) : getTipo(name, desc),
createdAt: new Date().toISOString(),
      createdBy: req.user ? req.user.name : "unit"
      updatedAt: new Date().toISOString(),
      createdBy: req.user ? req.user.name : "anonymous",
      version: 1,
      status: "active"
};

    current.push(spot);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2), "utf8");
    res.status(201).json(spot);
    
    const result = await withLock('spots', async () => {
      let current = await safeReadJson(EXTRA_FILE, []);
      
      if (!Array.isArray(current)) {
        console.warn("Resetting spots data: not an array");
        current = [];
      }
      
      // Verifica duplicati (tolleranza di 10 metri)
      const duplicate = current.find(spot => {
        const latDiff = Math.abs(spot.lat - latNum);
        const lngDiff = Math.abs(spot.lng - lngNum);
        return latDiff < 0.0001 && lngDiff < 0.0001; // ~10 metri
      });
      
      if (duplicate) {
        throw {
          status: 409,
          message: "Esiste già uno spot in questa posizione",
          existingSpot: duplicate
        };
      }
      
      current.push(newSpot);
      await safeWriteJson(EXTRA_FILE, current);
      
      return {
        spot: newSpot,
        totalCount: current.length
      };
    });
    
    res.status(201).json({
      success: true,
      message: "Spot aggiunto con successo",
      data: result.spot,
      totalSpots: result.totalCount,
      timestamp: newSpot.createdAt
    });
    
} catch (err) {
console.error("Errore salvataggio spot:", err);
    res.status(500).json({ error: "Errore salvataggio spot" });
    
    if (err.status === 409) {
      return res.status(409).json({
        success: false,
        error: err.message,
        existingSpot: err.existingSpot,
        code: "DUPLICATE_SPOT"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Errore salvataggio spot",
      message: err.message,
      code: "SAVE_ERROR"
    });
}
});

app.delete("/api/spots-extra/:id", authMiddleware, (req, res) => {
app.delete("/api/spots-extra/:id", authMiddleware, async (req, res) => {
try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    const spotId = req.params.id;
    
    if (!spotId || spotId.length < 10) {
      return res.status(400).json({
        success: false,
        error: "ID spot non valido",
        code: "INVALID_ID"
      });
}
    current = current.filter(s => s.id !== req.params.id);
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "errore" });
    
    const result = await withLock('spots', async () => {
      let current = await safeReadJson(EXTRA_FILE, []);
      
      if (!Array.isArray(current)) {
        console.warn("Resetting spots data: not an array");
        current = [];
      }
      
      const initialLength = current.length;
      const filtered = current.filter(spot => spot.id !== spotId);
      
      if (filtered.length === initialLength) {
        throw {
          status: 404,
          message: "Spot non trovato"
        };
      }
      
      await safeWriteJson(EXTRA_FILE, filtered);
      
      return {
        deletedId: spotId,
        previousCount: initialLength,
        newCount: filtered.length
      };
    });
    
    res.json({
      success: true,
      message: "Spot eliminato con successo",
      deletedId: result.deletedId,
      previousCount: result.previousCount,
      remainingCount: result.newCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore eliminazione spot:", err);
    
    if (err.status === 404) {
      return res.status(404).json({
        success: false,
        error: err.message,
        code: "SPOT_NOT_FOUND"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Errore eliminazione spot",
      message: err.message,
      code: "DELETE_ERROR"
    });
}
});

app.put("/api/spots-extra/:id", authMiddleware, (req, res) => {
app.put("/api/spots-extra/:id", authMiddleware, async (req, res) => {
try {
    let current = [];
    if (fs.existsSync(EXTRA_FILE)) {
      current = JSON.parse(fs.readFileSync(EXTRA_FILE, "utf8") || "[]");
    const spotId = req.params.id;
    const { name, desc, lat, lng, voto, tipo } = req.body || {};
    
    if (!spotId || spotId.length < 10) {
      return res.status(400).json({
        success: false,
        error: "ID spot non valido",
        code: "INVALID_ID"
      });
}
    const index = current.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "non trovato" });

    // Correzione: Gestisci voto correttamente (potrebbe essere stringa vuota)
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Il nome è obbligatorio",
        code: "MISSING_NAME"
      });
    }
    
    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        error: "Le coordinate sono obbligatorie",
        code: "MISSING_COORDINATES"
      });
    }
    
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        error: "Coordinate non valide",
        code: "INVALID_COORDINATES"
      });
    }
    
let votoNum = null;
    if (req.body.voto !== undefined && req.body.voto !== "") {
      const v = parseInt(req.body.voto, 10);
    if (voto !== undefined && voto !== "" && !isNaN(voto)) {
      const v = parseInt(voto, 10);
if (v >= 1 && v <= 6) votoNum = v;
}
    
    const result = await withLock('spots', async () => {
      let current = await safeReadJson(EXTRA_FILE, []);
      
      if (!Array.isArray(current)) {
        console.warn("Resetting spots data: not an array");
        current = [];
      }
      
      const index = current.findIndex(spot => spot.id === spotId);
      
      if (index === -1) {
        throw {
          status: 404,
          message: "Spot non trovato"
        };
      }
      
      // Verifica duplicati (escludendo lo spot corrente)
      const duplicate = current.find((spot, idx) => {
        if (idx === index) return false;
        const latDiff = Math.abs(spot.lat - latNum);
        const lngDiff = Math.abs(spot.lng - lngNum);
        return latDiff < 0.0001 && lngDiff < 0.0001;
      });
      
      if (duplicate) {
        throw {
          status: 409,
          message: "Esiste già un altro spot in questa posizione",
          existingSpot: duplicate
        };
      }
      
      const updatedSpot = {
        ...current[index],
        name: String(name).trim(),
        desc: desc !== undefined ? String(desc).trim() : current[index].desc,
        lat: latNum,
        lng: lngNum,
        voto: votoNum,
        tipo: tipo ? String(tipo) : getTipo(name, desc || current[index].desc),
        updatedAt: new Date().toISOString(),
        updatedBy: req.user ? req.user.name : "anonymous"
      };
      
      current[index] = updatedSpot;
      await safeWriteJson(EXTRA_FILE, current);
      
      return {
        spot: updatedSpot,
        index: index,
        totalCount: current.length
      };
    });
    
    res.json({
      success: true,
      message: "Spot aggiornato con successo",
      data: result.spot,
      totalSpots: result.totalCount,
      timestamp: result.spot.updatedAt
    });
    
  } catch (err) {
    console.error("Errore aggiornamento spot:", err);
    
    if (err.status === 404) {
      return res.status(404).json({
        success: false,
        error: err.message,
        code: "SPOT_NOT_FOUND"
      });
    }
    
    if (err.status === 409) {
      return res.status(409).json({
        success: false,
        error: err.message,
        existingSpot: err.existingSpot,
        code: "DUPLICATE_COORDINATES"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Errore aggiornamento spot",
      message: err.message,
      code: "UPDATE_ERROR"
    });
  }
});

    current[index] = { 
      ...current[index], 
      name: req.body.name || current[index].name,
      desc: req.body.desc !== undefined ? req.body.desc : current[index].desc,
      lat: parseFloat(req.body.lat) || current[index].lat,
      lng: parseFloat(req.body.lng) || current[index].lng,
      voto: votoNum,
      tipo: req.body.tipo ? String(req.body.tipo) : getTipo(req.body.name || current[index].name, req.body.desc || current[index].desc),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(current, null, 2));
    res.json(current[index]);
  } catch (e) {
    console.error("Errore aggiornamento spot:", e);
    res.status(500).json({ error: "errore" });
// Endpoint per bulk operations (utile per recovery)
app.post("/api/spots-extra/bulk", authMiddleware, async (req, res) => {
  try {
    const { operation, spots } = req.body || {};
    
    if (!operation || !Array.isArray(spots)) {
      return res.status(400).json({
        success: false,
        error: "Operazione e array di spots richiesti",
        code: "INVALID_BULK_REQUEST"
      });
    }
    
    const result = await withLock('spots', async () => {
      let current = await safeReadJson(EXTRA_FILE, []);
      
      if (!Array.isArray(current)) {
        current = [];
      }
      
      const results = [];
      let newCount = current.length;
      
      if (operation === 'add') {
        for (const spotData of spots) {
          const { name, desc, lat, lng, voto, tipo } = spotData;
          
          if (name && lat != null && lng != null) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            
            if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
              const newSpot = {
                id: uuidv4(),
                name: String(name).trim(),
                desc: desc != null ? String(desc).trim() : "",
                lat: latNum,
                lng: lngNum,
                voto: voto != null ? parseInt(voto) : null,
                tipo: tipo || getTipo(name, desc),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: req.user ? req.user.name : "bulk_import",
                version: 1
              };
              
              current.push(newSpot);
              results.push({ success: true, id: newSpot.id, name: newSpot.name });
            } else {
              results.push({ success: false, error: "Coordinate non valide", data: spotData });
            }
          } else {
            results.push({ success: false, error: "Dati mancanti", data: spotData });
          }
        }
        
        newCount = current.length;
        await safeWriteJson(EXTRA_FILE, current);
      }
      
      return {
        operation,
        results,
        added: operation === 'add' ? results.filter(r => r.success).length : 0,
        totalSpots: newCount
      };
    });
    
    res.json({
      success: true,
      message: `Bulk operation '${operation}' completata`,
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore bulk operation:", err);
    res.status(500).json({
      success: false,
      error: "Errore bulk operation",
      message: err.message,
      code: "BULK_ERROR"
    });
}
});

@@ -185,9 +713,16 @@ app.put("/api/spots-extra/:id", authMiddleware, (req, res) => {
app.post("/api/decode-gmaps-url", async (req, res) => {
try {
const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL richiesto" });

    let finalUrl = url;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: "URL richiesto",
        code: "MISSING_URL"
      });
    }
    
    let finalUrl = url.trim();

// Risolvi short URL
if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
@@ -198,68 +733,386 @@ app.post("/api/decode-gmaps-url", async (req, res) => {
console.warn("Impossibile risolvere short URL:", e);
}
}

    
// Estrai coordinate
const coords = extractCoordsFromUrl(finalUrl);
    if (!coords) return res.status(400).json({ error: "Coordinate non trovate nell'URL" });

    
    if (!coords) {
      return res.status(400).json({
        success: false,
        error: "Coordinate non trovate nell'URL",
        code: "NO_COORDINATES_FOUND",
        url: finalUrl
      });
    }
    
res.json({
      lat: coords.lat,
      lng: coords.lng,
      sourceUrl: finalUrl
      success: true,
      data: {
        lat: coords.lat,
        lng: coords.lng,
        sourceUrl: finalUrl
      },
      timestamp: new Date().toISOString()
});
    
} catch (err) {
console.error("Errore decodifica URL:", err);
    res.status(500).json({ error: "Errore decodifica URL" });
    res.status(500).json({
      success: false,
      error: "Errore decodifica URL",
      message: err.message,
      code: "DECODE_ERROR"
    });
}
});

// ===============================
// API: SETTINGS CONDIVISE
// ===============================
function readSettings() {
async function readSettings() {
  return await withLock('settings', async () => {
    const settings = await safeReadJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  });
}

app.get("/api/settings", async (req, res) => {
try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const data = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...data };
    const settings = await readSettings();
    
    res.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString()
    });
    
} catch (err) {
console.error("Errore lettura settings:", err);
    return { ...DEFAULT_SETTINGS };
    res.status(500).json({
      success: false,
      error: "Errore lettura settings",
      message: err.message,
      code: "SETTINGS_READ_ERROR"
    });
}
}

app.get("/api/settings", (req, res) => {
  const settings = readSettings();
  res.json(settings);
});

app.post("/api/settings", authMiddleware, (req, res) => {
app.post("/api/settings", authMiddleware, async (req, res) => {
try {
const incoming = req.body || {};
    const current = readSettings();
    const updated = { ...current };
    
    const result = await withLock('settings', async () => {
      const current = await safeReadJson(SETTINGS_FILE, DEFAULT_SETTINGS);
      const updated = { ...current };
      
      // Validazione e aggiornamento
      const validLayers = [
        "osm", "osmHot", "satellite", "satellite2", "satellite3",
        "topo", "dark", "cartoLight", "stamenToner", "esriTopo",
        "esriOcean", "esriGray"
      ];
      
      if (incoming.baseLayer && validLayers.includes(incoming.baseLayer)) {
        updated.baseLayer = incoming.baseLayer;
      }
      
      if (incoming.mapStyle && typeof incoming.mapStyle === "string") {
        updated.mapStyle = incoming.mapStyle;
      }
      
      if (typeof incoming.randomIncludeLowRated === "boolean") {
        updated.randomIncludeLowRated = incoming.randomIncludeLowRated;
      }
      
      updated.lastUpdated = new Date().toISOString();
      updated.updatedBy = req.user ? req.user.name : "anonymous";
      
      await safeWriteJson(SETTINGS_FILE, updated);
      
      return updated;
    });
    
    res.json({
      success: true,
      message: "Settings aggiornate con successo",
      data: result,
      timestamp: result.lastUpdated
    });
    
  } catch (err) {
    console.error("Errore salvataggio settings:", err);
    res.status(500).json({
      success: false,
      error: "Errore salvataggio settings",
      message: err.message,
      code: "SETTINGS_WRITE_ERROR"
    });
  }
});

    if (incoming.baseLayer && [
      "osm", "osmHot", "satellite", "topo", "dark", 
      "cycle", "transport", "watercolor", "terrain", "satelliteHybrid",
      "cartoLight", "stamenToner", "esriTopo", "esriOcean", "esriGray",
      "satellite2", "satellite3"
    ].includes(incoming.baseLayer)) {
      updated.baseLayer = incoming.baseLayer;
    }
    if (incoming.mapStyle && typeof incoming.mapStyle === "string") {
      updated.mapStyle = incoming.mapStyle;
// ===============================
// HEALTH CHECK, STATS E BACKUP
// ===============================
app.get("/api/health", async (req, res) => {
  try {
    const spotsData = await withLock('spots', async () => {
      const spots = await safeReadJson(EXTRA_FILE, []);
      return {
        count: Array.isArray(spots) ? spots.length : 0,
        isValid: Array.isArray(spots),
        lastSpot: Array.isArray(spots) && spots.length > 0 ? spots[spots.length - 1] : null
      };
    });
    
    const settingsData = await withLock('settings', async () => {
      const settings = await safeReadJson(SETTINGS_FILE, DEFAULT_SETTINGS);
      return {
        exists: settings !== null,
        lastUpdated: settings.lastUpdated
      };
    });
    
    const memoryUsage = process.memoryUsage();
    
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      spots: spotsData,
      settings: settingsData,
      locks: {
        spots: locks.spots.locked,
        settings: locks.settings.locked,
        queueLengths: {
          spots: locks.spots.queue.length,
          settings: locks.settings.queue.length
        }
      }
    });
    
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({
      success: false,
      status: "degraded",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const spots = await withLock('spots', async () => {
      return await safeReadJson(EXTRA_FILE, []);
    });
    
    if (!Array.isArray(spots)) {
      throw new Error("Invalid spots data");
}
    if (typeof incoming.randomIncludeLowRated === "boolean") {
      updated.randomIncludeLowRated = incoming.randomIncludeLowRated;
    
    const stats = {
      total: spots.length,
      byTipo: {},
      byVoto: {},
      byMonth: {},
      byCreator: {}
    };
    
    spots.forEach(spot => {
      // Per tipo
      stats.byTipo[spot.tipo || 'altro'] = (stats.byTipo[spot.tipo || 'altro'] || 0) + 1;
      
      // Per voto
      const votoKey = spot.voto ? `voto_${spot.voto}` : 'no_voto';
      stats.byVoto[votoKey] = (stats.byVoto[votoKey] || 0) + 1;
      
      // Per mese
      if (spot.createdAt) {
        const month = spot.createdAt.substring(0, 7); // YYYY-MM
        stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;
      }
      
      // Per creatore
      if (spot.createdBy) {
        stats.byCreator[spot.createdBy] = (stats.byCreator[spot.createdBy] || 0) + 1;
      }
    });
    
    // Calcola voto medio
    const votiValidi = spots.filter(s => s.voto && s.voto >= 1 && s.voto <= 6);
    stats.averageVoto = votiValidi.length > 0 
      ? (votiValidi.reduce((sum, s) => sum + s.voto, 0) / votiValidi.length).toFixed(2)
      : null;
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore generazione stats:", err);
    res.status(500).json({
      success: false,
      error: "Errore generazione statistiche",
      message: err.message
    });
  }
});

app.get("/api/backup", authMiddleware, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, 'backups');
    
    // Crea directory backup se non esiste
    await fs.mkdir(backupDir, { recursive: true }).catch(() => {});
    
    const backup = {
      timestamp,
      metadata: {
        backupVersion: 2,
        generatedBy: req.user ? req.user.name : "system",
        totalSpots: 0,
        totalSettings: 0
      }
    };
    
    // Backup spots
    const spots = await withLock('spots', async () => {
      return await safeReadJson(EXTRA_FILE, []);
    });
    
    backup.spots = Array.isArray(spots) ? spots : [];
    backup.metadata.totalSpots = backup.spots.length;
    
    // Backup settings
    const settings = await withLock('settings', async () => {
      return await safeReadJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    });
    
    backup.settings = settings || DEFAULT_SETTINGS;
    backup.metadata.totalSettings = Object.keys(backup.settings).length;
    
    // Scrive backup file
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
    await safeWriteJson(backupFile, backup);
    
    // Mantieni solo gli ultimi 10 backup
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.json'));
      
      if (backupFiles.length > 10) {
        backupFiles.sort();
        const toDelete = backupFiles.slice(0, backupFiles.length - 10);
        
        for (const file of toDelete) {
          await fs.unlink(path.join(backupDir, file)).catch(() => {});
        }
      }
    } catch (e) {
      // Ignora errori di pulizia
}
    
    res.json({
      success: true,
      message: "Backup creato con successo",
      backupFile: `backups/backup-${timestamp}.json`,
      stats: backup.metadata,
      timestamp
    });
    
  } catch (err) {
    console.error("Errore creazione backup:", err);
    res.status(500).json({
      success: false,
      error: "Errore creazione backup",
      message: err.message
    });
  }
});

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf8");
    res.json(updated);
// Endpoint per restore da backup
app.post("/api/restore", authMiddleware, async (req, res) => {
  try {
    const { backupFile, restoreType } = req.body;
    
    if (!backupFile) {
      return res.status(400).json({
        success: false,
        error: "Specificare il file di backup",
        code: "MISSING_BACKUP_FILE"
      });
    }
    
    const backupPath = path.join(__dirname, backupFile);
    
    // Verifica che il file esista
    try {
      await fs.access(backupPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: "File di backup non trovato",
        code: "BACKUP_NOT_FOUND"
      });
    }
    
    const backupData = await safeReadJson(backupPath, null);
    
    if (!backupData) {
      return res.status(400).json({
        success: false,
        error: "File di backup non valido",
        code: "INVALID_BACKUP"
      });
    }
    
    const results = {};
    
    // Restore spots
    if (restoreType === 'all' || restoreType === 'spots') {
      if (Array.isArray(backupData.spots)) {
        await withLock('spots', async () => {
          await safeWriteJson(EXTRA_FILE, backupData.spots);
        });
        results.spots = { restored: backupData.spots.length, success: true };
      }
    }
    
    // Restore settings
    if (restoreType === 'all' || restoreType === 'settings') {
      if (backupData.settings && typeof backupData.settings === 'object') {
        await withLock('settings', async () => {
          await safeWriteJson(SETTINGS_FILE, backupData.settings);
        });
        results.settings = { success: true };
      }
    }
    
    res.json({
      success: true,
      message: "Restore completato",
      results,
      timestamp: new Date().toISOString()
    });
    
} catch (err) {
    console.error("Errore salvataggio settings:", err);
    res.status(500).json({ error: "Errore salvataggio settings" });
    console.error("Errore restore:", err);
    res.status(500).json({
      success: false,
      error: "Errore durante il restore",
      message: err.message
    });
}
});

@@ -268,45 +1121,62 @@ app.post("/api/settings", authMiddleware, (req, res) => {
// ===============================
function extractCoordsFromUrl(url) {
try {
    // Cerca pattern @lat,lng
    if (!url || typeof url !== 'string') return null;
    
    // Pattern 1: @lat,lng
const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
if (atMatch) {
return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
}

    // Cerca pattern /place/lat,lng
    
    // Pattern 2: /place/lat,lng
const placeMatch = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
if (placeMatch) {
return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
}

    // Cerca pattern ?q=lat,lng
    
    // Pattern 3: ?q=lat,lng
const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
if (qMatch) {
return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
}

    // Cerca pattern data=!4d...!3d...
    
    // Pattern 4: data=!4d...!3d...
const dataMatch = url.match(/data=!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
if (dataMatch) {
return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) };
}

    
    // Pattern 5: /@lat,lng,zoom
    const detailedMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+z)/);
    if (detailedMatch) {
      return { lat: parseFloat(detailedMatch[1]), lng: parseFloat(detailedMatch[2]) };
    }
    
return null;
} catch (e) {
    console.error("Error extracting coords from URL:", e);
return null;
}
}

function resolveShortUrl(shortUrl) {
return new Promise((resolve, reject) => {
    https.get(shortUrl, (response) => {
    const req = https.get(shortUrl, (response) => {
if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
resolve(response.headers.location);
} else {
        reject(new Error("Impossibile risolvere short URL"));
        reject(new Error("Impossibile risolvere short URL, nessun redirect"));
}
    }).on("error", reject);
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Timeout risoluzione URL"));
    });
    
    req.end();
});
}

@@ -317,11 +1187,289 @@ app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>LTU Admin</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .section { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .healthy { background: #d4edda; color: #155724; }
        .degraded { background: #fff3cd; color: #856404; }
        .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>Lost Trace Unit - Admin</h1>
      
      <div class="section">
        <h2>System Status</h2>
        <div id="status">Loading...</div>
        <button onclick="loadStatus()">Refresh Status</button>
      </div>
      
      <div class="section">
        <h2>Backup</h2>
        <p>Current spots: <span id="spotCount">-</span></p>
        <button onclick="createBackup()">Create Backup</button>
        <button onclick="loadStats()">View Statistics</button>
      </div>
      
      <div class="section">
        <h2>Recovery</h2>
        <div id="recoveryStatus"></div>
        <button onclick="checkDataIntegrity()">Check Data Integrity</button>
      </div>
      
      <script>
        async function loadStatus() {
          try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            let statusClass = 'degraded';
            if (data.status === 'healthy') statusClass = 'healthy';
            if (data.status === 'degraded') statusClass = 'degraded';
            
            document.getElementById('status').innerHTML = \`
              <div class="status \${statusClass}">
                <strong>Status:</strong> \${data.status}<br>
                <strong>Uptime:</strong> \${Math.round(data.uptime)} seconds<br>
                <strong>Memory:</strong> \${data.memory.heapUsed}<br>
                <strong>Spots:</strong> \${data.spots.count}<br>
                <strong>Timestamp:</strong> \${new Date(data.timestamp).toLocaleString()}
              </div>
            \`;
          } catch (error) {
            document.getElementById('status').innerHTML = \`
              <div class="status error">
                Error loading status: \${error.message}
              </div>
            \`;
          }
        }
        
        async function createBackup() {
          const username = prompt('Username:');
          const password = prompt('Password:');
          
          if (!username || !password) return;
          
          try {
            const response = await fetch('/api/backup', {
              headers: {
                'Authorization': 'Basic ' + btoa(username + ':' + password)
              }
            });
            
            const data = await response.json();
            alert(data.message + '\\nFile: ' + data.backupFile);
          } catch (error) {
            alert('Error: ' + error.message);
          }
        }
        
        async function loadStats() {
          try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            let statsHtml = '<h3>Statistics</h3><ul>';
            statsHtml += \`<li>Total spots: \${data.data.total}</li>\`;
            statsHtml += \`<li>Average voto: \${data.data.averageVoto || 'N/A'}</li>\`;
            
            statsHtml += '<li>By type:</li><ul>';
            for (const [tipo, count] of Object.entries(data.data.byTipo)) {
              statsHtml += \`<li>\${tipo}: \${count}</li>\`;
            }
            statsHtml += '</ul></ul>';
            
            alert(statsHtml.replace(/<[^>]*>/g, ''));
          } catch (error) {
            alert('Error loading stats: ' + error.message);
          }
        }
        
        async function checkDataIntegrity() {
          try {
            const response = await fetch('/api/spots-extra');
            const data = await response.json();
            
            let issues = [];
            
            if (!data.success) {
              issues.push('API returned error: ' + data.error);
            }
            
            if (!Array.isArray(data.data)) {
              issues.push('Data is not an array');
            } else {
              const invalidSpots = data.data.filter(spot => 
                !spot.id || !spot.name || !spot.lat || !spot.lng
              );
              
              if (invalidSpots.length > 0) {
                issues.push(\`Found \${invalidSpots.length} invalid spots\`);
              }
              
              const duplicateIds = {};
              data.data.forEach(spot => {
                duplicateIds[spot.id] = (duplicateIds[spot.id] || 0) + 1;
              });
              
              const duplicates = Object.entries(duplicateIds).filter(([id, count]) => count > 1);
              if (duplicates.length > 0) {
                issues.push(\`Found \${duplicates.length} duplicate IDs\`);
              }
            }
            
            if (issues.length === 0) {
              document.getElementById('recoveryStatus').innerHTML = \`
                <div class="status healthy">
                  Data integrity check passed!<br>
                  Total spots: \${data.data.length}
                </div>
              \`;
            } else {
              document.getElementById('recoveryStatus').innerHTML = \`
                <div class="status error">
                  Issues found:<br>
                  \${issues.join('<br>')}
                </div>
              \`;
            }
          } catch (error) {
            document.getElementById('recoveryStatus').innerHTML = \`
              <div class="status error">
                Error checking integrity: \${error.message}
              </div>
            \`;
          }
        }
        
        // Load initial status
        loadStatus();
      </script>
    </body>
    </html>
  `);
});

// ===============================
// GESTIONE ERRORI GLOBALE
// ===============================
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: "Endpoint non trovato",
    code: "NOT_FOUND",
    requestedUrl: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Errore non gestito:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    user: req.user
  });
  
  res.status(500).json({
    success: false,
    error: 'Errore interno del server',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
});

// ===============================
// AVVIO SERVER
// ===============================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server attivo su http://localhost:${port}`);
  console.log(`Login: user="${USERNAME}" password="${PASSWORD}"`);
});

// Inizializzazione file e directory
async function initializeServer() {
  try {
    console.log('🚀 Initializing Lost Trace Unit Server...');
    
    // Crea directory per backup
    await fs.mkdir(path.join(__dirname, 'backups'), { recursive: true }).catch(() => {});
    
    // Verifica o crea file spots-extra.json
    try {
      await fs.access(EXTRA_FILE);
      console.log('✅ spots-extra.json exists');
      
      // Verifica validità del file
      const spotsData = await safeReadJson(EXTRA_FILE, []);
      if (!Array.isArray(spotsData)) {
        console.warn('⚠️  spots-extra.json contains invalid data, resetting...');
        await safeWriteJson(EXTRA_FILE, []);
      } else {
        console.log(`📊 Loaded ${spotsData.length} spots`);
      }
    } catch {
      console.log('📝 Creating spots-extra.json...');
      await safeWriteJson(EXTRA_FILE, []);
    }
    
    // Verifica o crea file settings.json
    try {
      await fs.access(SETTINGS_FILE);
      console.log('✅ settings.json exists');
    } catch {
      console.log('📝 Creating settings.json...');
      await safeWriteJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    }
    
    console.log('✅ Server initialization complete');
    console.log(`🔐 Admin login: user="${USERNAME}" password="${PASSWORD}"`);
    console.log(`🌐 Health check: http://localhost:${port}/api/health`);
    console.log(`📊 Admin panel: http://localhost:${port}/admin`);
    
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    process.exit(1);
  }
}

// Avvia server dopo inizializzazione
initializeServer().then(() => {
  const server = app.listen(port, () => {
    console.log(`🚀 Server attivo su http://localhost:${port}`);
    console.log(`⏰ Server started at: ${new Date().toISOString()}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('👋 Server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⏰ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Non uscire immediatamente, ma logga l'errore
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  });
});
