const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const https = require("https");
const { v4: uuidv4 } = require("uuid");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const csv = require("csv-parser");

const app = express();

// ===============================
// CONFIGURAZIONE
// ===============================
const USERNAME = process.env.APP_USERNAME || "unit";
const PASSWORD = process.env.APP_PASSWORD || "ltunit";

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://ltunit:ltunit420@cluster0.bqs9ecb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "ltu-database";

// Multer per upload file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Solo file CSV sono permessi'), false);
    }
  }
});

let db = null;
let mongoClient = null;
let isMongoConnected = false;

// ===============================
// FUNZIONI DI UTILITÀ
// ===============================
function extractVoto(desc) {
  if (!desc) return null;
  const match = desc.match(/Voto:\s*([0-9]+)\s*\/\s*6/i);
  if (!match) return null;
  const v = parseInt(match[1], 10);
  if (v >= 1 && v <= 6) return v;
  return null;
}

function getTipo(name, desc) {
  const text = ((name || '') + ' ' + (desc || '')).toLowerCase();
  
  if (text.includes("hotel") || text.includes("ostello") || text.includes("residence")) return "hotel";
  if (text.includes("villa") || text.includes("villone") || text.includes("villino")) return "villa";
  if (text.includes("casa") || text.includes("casetta") || text.includes("casone")) return "casa";
  if (text.includes("fabbrica") || text.includes("capannone") || text.includes("magazzino")) return "industria";
  if (text.includes("scuola") || text.includes("itis")) return "scuola";
  if (text.includes("chiesa")) return "chiesa";
  if (text.includes("colonia")) return "colonia";
  if (text.includes("prigione") || text.includes("manicomio") || text.includes("ospedale")) return "istituzione";
  if (text.includes("discoteca") || text.includes("bar") || text.includes("ristorante")) return "svago";
  if (text.includes("castello")) return "castello";
  if (text.includes("nave")) return "nave";
  if (text.includes("diga")) return "diga";
  if (text.includes("base nato")) return "militare";
  return "altro";
}

// Nuova funzione per mappare i colori voti
function getVotoColor(voto) {
  switch(voto) {
    case 1: return "#6b7280"; // Grigio
    case 2: return "#16a34a"; // Verde
    case 3: return "#2563eb"; // Blu
    case 4: return "#9333ea"; // Viola
    case 5: return "#fbbf24"; // Oro
    case 6: return "#06b6d4"; // Platino/Azzurro cangiante
    default: return "#000000"; // Nero per nessun voto
  }
}

// ===============================
// CONNESSIONE E INIZIALIZZAZIONE MONGODB
// ===============================
async function connectToMongoDB() {
  try {
    console.log(`🔌 Tentativo connessione MongoDB...`);
    
    mongoClient = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 15000
    });
    
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB_NAME);
    
    console.log(`✅ Connesso a MongoDB! Database: ${MONGODB_DB_NAME}`);
    
    // Crea collection se non esistono
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('spots')) {
      await db.createCollection('spots');
      console.log(`📁 Collection 'spots' creata`);
    }
    
    if (!collectionNames.includes('settings')) {
      await db.createCollection('settings');
      console.log(`📁 Collection 'settings' creata`);
    }

    if (!collectionNames.includes('notes')) {
      await db.createCollection('notes');
      console.log(`📁 Collection 'notes' creata`);
    }
    
    // Crea indici per performance
    try {
      await db.collection('spots').createIndex({ lat: 1, lng: 1 });
      await db.collection('spots').createIndex({ id: 1 }, { unique: true });
      await db.collection('spots').createIndex({ explorato: 1 });
      await db.collection('spots').createIndex({ voto: 1 });
      await db.collection('notes').createIndex({ userId: 1 }, { unique: true });
      console.log(`📊 Indici creati`);
    } catch (e) {
      console.log(`ℹ️  Indici già esistenti`);
    }
    
    isMongoConnected = true;
    return true;
    
  } catch (error) {
    console.error(`❌ ERRORE connessione MongoDB:`, error.message);
    isMongoConnected = false;
    return false;
  }
}

