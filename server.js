const express = require("express");
const path = require("path");
const fs = require("fs").promises;
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
const UNSAVED_SPOTS_FILE = path.join(__dirname, "unsaved-spots.json"); // Nuovo file per spot non salvati

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
      
      // Aggiungi timestamp e error message
      const unsavedSpot = {
        ...spotData,
        error: error.message || error.toString(),
        timestamp: new Date().toISOString(),
        saved: false,
        attempts: 1
      };
      
      // Controlla se esiste già (per coordinate)
      const existingIndex = unsavedSpots.findIndex(s => 
        Math.abs(s.lat - spotData.lat) < 0.0001 && 
        Math.abs(s.lng - spotData.lng) < 0.0001
      );
      
      if (existingIndex !== -1) {
        // Incrementa il contatore dei tentativi
        unsavedSpots[existingIndex].attempts++;
        unsavedSpots[existingIndex].lastError = error.message || error.toString();
        unsavedSpots[existingIndex].timestamp = new Date().toISOString();
      } else {
        unsavedSpots.push(unsavedSpot);
      }
      
      // Mantieni solo gli ultimi 50 spot non salvati
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
// API: SPOT EXTRA CON LOCKING
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

// Endpoint per ottenere gli spot non salvati
app.get("/api/unsaved-spots", authMiddleware, async (req, res) => {
  try {
    const data = await withLock('unsaved', async () => {
      return await safeReadJson(UNSAVED_SPOTS_FILE, []);
    });
    
    res.json({
      success: true,
      data: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Errore lettura unsaved-spots:", err);
    res.status(500).json({ 
      success: false,
      error: "Errore lettura spot non salvati",
      message: err.message,
      code: "READ_ERROR"
    });
  }
});

// Endpoint per ripulire gli spot non salvati
app.delete("/api/unsaved-spots", authMiddleware, async (req, res) => {
  try {
    await withLock('unsaved', async () => {
      await safeWriteJson(UNSAVED_SPOTS_FILE, []);
    });
    
    res.json({
      success: true,
      message: "Spot non salvati eliminati",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Errore eliminazione unsaved-spots:", err);
    res.status(500).json({ 
      success: false,
      error: "Errore eliminazione spot non salvati",
      message: err.message,
      code: "DELETE_ERROR"
    });
  }
});

app.post("/api/spots-extra", authMiddleware, async (req, res) => {
  try {
    const { name, desc, lat, lng, voto, tipo } = req.body || {};
    
    // Log dettagliato
    console.log(`[POST] Salvataggio spot: ${name} (${lat}, ${lng}) - IP: ${req.ip} - User: ${req.user?.name || 'anonymous'}`);
    
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
    
    // Validazione range coordinate
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
      
      await safeWriteJson(EXTRA_FILE, filtered);
      
      return {
        deletedId: spotId,
        previousCount: initialLength,
        newCount: filtered.length
      };
    });
    
    console.log(`[DELETE] Spot eliminato: ${spotId} - User: ${req.user?.name || 'anonymous'}`);
    
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

app.put("/api/spots-extra/:id", authMiddleware, async (req, res) => {
  try {
    const spotId = req.params.id;
    const { name, desc, lat, lng, voto, tipo } = req.body || {};
    
    // Log dettagliato
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

// Nuovo endpoint per salvataggio forzato in batch
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
    
    console.log(`[FORCE-SAVE] Richiesta per ${spots.length} spot - User: ${req.user?.name || 'anonymous'}`);
    
    const results = {
      total: spots.length,
      success: [],
      errors: [],
      duplicates: []
    };
    
    for (const spotData of spots) {
      try {
        const { name, desc, lat, lng, voto, tipo, id } = spotData || {};
        
        if (!name || lat == null || lng == null) {
          results.errors.push({
            spot: spotData,
            error: "Dati mancanti",
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
        
        const spot = {
          name: String(name).trim(),
          desc: desc != null ? String(desc).trim() : "",
          lat: latNum,
          lng: lngNum,
          voto: votoNum,
          tipo: tipo ? String(tipo) : getTipo(name, desc),
          createdAt: spotData.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: req.user ? req.user.name : "force_save"
        };
        
        // Se ha un ID, prova ad aggiornare, altrimenti crea nuovo
        if (id && id.length >= 10) {
          try {
            await withLock('spots', async () => {
              let current = await safeReadJson(EXTRA_FILE, []);
              
              if (!Array.isArray(current)) {
                current = [];
              }
              
              const index = current.findIndex(s => s.id === id);
              
              if (index !== -1) {
                current[index] = {
                  ...current[index],
                  ...spot,
                  id: id,
                  updatedBy: req.user ? req.user.name : "force_save"
                };
                await safeWriteJson(EXTRA_FILE, current);
                results.success.push({ id, name: spot.name, action: 'updated' });
              } else {
                throw new Error("Spot non trovato per aggiornamento");
              }
            });
          } catch (error) {
            // Se non trova lo spot per aggiornamento, prova a crearlo come nuovo
            try {
              await withLock('spots', async () => {
                let current = await safeReadJson(EXTRA_FILE, []);
                
                if (!Array.isArray(current)) {
                  current = [];
                }
                
                // Verifica duplicati
                const duplicate = current.find(s => {
                  const latDiff = Math.abs(s.lat - latNum);
                  const lngDiff = Math.abs(s.lng - lngNum);
                  return latDiff < 0.0001 && lngDiff < 0.0001;
                });
                
                if (duplicate) {
                  results.duplicates.push({
                    spot: spotData,
                    existingSpot: duplicate,
                    coordinates: `${lat}, ${lng}`
                  });
                } else {
                  const newSpot = {
                    ...spot,
                    id: uuidv4(),
                    version: 1,
                    status: "active"
                  };
                  
                  current.push(newSpot);
                  await safeWriteJson(EXTRA_FILE, current);
                  results.success.push({ id: newSpot.id, name: spot.name, action: 'created' });
                }
              });
            } catch (createError) {
              results.errors.push({
                spot: spotData,
                error: createError.message,
                coordinates: `${lat}, ${lng}`
              });
            }
          }
        } else {
          // Nuovo spot
          try {
            await withLock('spots', async () => {
              let current = await safeReadJson(EXTRA_FILE, []);
              
              if (!Array.isArray(current)) {
                current = [];
              }
              
              // Verifica duplicati
              const duplicate = current.find(s => {
                const latDiff = Math.abs(s.lat - latNum);
                const lngDiff = Math.abs(s.lng - lngNum);
                return latDiff < 0.0001 && lngDiff < 0.0001;
              });
              
              if (duplicate) {
                results.duplicates.push({
                  spot: spotData,
                  existingSpot: duplicate,
                  coordinates: `${lat}, ${lng}`
                });
              } else {
                const newSpot = {
                  ...spot,
                  id: uuidv4(),
                  version: 1,
                  status: "active"
                };
                
                current.push(newSpot);
                await safeWriteJson(EXTRA_FILE, current);
                results.success.push({ id: newSpot.id, name: spot.name, action: 'created' });
              }
            });
          } catch (error) {
            results.errors.push({
              spot: spotData,
              error: error.message,
              coordinates: `${lat}, ${lng}`
            });
          }
        }
      } catch (error) {
        results.errors.push({
          spot: spotData,
          error: error.message || "Errore sconosciuto",
          coordinates: `${spotData.lat}, ${spotData.lng}`
        });
      }
    }
    
    console.log(`[FORCE-SAVE] Completato: ${results.success.length} successi, ${results.errors.length} errori, ${results.duplicates.length} duplicati`);
    
    res.json({
      success: true,
      message: `Salvataggio forzato completato: ${results.success.length} successi, ${results.errors.length} errori`,
      results: results,
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

// ===============================
// API: DECODE GMAPS URL
// ===============================
app.post("/api/decode-gmaps-url", async (req, res) => {
  try {
    const { url } = req.body;
    
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
      try {
        finalUrl = await resolveShortUrl(url);
      } catch (e) {
        console.warn("Impossibile risolvere short URL:", e);
      }
    }
    
    // Estrai coordinate
    const coords = extractCoordsFromUrl(finalUrl);
    
    if (!coords) {
      return res.status(400).json({
        success: false,
        error: "Coordinate non trovate nell'URL",
        code: "NO_COORDINATES_FOUND",
        url: finalUrl
      });
    }
    
    res.json({
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
async function readSettings() {
  return await withLock('settings', async () => {
    const settings = await safeReadJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  });
}

app.get("/api/settings", async (req, res) => {
  try {
    const settings = await readSettings();
    
    res.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore lettura settings:", err);
    res.status(500).json({
      success: false,
      error: "Errore lettura settings",
      message: err.message,
      code: "SETTINGS_READ_ERROR"
    });
  }
});

app.post("/api/settings", authMiddleware, async (req, res) => {
  try {
    const incoming = req.body || {};
    
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
    
    const unsavedData = await withLock('unsaved', async () => {
      try {
        const unsaved = await safeReadJson(UNSAVED_SPOTS_FILE, []);
        return {
          count: Array.isArray(unsaved) ? unsaved.length : 0,
          exists: true
        };
      } catch {
        return { count: 0, exists: false };
      }
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
      unsaved: unsavedData,
      locks: {
        spots: locks.spots.locked,
        settings: locks.settings.locked,
        unsaved: locks.unsaved.locked,
        queueLengths: {
          spots: locks.spots.queue.length,
          settings: locks.settings.queue.length,
          unsaved: locks.unsaved.queue.length
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
        backupVersion: 3,
        generatedBy: req.user ? req.user.name : "system",
        totalSpots: 0,
        totalSettings: 0,
        totalUnsaved: 0
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
    
    // Backup unsaved spots
    try {
      const unsaved = await withLock('unsaved', async () => {
        return await safeReadJson(UNSAVED_SPOTS_FILE, []);
      });
      backup.unsavedSpots = Array.isArray(unsaved) ? unsaved : [];
      backup.metadata.totalUnsaved = backup.unsavedSpots.length;
    } catch {
      backup.unsavedSpots = [];
      backup.metadata.totalUnsaved = 0;
    }
    
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
    
    // Restore unsaved spots
    if (restoreType === 'all' || restoreType === 'unsaved') {
      if (Array.isArray(backupData.unsavedSpots)) {
        await withLock('unsaved', async () => {
          await safeWriteJson(UNSAVED_SPOTS_FILE, backupData.unsavedSpots);
        });
        results.unsaved = { restored: backupData.unsavedSpots.length, success: true };
      }
    }
    
    res.json({
      success: true,
      message: "Restore completato",
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("Errore restore:", err);
    res.status(500).json({
      success: false,
      error: "Errore durante il restore",
      message: err.message
    });
  }
});

// ===============================
// FUNZIONI PER DECODIFICA URL
// ===============================
function extractCoordsFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    
    // Pattern 1: @lat,lng
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    }
    
    // Pattern 2: /place/lat,lng
    const placeMatch = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (placeMatch) {
      return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    }
    
    // Pattern 3: ?q=lat,lng
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    }
    
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
// AVVIO SERVER
// ===============================
const port = process.env.PORT || 3000;

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
    
    // Verifica o crea file unsaved-spots.json
    try {
      await fs.access(UNSAVED_SPOTS_FILE);
      console.log('✅ unsaved-spots.json exists');
      
      // Verifica validità del file
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
    console.log(`🌐 Health check: http://localhost:${port}/api/health`);
    console.log(`📊 Stats: http://localhost:${port}/api/stats`);
    
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