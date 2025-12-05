const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const https = require("https");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ===============================
// CONFIGURAZIONE
// ===============================
const USERNAME = process.env.APP_USERNAME || "unit";
const PASSWORD = process.env.APP_PASSWORD || "ltunit";
const EXTRA_FILE = path.join(__dirname, "spots-extra.json");
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const UNSAVED_SPOTS_FILE = path.join(__dirname, "unsaved-spots.json");
const BACKUP_DIR = path.join(__dirname, "backups");
const SPOT_BACKUP_DIR = path.join(__dirname, "spot-backups");

// Crea le directory se non esistono
async function ensureDirectories() {
  const dirs = [BACKUP_DIR, SPOT_BACKUP_DIR];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`Impossibile creare directory ${dir}:`, error.message);
    }
  }
}

const DEFAULT_SETTINGS = {
  version: 2,
  baseLayer: "osm",
  mapStyle: "default",
  randomIncludeLowRated: false,
  lastUpdated: null
};

// Locks per prevenire race conditions
const locks = {
  spots: { locked: false, queue: [] },
  settings: { locked: false, queue: [] },
  unsaved: { locked: false, queue: [] }
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
      if (fsSync.existsSync(filePath)) {
        const backupFile = `${filePath}.backup.${Date.now()}`;
        await fs.copyFile(filePath, backupFile);
      }
    } catch (e) {
      // Ignora errori di backup
    }
    
    // Rinomina atomico
    await fs.rename(tempFile, filePath);
    
    console.log(`File salvato con successo: ${filePath}`);
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

// Funzione per salvataggio spot con backup
async function saveSpotWithBackup(spot) {
  const backupFile = path.join(SPOT_BACKUP_DIR, `spot-${Date.now()}-${spot.id}.json`);
  try {
    await fs.writeFile(backupFile, JSON.stringify(spot, null, 2), 'utf8');
    console.log(`Backup spot creato: ${backupFile}`);
  } catch (error) {
    console.warn(`Impossibile creare backup per spot ${spot.id}:`, error.message);
  }
}

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

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
    return res.status(401).json({ 
      success: false,
      error: "Accesso non autorizzato",
      code: "AUTH_REQUIRED"
    });
  }
  
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');
    
    if (username !== USERNAME || password !== PASSWORD) {
      res.set("WWW-Authenticate", 'Basic realm="LTU Admin"');
      return res.status(401).json({ 
        success: false,
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
      success: false,
      error: "Formato autorizzazione non valido",
      code: "INVALID_AUTH_FORMAT"
    });
  }
};