// ===============================
// IMPORT INIZIALE DA CSV (OPZIONALE, PER BACKWARD COMPATIBILITÀ)
// ===============================
async function importInitialCSV() {
  try {
    console.log(`📥 Verifico import iniziale da CSV...`);
    
    // Conta spot nel database
    const spotCount = await db.collection('spots').countDocuments();
    
    if (spotCount > 0) {
      console.log(`📊 Database già contiene ${spotCount} spot, salto import`);
      return { imported: 0, skipped: spotCount };
    }
    
    // Leggi CSV locale
    const csvPath = path.join(__dirname, 'spots.csv');
    if (!fsSync.existsSync(csvPath)) {
      console.log(`📁 CSV non trovato: ${csvPath}`);
      return { imported: 0, skipped: 0 };
    }
    
    const csvContent = await fs.readFile(csvPath, 'utf8');
    const rows = csvContent.trim().split(/\r?\n/);
    
    if (rows.length <= 1) {
      console.log(`📁 CSV vuoto o solo header`);
      return { imported: 0, skipped: 0 };
    }
    
    const header = rows[0].split(',');
    const dataRows = rows.slice(1);
    
    console.log(`📖 Letti ${dataRows.length} spot da CSV`);
    
    const spotsToImport = [];
    let importedCount = 0;
    
    for (const row of dataRows) {
      if (!row.trim()) continue;
      
      const cols = row.split(',').map(col => col.trim().replace(/^"(.*)"$/, '$1'));
      if (cols.length < 4) continue;
      
      const name = cols[0] || "";
      const desc = cols[1] || "";
      const lat = parseFloat(cols[2]);
      const lng = parseFloat(cols[3]);
      
      if (isNaN(lat) || isNaN(lng)) continue;
      
      const voto = extractVoto(desc);
      const tipo = getTipo(name, desc);
      const explorato = false;
      
      const spot = {
        id: uuidv4(),
        name: name.trim(),
        desc: desc.trim(),
        lat,
        lng,
        voto,
        tipo,
        explorato,
        source: "csv-import",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "system-import",
        version: 1,
        status: "active"
      };
      
      spotsToImport.push(spot);
    }
    
    if (spotsToImport.length > 0) {
      console.log(`🔄 Importo ${spotsToImport.length} spot nel database...`);
      const result = await db.collection('spots').insertMany(spotsToImport);
      importedCount = result.insertedCount;
      console.log(`✅ Importati ${importedCount} spot da CSV`);
    }
    
    return { imported: importedCount, skipped: dataRows.length - importedCount };
    
  } catch (error) {
    console.error(`❌ Errore import CSV:`, error.message);
    return { imported: 0, skipped: 0, error: error.message };
  }
}

// ===============================
// FUNZIONI DATABASE
// ===============================
async function getAllSpots() {
  if (isMongoConnected && db) {
    try {
      return await db.collection('spots')
        .find({})
        .sort({ updatedAt: -1 })
        .toArray();
    } catch (error) {
      console.error(`❌ Errore lettura spots:`, error);
      return [];
    }
  }
  return [];
}

async function getSpotById(id) {
  if (isMongoConnected && db) {
    try {
      return await db.collection('spots').findOne({ id });
    } catch (error) {
      console.error(`❌ Errore get spot by ID:`, error);
      return null;
    }
  }
  return null;
}

async function createSpot(spot) {
  if (isMongoConnected && db) {
    try {
      const result = await db.collection('spots').insertOne(spot);
      console.log(`✅ Spot creato in DB: ${spot.id} - ${spot.name}`);
      return spot;
    } catch (error) {
      console.error(`❌ Errore creazione spot:`, error);
      
      // Se è errore di duplicato, ritorna lo spot esistente
      if (error.code === 11000) {
        const existing = await db.collection('spots').findOne({ id: spot.id });
        if (existing) {
          console.log(`⚠️  Spot già esistente, ritorno quello`);
          return existing;
        }
      }
      
      throw error;
    }
  } else {
    throw new Error("Database non connesso");
  }
}

async function updateSpot(id, updates) {
  if (isMongoConnected && db) {
    try {
      const result = await db.collection('spots').updateOne(
        { id },
        { $set: { ...updates, updatedAt: new Date().toISOString() } }
      );
      
      if (result.matchedCount === 0) {
        throw new Error("Spot non trovato");
      }
      
      console.log(`✅ Spot aggiornato: ${id}`);
      return await getSpotById(id);
    } catch (error) {
      console.error(`❌ Errore aggiornamento spot:`, error);
      throw error;
    }
  } else {
    throw new Error("Database non connesso");
  }
}

async function deleteSpot(id) {
  if (isMongoConnected && db) {
    try {
      const result = await db.collection('spots').deleteOne({ id });
      
      if (result.deletedCount === 0) {
        throw new Error("Spot non trovato");
      }
      
      console.log(`✅ Spot eliminato: ${id}`);
      return true;
    } catch (error) {
      console.error(`❌ Errore eliminazione spot:`, error);
      throw error;
    }
  } else {
    throw new Error("Database non connesso");
  }
}

async function checkForDuplicates(lat, lng, excludeId = null) {
  if (isMongoConnected && db) {
    try {
      const query = {
        lat: { $gte: lat - 0.0001, $lte: lat + 0.0001 },
        lng: { $gte: lng - 0.0001, $lte: lng + 0.0001 }
      };
      
      if (excludeId) {
        query.id = { $ne: excludeId };
      }
      
      return await db.collection('spots').findOne(query);
    } catch (error) {
      console.error(`❌ Errore controllo duplicati:`, error);
      return null;
    }
  }
  return null;
}

// ===============================
// FUNZIONI PER NOTE
// ===============================
async function getNotes(userId = "default") {
  if (isMongoConnected && db) {
    try {
      const notes = await db.collection('notes').findOne({ userId });
      return notes || { userId, content: "", updatedAt: new Date().toISOString() };
    } catch (error) {
      console.error(`❌ Errore lettura note:`, error);
      return { userId, content: "", updatedAt: new Date().toISOString() };
    }
  }
  return { userId, content: "", updatedAt: new Date().toISOString() };
}