// ===============================
// FUNZIONI HELPER
// ===============================
function getTipo(name, desc) {
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

// Funzione per salvare spot non salvati
async function saveUnsavedSpot(spotData, error) {
  return await withLock('unsaved', async () => {
    try {
      let unsavedSpots = await safeReadJson(UNSAVED_SPOTS_FILE, []);
      
      const unsavedSpot = {
        ...spotData,
        error: error.message || error.toString(),
        timestamp: new Date().toISOString(),
        saved: false,
        attempts: 1
      };
      
      const existingIndex = unsavedSpots.findIndex(s => 
        Math.abs(s.lat - spotData.lat) < 0.0001 && 
        Math.abs(s.lng - spotData.lng) < 0.0001
      );
      
      if (existingIndex !== -1) {
        unsavedSpots[existingIndex].attempts++;
        unsavedSpots[existingIndex].lastError = error.message || error.toString();
        unsavedSpots[existingIndex].timestamp = new Date().toISOString();
      } else {
        unsavedSpots.push(unsavedSpot);
      }
      
      if (unsavedSpots.length > 50) {
        unsavedSpots = unsavedSpots.slice(-50);
      }
      
      await safeWriteJson(UNSAVED_SPOTS_FILE, unsavedSpots);
      console.log(`Spot non salvato archiviato: ${spotData.name} (${spotData.lat}, ${spotData.lng}) - ${error.message}`);
      
      return unsavedSpot;
    } catch (e) {
      console.error('Errore nel salvataggio dello spot non salvato:', e);
      return null;
    }
  });
}

// ===============================
// API: SPOT EXTRA CON SALVATAGGIO PERMANENTE
// ===============================
app.get("/api/spots-extra", async (req, res) => {
  try {
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
    res.status(500).json({ 
      success: false,
      error: "Errore lettura spots-extra",
      message: err.message,
      code: "READ_ERROR"
    });
  }
});

app.post("/api/spots-extra", authMiddleware, async (req, res) => {
  try {
    const { name, desc, lat, lng, voto, tipo } = req.body || {};
    
    console.log(`[POST] Salvataggio spot: ${name} (${lat}, ${lng}) - User: ${req.user?.name || 'anonymous'}`);
    
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
      return res.status(400).json({ 
        success: false,
        error: "Coordinate non valide",
        code: "INVALID_COORDINATES"
      });
    }
    
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ 
        success: false,
        error: "Coordinate fuori range valido",
        code: "COORDINATES_OUT_OF_RANGE"
      });
    }
    
    let votoNum = null;
    if (voto != null && voto !== "" && !isNaN(voto)) {
      const v = parseInt(voto, 10);
      if (v >= 1 && v <= 6) votoNum = v;
    }
    
    const newSpot = {
      id: uuidv4(),
      name: String(name).trim(),
      desc: desc != null ? String(desc).trim() : "",
      lat: latNum,
      lng: lngNum,
      voto: votoNum,
      tipo: tipo ? String(tipo) : getTipo(name, desc),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user ? req.user.name : "anonymous",
      version: 1,
      status: "active"
    };

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
        return latDiff < 0.0001 && lngDiff < 0.0001;
      });
      
      if (duplicate) {
        throw {
          status: 409,
          message: "Esiste già uno spot in questa posizione",
          existingSpot: duplicate
        };
      }
      
      current.push(newSpot);
      
      // SALVATAGGIO PERMANENTE SUL FILE
      await safeWriteJson(EXTRA_FILE, current);
      
      // Backup individuale dello spot
      await saveSpotWithBackup(newSpot);
      
      console.log(`Spot salvato permanentemente: ${newSpot.id} - ${newSpot.name}`);
      
      return {
        spot: newSpot,
        totalCount: current.length
      };
    });
    
    res.status(201).json({
      success: true,
      message: "Spot aggiunto con successo e salvato permanentemente",
      data: result.spot,
      totalSpots: result.totalCount,
      timestamp: newSpot.createdAt
    });
    
  } catch (err) {
    console.error("Errore salvataggio spot:", err);
    
    // Salva lo spot non salvato per recupero successivo
    if (req.body) {
      await saveUnsavedSpot(req.body, err);
    }
    
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

app.delete("/api/spots-extra/:id", authMiddleware, async (req, res) => {
  try {
    const spotId = req.params.id;
    
    if (!spotId || spotId.length < 10) {
      return res.status(400).json({
        success: false,
        error: "ID spot non valido",
        code: "INVALID_ID"
      });
    }
    
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
      
      // SALVATAGGIO PERMANENTE DEL FILE AGGIORNATO
      await safeWriteJson(EXTRA_FILE, filtered);
      
      console.log(`Spot eliminato permanentemente: ${spotId}`);
      
      return {
        deletedId: spotId,
        previousCount: initialLength,
        newCount: filtered.length
      };
    });
    
    console.log(`[DELETE] Spot eliminato: ${spotId}`);
    
    res.json({
      success: true,
      message: "Spot eliminato con successo e file aggiornato",
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

app.put("/api/spots-extra/:id", authMiddleware, async (req, res) => {
  try {
    const spotId = req.params.id;
    const { name, desc, lat, lng, voto, tipo } = req.body || {};
    
    console.log(`[PUT] Aggiornamento spot ${spotId}: ${name} - User: ${req.user?.name || 'anonymous'}`);
    
    if (!spotId || spotId.length < 10) {
      return res.status(400).json({
        success: false,
        error: "ID spot non valido",
        code: "INVALID_ID"
      });
    }
    
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
      
      // SALVATAGGIO PERMANENTE DEL FILE AGGIORNATO
      await safeWriteJson(EXTRA_FILE, current);
      
      // Backup individuale dello spot aggiornato
      await saveSpotWithBackup(updatedSpot);
      
      console.log(`Spot aggiornato permanentemente: ${spotId}`);
      
      return {
        spot: updatedSpot,
        index: index,
        totalCount: current.length
      };
    });
    
    res.json({
      success: true,
      message: "Spot aggiornato con successo e salvato permanentemente",
      data: result.spot,
      totalSpots: result.totalCount,
      timestamp: result.spot.updatedAt
    });
    
  } catch (err) {
    console.error("Errore aggiornamento spot:", err);
    
    // Salva lo spot non salvato per recupero successivo
    if (req.body) {
      await saveUnsavedSpot(req.body, err);
    }
    
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

// ===============================
// ENDPOINT FORCE-SAVE MIGLIORATO
// ===============================
app.post("/api/spots-extra/force-save", authMiddleware, async (req, res) => {
  try {
    const { spots } = req.body || {};
    
    if (!Array.isArray(spots) || spots.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Array di spots richiesto",
        code: "INVALID_SPOTS_ARRAY"
      });
    }
    
    console.log(`[FORCE-SAVE] Richiesta per ${spots.length} spot`);
    
    const results = {
      total: spots.length,
      success: 0,
      errors: [],
      duplicates: []
    };
    
    const savedSpots = await withLock('spots', async () => {
      let currentSpots = await safeReadJson(EXTRA_FILE, []);
      
      if (!Array.isArray(currentSpots)) {
        console.warn("Resetting spots data: not an array");
        currentSpots = [];
      }
      
      for (const spotData of spots) {
        try {
          const { name, desc, lat, lng, voto, tipo, id } = spotData || {};
          
          // Validazione base
          if (!name || lat == null || lng == null) {
            results.errors.push({
              spot: spotData,
              error: "Dati mancanti (nome o coordinate)",
              coordinates: `${lat}, ${lng}`
            });
            continue;
          }
          
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lng);
          
          if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
            results.errors.push({
              spot: spotData,
              error: "Coordinate non valide",
              coordinates: `${lat}, ${lng}`
            });
            continue;
          }
          
          let votoNum = null;
          if (voto !== undefined && voto !== "" && !isNaN(voto)) {
            const v = parseInt(voto, 10);
            if (v >= 1 && v <= 6) votoNum = v;
          }
          
          const tipoFinal = tipo ? String(tipo) : getTipo(name, desc);
          
          if (id && id.length >= 10) {
            // Spot con ID - cerca se esiste già
            const existingIndex = currentSpots.findIndex(s => s.id === id);
            
            if (existingIndex !== -1) {
              // Aggiorna spot esistente
              currentSpots[existingIndex] = {
                ...currentSpots[existingIndex],
                name: String(name).trim(),
                desc: desc != null ? String(desc).trim() : currentSpots[existingIndex].desc,
                lat: latNum,
                lng: lngNum,
                voto: votoNum,
                tipo: tipoFinal,
                updatedAt: new Date().toISOString(),
                updatedBy: req.user ? req.user.name : "force_save"
              };
              results.success++;
              console.log(`Spot aggiornato via force-save: ${id} - ${name}`);
            } else {
              // Nuovo spot con ID
              const newSpot = {
                id: id,
                name: String(name).trim(),
                desc: desc != null ? String(desc).trim() : "",
                lat: latNum,
                lng: lngNum,
                voto: votoNum,
                tipo: tipoFinal,
                createdAt: spotData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: req.user ? req.user.name : "force_save",
                version: 1,
                status: "active"
              };
              
              // Verifica duplicati per coordinate
              const duplicate = currentSpots.find(s => {
                const latDiff = Math.abs(s.lat - latNum);
                const lngDiff = Math.abs(s.lng - lngNum);
                return latDiff < 0.0001 && lngDiff < 0.0001;
              });
              
              if (duplicate) {
                results.duplicates.push({
                  spot: newSpot,
                  existingSpot: duplicate,
                  coordinates: `${latNum}, ${lngNum}`
                });
              } else {
                currentSpots.push(newSpot);
                results.success++;
                console.log(`Nuovo spot creato via force-save: ${id} - ${name}`);
              }
            }
          } else {
            // Nuovo spot senza ID
            const newSpot = {
              id: uuidv4(),
              name: String(name).trim(),
              desc: desc != null ? String(desc).trim() : "",
              lat: latNum,
              lng: lngNum,
              voto: votoNum,
              tipo: tipoFinal,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: req.user ? req.user.name : "force_save",
              version: 1,
              status: "active"
            };
            
            // Verifica duplicati per coordinate
            const duplicate = currentSpots.find(s => {
              const latDiff = Math.abs(s.lat - latNum);
              const lngDiff = Math.abs(s.lng - lngNum);
              return latDiff < 0.0001 && lngDiff < 0.0001;
            });
            
            if (duplicate) {
              results.duplicates.push({
                spot: newSpot,
                existingSpot: duplicate,
                coordinates: `${latNum}, ${lngNum}`
              });
            } else {
              currentSpots.push(newSpot);
              results.success++;
              console.log(`Nuovo spot creato via force-save: ${newSpot.id} - ${name}`);
            }
          }
        } catch (error) {
          results.errors.push({
            spot: spotData,
            error: error.message || "Errore sconosciuto",
            coordinates: `${spotData.lat}, ${spotData.lng}`
          });
          console.error(`Errore processing spot:`, error);
        }
      }
      
      // SALVATAGGIO PERMANENTE DI TUTTI GLI SPOT
      await safeWriteJson(EXTRA_FILE, currentSpots);
      console.log(`File spots-extra.json aggiornato con ${currentSpots.length} spot totali`);
      
      return currentSpots;
    });
    
    console.log(`[FORCE-SAVE] Completato: ${results.success} successi, ${results.errors.length} errori, ${results.duplicates.length} duplicati`);
    
    res.json({
      success: true,
      message: `Salvataggio forzato completato: ${results.success} successi, ${results.errors.length} errori, ${results.duplicates.length} duplicati`,
      data: {
        results: results,
        totalSaved: savedSpots.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore salvataggio forzato:", err);
    res.status(500).json({
      success: false,
      error: "Errore salvataggio forzato",
      message: err.message,
      code: "FORCE_SAVE_ERROR"
    });
  }
});

// ===============================
// ENDPOINT PER VERIFICA FILE
// ===============================
app.get("/api/debug/file-info", async (req, res) => {
  try {
    const filePath = EXTRA_FILE;
    let fileExists = false;
    let fileSize = 0;
    let fileContent = null;
    
    try {
      const stats = await fs.stat(filePath);
      fileExists = true;
      fileSize = stats.size;
      
      const content = await fs.readFile(filePath, 'utf8');
      fileContent = JSON.parse(content);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    res.json({
      success: true,
      data: {
        filePath,
        fileExists,
        fileSize,
        spotCount: Array.isArray(fileContent) ? fileContent.length : 0,
        lastModified: fileExists ? (await fs.stat(filePath)).mtime : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Errore debug file info:", error);
    res.status(500).json({
      success: false,
      error: "Errore recupero informazioni file",
      message: error.message
    });
  }
});

// ===============================
// ALTRI ENDPOINT (mantenuti invariati)
// ===============================
// ... [Mantieni tutti gli altri endpoint come decode-gmaps-url, settings, health, stats, backup, restore] ...

// ===============================
// FUNZIONI PER DECODIFICA URL (mantenute invariate)
// ===============================
function extractCoordsFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }
    
    const placeMatch = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    }
    
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }
    
    const dataMatch = url.match(/data=!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dataMatch) {
      return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) };
    }
    
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
    const req = https.get(shortUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(response.headers.location);
      } else {
        reject(new Error("Impossibile risolvere short URL, nessun redirect"));
      }
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Timeout risoluzione URL"));
    });
    
    req.end();
  });
}