async function saveNotes(userId = "default", content) {
  if (isMongoConnected && db) {
    try {
      await db.collection('notes').updateOne(
        { userId },
        { $set: { content, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      console.log(`✅ Note salvate per utente: ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Errore salvataggio note:`, error);
      throw error;
    }
  } else {
    throw new Error("Database non connesso");
  }
}

// ===============================
// FUNZIONI PER GOOGLE MAPS ALIGNMENT
// ===============================
function parseGoogleMapsCSV(csvText) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = require('stream');
    const readableStream = new stream.Readable();
    readableStream.push(csvText);
    readableStream.push(null);
    
    readableStream
      .pipe(csv())
      .on('data', (data) => {
        // Cerca le colonne di coordinate nel CSV di Google Takeout
        let lat, lng, name;
        
        // Google Takeout ha vari formati, proviamo a trovare le coordinate
        for (const key in data) {
          const value = data[key];
          if (!value) continue;
          
          // Cerca coordinate nel formato "lat, lng" o "latitude, longitude"
          const coordMatch = value.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lng = parseFloat(coordMatch[2]);
          }
          
          // Cerca nome del luogo
          if (key.toLowerCase().includes('name') || key.toLowerCase().includes('title')) {
            name = value;
          }
        }
        
        // Se abbiamo trovato coordinate, aggiungiamo lo spot
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          results.push({
            name: name || `Spot GMaps ${results.length + 1}`,
            lat,
            lng,
            desc: "Importato da Google Maps Takeout",
            voto: null,
            tipo: "altro",
            explorato: false,
            source: "gmaps_import"
          });
        }
      })
      .on('end', () => {
        console.log(`📊 CSV Google Maps analizzato: ${results.length} spot trovati`);
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function compareWithDatabase(gmapsSpots) {
  if (!isMongoConnected || !db) {
    throw new Error("Database non connesso");
  }
  
  try {
    // Recupera tutti gli spot dal database
    const dbSpots = await getAllSpots();
    
    // Crea un set di coordinate del database per confronto veloce
    const dbCoords = new Set();
    dbSpots.forEach(spot => {
      const coordKey = `${spot.lat.toFixed(6)},${spot.lng.toFixed(6)}`;
      dbCoords.add(coordKey);
    });
    
    // Trova spot mancanti
    const missingSpots = [];
    
    for (const gspot of gmapsSpots) {
      const coordKey = `${gspot.lat.toFixed(6)},${gspot.lng.toFixed(6)}`;
      if (!dbCoords.has(coordKey)) {
        missingSpots.push({
          ...gspot,
          id: `gmaps_temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
      }
    }
    
    return missingSpots;
  } catch (error) {
    console.error(`❌ Errore confronto con database:`, error);
    throw error;
  }
}

// ===============================
// SETTINGS
// ===============================
const DEFAULT_SETTINGS = {
  version: 4,
  baseLayer: "osm",
  mapStyle: "default",
  randomIncludeLowRated: false,
  lastUpdated: new Date().toISOString(),
  database: "mongodb"
};

async function getSettings() {
  if (isMongoConnected && db) {
    try {
      const settings = await db.collection('settings').findOne({});
      return settings || DEFAULT_SETTINGS;
    } catch (error) {
      console.error(`❌ Errore lettura settings:`, error);
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

async function saveSettings(settings) {
  if (isMongoConnected && db) {
    try {
      await db.collection('settings').updateOne(
        {},
        { $set: { ...settings, lastUpdated: new Date().toISOString() } },
        { upsert: true }
      );
      console.log(`✅ Settings salvati`);
      return settings;
    } catch (error) {
      console.error(`❌ Errore salvataggio settings:`, error);
      throw error;
    }
  } else {
    throw new Error("Database non connesso");
  }
}

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
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
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  
  next();
});

// Middleware di autenticazione
const authMiddleware = (req, res, next) => {
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
// API ENDPOINTS
// ===============================
app.get("/api/spots-extra", async (req, res) => {
  try {
    const spots = await getAllSpots();
    
    res.json({
      success: true,
      data: spots,
      count: spots.length,
      timestamp: new Date().toISOString(),
      database: isMongoConnected ? "mongodb" : "offline"
    });
  } catch (err) {
    console.error("❌ Errore lettura spots:", err);
    res.status(500).json({ 
      success: false,
      error: "Errore lettura spots",
      message: err.message,
      code: "READ_ERROR"
    });
  }
});

app.post("/api/spots-extra", authMiddleware, async (req, res) => {
  try {
    const { name, desc, lat, lng, voto, tipo, explorato } = req.body || {};
    
    console.log(`[POST] Nuovo spot: ${name} (${lat}, ${lng}) - Explorato: ${explorato || false}`);
    
    // Validazione
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
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ 
        success: false,
        error: "Coordinate non valide",
        code: "INVALID_COORDINATES"
      });
    }
    
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ 
        success: false,
        error: "Coordinate fuori range",
        code: "COORDINATES_OUT_OF_RANGE"
      });
    }
    
    let votoNum = null;
    if (voto != null && voto !== "" && !isNaN(voto)) {
      const v = parseInt(voto, 10);
      if (v >= 1 && v <= 6) votoNum = v;
    }
    
    // Verifica duplicati
    const duplicate = await checkForDuplicates(latNum, lngNum);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "Esiste già uno spot in questa posizione",
        existingSpot: duplicate,
        code: "DUPLICATE_SPOT"
      });
    }
    
    const newSpot = {
      id: uuidv4(),
      name: String(name).trim(),
      desc: desc != null ? String(desc).trim() : "",
      lat: latNum,
      lng: lngNum,
      voto: votoNum,
      tipo: tipo ? String(tipo) : getTipo(name, desc),
      explorato: explorato === true || explorato === 'true',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user ? req.user.name : "anonymous",
      version: 1,
      status: "active"
    };

    const savedSpot = await createSpot(newSpot);
    const totalSpots = await db.collection('spots').countDocuments();
    
    res.status(201).json({
      success: true,
      message: "Spot aggiunto con successo",
      data: savedSpot,
      totalSpots: totalSpots,
      timestamp: newSpot.createdAt,
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore salvataggio spot:", err);
    
    if (err.message.includes("duplicate")) {
      return res.status(409).json({
        success: false,
        error: "Spot già esistente",
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
    
    await deleteSpot(spotId);
    const remainingCount = await db.collection('spots').countDocuments();
    
    console.log(`[DELETE] Spot eliminato: ${spotId}`);
    
    res.json({
      success: true,
      message: "Spot eliminato con successo",
      deletedId: spotId,
      remainingCount: remainingCount,
      timestamp: new Date().toISOString(),
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore eliminazione spot:", err);
    
    if (err.message === "Spot non trovato") {
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
    const { name, desc, lat, lng, voto, tipo, explorato } = req.body || {};
    
    console.log(`[PUT] Aggiornamento spot ${spotId}: ${name} - Explorato: ${explorato}`);
    
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
    
    if (isNaN(latNum) || isNaN(lngNum)) {
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
    
    // Verifica che lo spot esista
    const existingSpot = await getSpotById(spotId);
    if (!existingSpot) {
      return res.status(404).json({
        success: false,
        error: "Spot non trovato",
        code: "SPOT_NOT_FOUND"
      });
    }
    
    // Verifica duplicati (escludendo corrente)
    const duplicate = await checkForDuplicates(latNum, lngNum, spotId);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "Esiste già un altro spot in questa posizione",
        existingSpot: duplicate,
        code: "DUPLICATE_COORDINATES"
      });
    }
    
    const updates = {
      name: String(name).trim(),
      desc: desc !== undefined ? String(desc).trim() : existingSpot.desc,
      lat: latNum,
      lng: lngNum,
      voto: votoNum,
      tipo: tipo ? String(tipo) : getTipo(name, desc || existingSpot.desc),
      explorato: explorato !== undefined ? (explorato === true || explorato === 'true') : existingSpot.explorato,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user ? req.user.name : "anonymous"
    };
    
    const updatedSpot = await updateSpot(spotId, updates);
    
    res.json({
      success: true,
      message: "Spot aggiornato con successo",
      data: updatedSpot,
      timestamp: updatedSpot.updatedAt,
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore aggiornamento spot:", err);
    
    if (err.message === "Spot non trovato") {
      return res.status(404).json({
        success: false,
        error: err.message,
        code: "SPOT_NOT_FOUND"
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
// ENDPOINT PER NOTE
// ===============================
app.get("/api/notes", async (req, res) => {
  try {
    const userId = req.query.userId || "default";
    const notes = await getNotes(userId);
    
    res.json({
      success: true,
      data: notes,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ Errore lettura note:", err);
    res.status(500).json({
      success: false,
      error: "Errore lettura note",
      message: err.message,
      code: "NOTES_READ_ERROR"
    });
  }
});

app.post("/api/notes", authMiddleware, async (req, res) => {
  try {
    const { content, userId = "default" } = req.body || {};
    
    if (content === undefined) {
      return res.status(400).json({
        success: false,
        error: "Contenuto delle note obbligatorio",
        code: "MISSING_CONTENT"
      });
    }
    
    await saveNotes(userId, content);
    
    res.json({
      success: true,
      message: "Note salvate con successo",
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Errore salvataggio note:", err);
    res.status(500).json({
      success: false,
      error: "Errore salvataggio note",
      message: err.message,
      code: "NOTES_SAVE_ERROR"
    });
  }
});

// ===============================
// ENDPOINT PER ALLINEAMENTO GOOGLE MAPS
// ===============================
app.post("/api/align-gmaps", upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "File CSV richiesto",
        code: "MISSING_FILE"
      });
    }
    
    console.log(`[ALIGN-GMAPS] File ricevuto: ${req.file.originalname}, ${req.file.size} bytes`);
    
    // Converti il buffer in stringa
    const csvText = req.file.buffer.toString('utf8');
    
    // Analizza il CSV di Google Maps
    const gmapsSpots = await parseGoogleMapsCSV(csvText);
    
    if (gmapsSpots.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nessuno spot valido trovato nel file CSV",
        code: "NO_VALID_SPOTS"
      });
    }
    
    // Confronta con il database
    const missingSpots = await compareWithDatabase(gmapsSpots);
    
    res.json({
      success: true,
      data: {
        totalGmapsSpots: gmapsSpots.length,
        missingSpots: missingSpots,
        missingCount: missingSpots.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Errore allineamento Google Maps:", err);
    res.status(500).json({
      success: false,
      error: "Errore nell'analisi del file CSV",
      message: err.message,
      code: "GMAPS_ALIGNMENT_ERROR"
    });
  }
});

// ===============================
// ENDPOINT PER IMPORT MULTIPLO SPOT
// ===============================
app.post("/api/spots-extra/batch", authMiddleware, async (req, res) => {
  try {
    const { spots } = req.body || {};
    
    if (!Array.isArray(spots) || spots.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Array di spots richiesto",
        code: "INVALID_SPOTS_ARRAY"
      });
    }
    
    console.log(`[BATCH] Importazione batch di ${spots.length} spot`);
    
    const results = {
      total: spots.length,
      success: 0,
      errors: [],
      duplicates: []
    };
    
    for (const spotData of spots) {
      try {
        const { name, desc, lat, lng, voto, tipo, explorato } = spotData || {};
        
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
        
        if (isNaN(latNum) || isNaN(lngNum)) {
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
        const exploratoFinal = explorato === true || explorato === 'true';
        
        const spot = {
          id: uuidv4(),
          name: String(name).trim(),
          desc: desc != null ? String(desc).trim() : "",
          lat: latNum,
          lng: lngNum,
          voto: votoNum,
          tipo: tipoFinal,
          explorato: exploratoFinal,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: req.user ? req.user.name : "batch_import",
          version: 1,
          status: "active"
        };
        
        // Verifica duplicati
        const duplicate = await checkForDuplicates(latNum, lngNum);
        if (duplicate) {
          results.duplicates.push({
            spot: spotData,
            existingSpot: duplicate,
            coordinates: `${lat}, ${lng}`
          });
          continue;
        }
        
        await createSpot(spot);
        results.success++;
        
      } catch (error) {
        results.errors.push({
          spot: spotData,
          error: error.message,
          coordinates: `${spotData.lat}, ${spotData.lng}`
        });
      }
    }
    
    const totalSpots = await db.collection('spots').countDocuments();
    
    console.log(`[BATCH] Completato: ${results.success} successi, ${results.errors.length} errori, ${results.duplicates.length} duplicati`);
    
    res.json({
      success: true,
      message: `Importazione batch completata: ${results.success} spot importati`,
      data: results,
      totalSpots: totalSpots,
      timestamp: new Date().toISOString(),
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore importazione batch:", err);
    res.status(500).json({
      success: false,
      error: "Errore importazione batch",
      message: err.message,
      code: "BATCH_IMPORT_ERROR"
    });
  }
});

// ===============================
// FORCE SAVE ENDPOINT (aggiornato per includere explorato)
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
    
    console.log(`[FORCE-SAVE] ${spots.length} spot da salvare`);
    
    const results = {
      total: spots.length,
      success: 0,
      errors: [],
      duplicates: []
    };
    
    for (const spotData of spots) {
      try {
        const { name, desc, lat, lng, voto, tipo, explorato, id } = spotData || {};
        
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
        
        if (isNaN(latNum) || isNaN(lngNum)) {
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
        const exploratoFinal = explorato === true || explorato === 'true';
        
        const spot = {
          name: String(name).trim(),
          desc: desc != null ? String(desc).trim() : "",
          lat: latNum,
          lng: lngNum,
          voto: votoNum,
          tipo: tipoFinal,
          explorato: exploratoFinal,
          updatedAt: new Date().toISOString(),
          updatedBy: req.user ? req.user.name : "force_save",
          version: 1,
          status: "active"
        };
        
        if (id && id.length >= 10) {
          // Aggiorna o crea con ID specifico
          spot.id = id;
          spot.createdAt = spotData.createdAt || new Date().toISOString();
          
          const existing = await getSpotById(id);
          if (existing) {
            await updateSpot(id, spot);
          } else {
            await createSpot(spot);
          }
        } else {
          // Nuovo spot
          spot.id = uuidv4();
          spot.createdAt = new Date().toISOString();
          spot.createdBy = req.user ? req.user.name : "force_save";
          
          await createSpot(spot);
        }
        
        results.success++;
        
      } catch (error) {
        if (error.message.includes("duplicate") || error.code === 11000) {
          results.duplicates.push({
            spot: spotData,
            error: "Duplicato",
            coordinates: `${spotData.lat}, ${spotData.lng}`
          });
        } else {
          results.errors.push({
            spot: spotData,
            error: error.message,
            coordinates: `${spotData.lat}, ${spotData.lng}`
          });
        }
      }
    }
    
    const totalCount = await db.collection('spots').countDocuments();
    
    console.log(`[FORCE-SAVE] Completato: ${results.success} successi, ${results.errors.length} errori, ${results.duplicates.length} duplicati`);
    
    res.json({
      success: true,
      message: `Salvataggio completato: ${results.success} successi`,
      data: {
        results: results,
        totalSpots: totalCount
      },
      timestamp: new Date().toISOString(),
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore salvataggio forzato:", err);
    res.status(500).json({
      success: false,
      error: "Errore salvataggio forzato",
      message: err.message,
      code: "FORCE_SAVE_ERROR"
    });
  }
});

// ===============================
// SETTINGS ENDPOINTS
// ===============================
app.get("/api/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    
    res.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
      database: isMongoConnected ? "mongodb" : "offline"
    });
  } catch (err) {
    console.error("❌ Errore lettura settings:", err);
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
    const { baseLayer, mapStyle, randomIncludeLowRated } = req.body || {};
    
    const currentSettings = await getSettings();
    
    const updatedSettings = {
      ...currentSettings,
      baseLayer: baseLayer || currentSettings.baseLayer,
      mapStyle: mapStyle || currentSettings.mapStyle,
      randomIncludeLowRated: randomIncludeLowRated !== undefined ? randomIncludeLowRated : currentSettings.randomIncludeLowRated,
      lastUpdated: new Date().toISOString()
    };
    
    await saveSettings(updatedSettings);
    
    res.json({
      success: true,
      message: "Impostazioni salvate",
      data: updatedSettings,
      timestamp: new Date().toISOString(),
      database: "mongodb"
    });
    
  } catch (err) {
    console.error("❌ Errore salvataggio settings:", err);
    res.status(500).json({
      success: false,
      error: "Errore salvataggio settings",
      message: err.message,
      code: "SETTINGS_SAVE_ERROR"
    });
  }
});

// ===============================
// DEBUG & SYSTEM ENDPOINTS
// ===============================
app.get("/api/debug/system-info", async (req, res) => {
  try {
    const spotCount = isMongoConnected ? await db.collection('spots').countDocuments() : 0;
    const exploratiCount = isMongoConnected ? await db.collection('spots').countDocuments({ explorato: true }) : 0;
    const notesCount = isMongoConnected ? await db.collection('notes').countDocuments() : 0;
    const settings = await getSettings();
    
    // Statistiche per voti
    const votoStats = {};
    for (let i = 1; i <= 6; i++) {
      votoStats[i] = isMongoConnected ? await db.collection('spots').countDocuments({ voto: i }) : 0;
    }
    votoStats['null'] = isMongoConnected ? await db.collection('spots').countDocuments({ voto: null }) : 0;
    
    res.json({
      success: true,
      data: {
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          database: isMongoConnected ? "mongodb-connected" : "offline",
          mongodbUri: MONGODB_URI.replace(/ltunit420/, '******')
        },
        stats: {
          spotsCount: spotCount,
          exploratiCount: exploratiCount,
          nonExploratiCount: spotCount - exploratiCount,
          notesCount: notesCount,
          votoStats: votoStats,
          settings: settings
        },
        colors: {
          voto1: "#6b7280",
          voto2: "#16a34a",
          voto3: "#2563eb",
          voto4: "#9333ea",
          voto5: "#fbbf24",
          voto6: "#06b6d4",
          explorato: "#f97316",
          noVoto: "#000000"
        },
        env: {
          NODE_ENV: process.env.NODE_ENV || 'development',
          APP_USERNAME: USERNAME,
          hasMongoDB: !!process.env.MONGODB_URI
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Errore system info:", error);
    res.status(500).json({
      success: false,
      error: "Errore recupero informazioni",
      message: error.message
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: isMongoConnected ? "healthy" : "degraded",
    database: isMongoConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===============================
// ENDPOINT PER RICERCA CITTA' (nominatim proxy)
// ===============================
app.get("/api/search-city", async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query di ricerca richiesta",
        code: "MISSING_QUERY"
      });
    }
    
    // Usa Nominatim di OpenStreetMap
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=it`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json({
      success: true,
      data: data.map(place => ({
        display_name: place.display_name,
        lat: parseFloat(place.lat),
        lon: parseFloat(place.lon),
        importance: place.importance,
        type: place.type
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Errore ricerca città:", err);
    res.status(500).json({
      success: false,
      error: "Errore ricerca città",
      message: err.message,
      code: "CITY_SEARCH_ERROR"
    });
  }
});

// ===============================
// DECODE GOOGLE MAPS URL
// ===============================
app.post("/api/decode-gmaps-url", async (req, res) => {
  try {
    const { url } = req.body || {};
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL richiesto",
        code: "MISSING_URL"
      });
    }
    
    let finalUrl = url;
    
    if (url.includes("goo.gl") || url.includes("maps.app.goo.gl")) {
      try {
        finalUrl = await resolveShortUrl(url);
      } catch (e) {
        console.warn("⚠️  Impossibile risolvere short URL:", e.message);
      }
    }
    
    const coords = extractCoordsFromUrl(finalUrl);
    
    if (!coords) {
      return res.status(400).json({
        success: false,
        error: "Impossibile estrarre coordinate dall'URL",
        code: "NO_COORDINATES_FOUND"
      });
    }
    
    res.json({
      success: true,
      data: coords,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Errore decodifica URL:", err);
    res.status(500).json({
      success: false,
      error: "Errore decodifica URL",
      message: err.message,
      code: "DECODE_ERROR"
    });
  }
});

function extractCoordsFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    
    const placeMatch = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
    
    const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    
    const dataMatch = url.match(/data=!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dataMatch) return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) };
    
    const detailedMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+z)/);
    if (detailedMatch) return { lat: parseFloat(detailedMatch[1]), lng: parseFloat(detailedMatch[2]) };
    
    return null;
  } catch (e) {
    console.error("❌ Error extracting coords from URL:", e);
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
// GESTIONE ERRORI
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
  console.error('❌ Errore non gestito:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
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

async function initializeServer() {
  try {
    console.log('🚀 ===== INIZIALIZZAZIONE SERVER LTU =====');
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Autenticazione: ${USERNAME}:${PASSWORD}`);
    
    // 1. Connetti a MongoDB
    const mongoConnected = await connectToMongoDB();
    
    if (mongoConnected) {
      // 2. Importa CSV iniziale (opzionale)
      console.log('📥 Verifica import iniziale da CSV...');
      const importResult = await importInitialCSV();
      console.log(`✅ Import: ${importResult.imported} importati, ${importResult.skipped} saltati`);
      
      // 3. Inizializza settings
      const spotCount = await db.collection('spots').countDocuments();
      const exploratiCount = await db.collection('spots').countDocuments({ explorato: true });
      const settings = await getSettings();
      
      console.log('📊 Stato iniziale:');
      console.log(`   • Spot totali: ${spotCount}`);
      console.log(`   • Spot esplorati: ${exploratiCount}`);
      console.log(`   • Database: MongoDB Atlas`);
      console.log(`   • Nuovi colori voti attivi`);
      console.log(`   • Allineamento Google Maps: pronto`);
      console.log(`   • Sistema note: pronto`);
      
      await saveSettings({
        ...settings,
        database: "mongodb",
        lastUpdated: new Date().toISOString(),
        version: 5
      });
    } else {
      console.log('⚠️  Modalità offline: MongoDB non disponibile');
    }
    
    console.log('✅ ===== INIZIALIZZAZIONE COMPLETATA =====');
    console.log(`🌍 Server pronto su porta ${port}`);
    console.log(`📁 Endpoint principali:`);
    console.log(`   • GET  /api/spots-extra - Lista spot`);
    console.log(`   • POST /api/spots-extra - Aggiungi spot (auth)`);
    console.log(`   • POST /api/align-gmaps - Allineamento Google Maps`);
    console.log(`   • GET  /api/notes - Leggi note`);
    console.log(`   • POST /api/notes - Salva note (auth)`);
    console.log(`   • GET  /api/search-city - Ricerca città`);
    console.log(`   • GET  /api/debug/system-info - Info sistema`);
    console.log(`   • GET  /api/health - Health check`);
    
  } catch (error) {
    console.error('❌ ===== INIZIALIZZAZIONE FALLITA =====');
    console.error('Errore:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Avvia server dopo inizializzazione
initializeServer().then(() => {
  const server = app.listen(port, () => {
    console.log(`🚀 Server LTU attivo su http://localhost:${port}`);
    console.log(`⏰ Avviato: ${new Date().toISOString()}`);
    console.log(`💾 Database: MongoDB Atlas`);
    console.log(`🎨 Nuovi colori voti:`);
    console.log(`   • 1: Grigio (#6b7280)`);
    console.log(`   • 2: Verde (#16a34a)`);
    console.log(`   • 3: Blu (#2563eb)`);
    console.log(`   • 4: Viola (#9333ea)`);
    console.log(`   • 5: Oro (#fbbf24)`);
    console.log(`   • 6: Platino (#06b6d4)`);
    console.log(`   • Nessun voto: Nero con ?`);
    console.log(`   • Esplorato: Arancione (#f97316)`);
    console.log(`📝 Sistema note integrato`);
    console.log(`🔄 Allineamento Google Maps attivo`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM ricevuto, spegnimento graceful...');
    server.close(() => {
      console.log('👋 Server chiuso');
      if (mongoClient) {
        mongoClient.close();
        console.log('🔌 Connessione MongoDB chiusa');
      }
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error('⏰ Timeout shutdown, spegnimento forzato');
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