// ===============================
// ROUTE STATICHE
// ===============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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
// AVVIO SERVER CON INIZIALIZZAZIONE
// ===============================
const port = process.env.PORT || 3000;

async function initializeServer() {
  try {
    console.log('🚀 Initializing Lost Trace Unit Server...');
    
    // Crea tutte le directory necessarie
    await ensureDirectories();
    
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
        console.log(`📊 Loaded ${spotsData.length} spots from file`);
        
        // Verifica che ogni spot abbia un ID
        const spotsWithoutId = spotsData.filter(spot => !spot.id);
        if (spotsWithoutId.length > 0) {
          console.log(`⚠️  ${spotsWithoutId.length} spots without ID, fixing...`);
          const fixedSpots = spotsData.map(spot => ({
            ...spot,
            id: spot.id || uuidv4(),
            updatedAt: spot.updatedAt || spot.createdAt || new Date().toISOString()
          }));
          await safeWriteJson(EXTRA_FILE, fixedSpots);
          console.log(`✅ Fixed ${spotsWithoutId.length} spots`);
        }
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
    
    // Verifica o crea file unsaved-spots.json
    try {
      await fs.access(UNSAVED_SPOTS_FILE);
      console.log('✅ unsaved-spots.json exists');
      
      const unsavedData = await safeReadJson(UNSAVED_SPOTS_FILE, []);
      if (!Array.isArray(unsavedData)) {
        console.warn('⚠️  unsaved-spots.json contains invalid data, resetting...');
        await safeWriteJson(UNSAVED_SPOTS_FILE, []);
      } else {
        console.log(`📊 Loaded ${unsavedData.length} unsaved spots`);
      }
    } catch {
      console.log('📝 Creating unsaved-spots.json...');
      await safeWriteJson(UNSAVED_SPOTS_FILE, []);
    }
    
    console.log('✅ Server initialization complete');
    console.log(`🔐 Admin login: user="${USERNAME}" password="${PASSWORD}"`);
    console.log(`📁 Data file: ${EXTRA_FILE}`);
    console.log(`📁 Backup directory: ${BACKUP_DIR}`);
    
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
    console.log(`💾 Tutti i salvataggi verranno scritti permanentemente su file`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('👋 Server closed');
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('⏰ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  });
});