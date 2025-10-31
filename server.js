// server.js — Backend only (safe for Render)
import express from 'express';
import pg from 'pg';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Load .env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (err) {
  console.warn('dotenv not installed or failed to load; skipping .env load');
}

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Win Go 1Min API Generator
function generateWingoUrl() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10).replace(/-/g, "");
  const msSinceMidnight = now - new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minutesSinceMidnight = Math.floor(msSinceMidnight / 60000);
  const drawNumber = ((minutesSinceMidnight + 1440) % 1440).toString().padStart(4, '0');
  return `https://wingo.oss-ap-southeast-7.aliyuncs.com/WinGo_1_${today}10001${drawNumber}_past100_draws`;
}

// Database connection
const connectionString = process.env.DATABASE_URL || 
  (process.env.PGHOST ? 
    `postgresql://${encodeURIComponent(process.env.PGUSER || 'postgres')}${process.env.PGPASSWORD ? ':' + encodeURIComponent(process.env.PGPASSWORD) : ''}@${process.env.PGHOST}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'postgres'}` 
    : null
  );

let pool = null;

// Initialize database
async function initializeDatabase() {
  if (!connectionString) {
    console.warn('No database connection string found. Starting without DB persistence.');
    return null;
  }

  try {
    pool = new Pool({ 
      connectionString, 
      max: 10,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Test connection
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('✅ Database connected successfully');
      
      // Initialize tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS predictions (
          id SERIAL PRIMARY KEY,
          period TEXT UNIQUE NOT NULL,
          prediction TEXT NOT NULL,
          actual TEXT,
          actual_number INTEGER,
          status TEXT NOT NULL DEFAULT 'pending',
          signal TEXT,
          model_id TEXT,
          logic_used TEXT,
          patterns TEXT[],
          contributors JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY,
          name TEXT,
          weight DOUBLE PRECISION,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          emaaccuracy DOUBLE PRECISION DEFAULT 0.5,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_predictions_period ON predictions(period);
        CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
        CREATE INDEX IF NOT EXISTS idx_models_updated_at ON models(updated_at);
      `);
      console.log('✅ Database tables initialized');
    } finally {
      client.release();
    }
    
    return pool;
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    pool = null;
    return null;
  }
}

// Import models and manager
import * as kbtModels from './kbt_models.js';
import * as aiModels from './ai_models.js';
import { getEngineName } from './ensemble.js';
import modelManager from './model_manager.js';

// Prediction storage functions
async function storePrediction(period, prediction, signal, modelId, logicUsed, patterns, contributors) {
  if (!pool) return null;
  
  try {
    const result = await pool.query(
      `INSERT INTO predictions 
       (period, prediction, signal, model_id, logic_used, patterns, contributors) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (period) DO UPDATE SET 
       prediction = $2,
       signal = $3,
       model_id = $4,
       logic_used = $5,
       patterns = $6,
       contributors = $7,
       updated_at = NOW()
       RETURNING id`,
      [period, prediction, signal, modelId, logicUsed, patterns, contributors]
    );
    return result.rows[0].id;
  } catch (err) {
    console.error('Failed to store prediction:', err.message);
    return null;
  }
}

async function updatePredictionResult(period, actual, actualNumber) {
  if (!pool) return;
  
  try {
    await pool.query(
      `UPDATE predictions 
       SET actual = $1,
           actual_number = $2,
           status = 'completed',
           updated_at = NOW()
       WHERE period = $3`,
      [actual, actualNumber, period]
    );
  } catch (err) {
    console.error('Failed to update prediction result:', err.message);
  }
}

// Win Go 1Min API data fetcher
async function fetchWingoData() {
  try {
    const url = generateWingoUrl();
    console.log('🔄 Fetching from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No data received from Win Go API');
    }
    
    // Process Win Go 1Min data format
    const results = data.map(item => ({
      issueNumber: item.issueNumber || item.content?.issueNumber,
      number: parseInt(item.content?.number || item.number),
      resultType: (parseInt(item.content?.number || item.number) >= 5) ? 'BIG' : 'SMALL',
      createTime: item.createTime || new Date().toISOString(),
      colour: item.content?.colour,
      premium: item.content?.premium
    })).filter(item => item.issueNumber && !isNaN(item.number));
    
    return results;
  } catch (error) {
    console.error('❌ Error fetching Win Go 1Min data:', error.message);
    return null;
  }
}

// Prediction state
let consecutiveLosses = 0;
let lastPrediction = null;

// Self-scheduling fetch loop
let fetchTimer = null;

async function fetchAndProcess() {
  let nextDelay = 3000; // 3 seconds between fetches
  
  try {
    const results = await fetchWingoData();
    
    if (!results || results.length === 0) {
      console.log('⏭️ No data received, skipping prediction');
      nextDelay = 10000; // Wait longer if no data
      return;
    }

    const latest = results[0];
    const nextPeriod = (parseInt(latest.issueNumber) + 1).toString();

    // Check if we already predicted this period
    if (pool) {
      const { rows: existsRows } = await pool.query(
        'SELECT 1 FROM predictions WHERE period = $1', 
        [nextPeriod]
      );
      if (existsRows.length > 0) {
        console.log('⏭️ Prediction already exists for period:', nextPeriod);
        return;
      }
    }

    // Prepare history for prediction engine
    const historyForEngine = results.map(r => ({
      resultType: r.resultType,
      number: r.number,
      createTime: r.createTime
    }));

    // Get prediction from model manager
    const finalPrediction = modelManager.predict(historyForEngine, { 
      consecutiveLosses, 
      lastPrediction 
    });

    // Store prediction
    if (pool) {
      await storePrediction(
        nextPeriod,
        finalPrediction.prediction,
        `${finalPrediction.confidence}%`,
        finalPrediction.chosenModel || 'ensemble',
        finalPrediction.logic || '',
        finalPrediction.patterns || [],
        finalPrediction.contributing || []
      );
    }

    // Update previous prediction result
    if (results.length > 1 && pool) {
      const prevPeriod = results[1].issueNumber;
      const actualType = results[1].resultType;
      const actualNumber = results[1].number;

      const { rows: predRows } = await pool.query(
        'SELECT prediction, model_id, contributors FROM predictions WHERE period = $1 AND status = $2',
        [prevPeriod, 'pending']
      );

      if (predRows.length > 0) {
        const isWin = predRows[0].prediction === actualType;
        const newStatus = isWin ? '✅ win' : '❌ loss';
        
        await pool.query(
          `UPDATE predictions
           SET actual = $1, actual_number = $2, status = $3, updated_at = NOW()
           WHERE period = $4`,
          [actualType, actualNumber, newStatus, prevPeriod]
        );

        // Update learning
        if (isWin) consecutiveLosses = 0;
        else consecutiveLosses++;

        try {
          const modelId = predRows[0].model_id || null;
          if (modelId && modelId !== 'ensemble') {
            modelManager.learn(modelId, isWin, { consecutiveLosses });
          } else if (modelId === 'ensemble') {
            const contrib = predRows[0].contributors || [];
            if (Array.isArray(contrib) && contrib.length > 0) {
              modelManager.learnMultiple(contrib, isWin, { consecutiveLosses });
            }
          }
        } catch (learningErr) {
          console.warn('Learning update failed:', learningErr.message);
        }
      }
    }

    const cleanEngineName = getEngineName(finalPrediction.logic);
    lastPrediction = finalPrediction.prediction;
    
    console.log(`✅ Predicted ${nextPeriod} → ${finalPrediction.prediction} (${finalPrediction.confidence}%) via ${cleanEngineName}`);

  } catch (err) {
    console.error('❌ Error in fetchAndProcess:', err.message);
    nextDelay = 15000; // Wait longer on error
  } finally {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchAndProcess, nextDelay);
  }
}

// ========== API ENDPOINTS ==========
app.use(express.json());

app.get('/trade', async (req, res) => {
  try {
    const results = await fetchWingoData();
    
    if (!results || results.length === 0) {
      return res.json({ 
        current: null, 
        history: [], 
        db: !!pool,
        error: 'No data available from Win Go 1Min API'
      });
    }

    const latest = results[0];
    const nextPeriod = (parseInt(latest.issueNumber) + 1).toString();
    
    // Prepare history for prediction
    const historyForEngine = results.map(r => ({
      resultType: r.resultType,
      number: r.number,
      createTime: r.createTime
    }));

    // Get live prediction
    const finalPrediction = modelManager.predict(historyForEngine, { 
      consecutiveLosses, 
      lastPrediction 
    });

    const cleanEngineName = getEngineName(finalPrediction.logic);
    
    const current = {
      period: nextPeriod,
      prediction: finalPrediction.prediction,
      status: 'pending',
      signal: `${finalPrediction.confidence}%`,
      logicUsed: cleanEngineName,
      emoji: '⌛',
      confidence: finalPrediction.confidence,
      patterns: finalPrediction.patterns || []
    };

    // Prepare history (previous results)
    const history = results.slice(1, 16).map((result, index) => ({
      period: result.issueNumber,
      prediction: result.resultType, // Actual result
      status: 'resolved',
      actual: result.resultType,
      actualNumber: result.number,
      signal: '100%', // Historical data is 100% accurate
      logicUsed: 'Historical'
    }));

    // Store prediction if DB available
    if (pool) {
      await storePrediction(
        nextPeriod,
        finalPrediction.prediction,
        `${finalPrediction.confidence}%`,
        finalPrediction.chosenModel || 'ensemble',
        cleanEngineName,
        finalPrediction.patterns || [],
        finalPrediction.contributing || []
      );
    }

    res.json({
      current,
      history,
      db: !!pool,
      source: 'Win Go 1Min API'
    });

  } catch (err) {
    console.error('Error in /trade endpoint:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
});

app.get('/stats', async (req, res) => {
  try {
    if (!pool) {
      return res.json({ 
        totalPredictions: 0, 
        wins: 0, 
        losses: 0, 
        accuracyPercent: 0.0, 
        consecutiveLosses, 
        maxWinStreak: 0, 
        maxLossStreak: 0, 
        db: false 
      });
    }

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status LIKE '%win%') AS wins,
        COUNT(*) FILTER (WHERE status LIKE '%loss%') AS losses,
        COUNT(*) AS total
      FROM predictions
      WHERE status IN ('✅ win', '❌ loss')
    `);

    const { wins, losses, total } = rows[0];
    const accuracy = total > 0 ? ((wins / total) * 100).toFixed(2) : '0.00';
    
    res.json({
      totalPredictions: parseInt(total),
      wins: parseInt(wins),
      losses: parseInt(losses),
      accuracyPercent: parseFloat(accuracy),
      consecutiveLosses,
      maxWinStreak: 0,
      maxLossStreak: 0,
      db: true
    });
  } catch (err) {
    console.error('Error in /stats endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/history', async (req, res) => {
  try {
    if (!pool) return res.json([]);
    
    const { rows } = await pool.query(`
      SELECT period, prediction, actual, actual_number, status, signal, logic_used, patterns, created_at
      FROM predictions
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /history endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/models/stats', async (req, res) => {
  try {
    const runtime = modelManager.stats();
    let persisted = [];
    
    if (pool) {
      const { rows } = await pool.query(
        'SELECT id, name, weight, wins, losses, emaaccuracy, updated_at FROM models'
      );
      persisted = rows;
    }
    
    res.json({ runtime, persisted });
  } catch (err) {
    console.error('Error in /models/stats endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/wingo-url', (req, res) => {
  res.json({ url: generateWingoUrl() });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    db: !!pool,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'FLONZA AI Prediction Engine',
    version: '2.0.0',
    features: [
      'Win Go 1Min Lottery Predictions',
      'Self-learning AI Models',
      'Real-time Data Processing',
      'PostgreSQL Persistence'
    ],
    endpoints: [
      '/trade - Get current prediction',
      '/stats - Get prediction statistics',
      '/history - Get prediction history',
      '/models/stats - Get model performance',
      '/wingo-url - Get current Win Go 1Min API URL',
      '/health - Health check'
    ]
  });
});

// ========== START SERVER ==========
async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Initialize model manager with database pool
    if (pool) {
      await modelManager.init(pool);
      console.log('✅ Model manager initialized with database');
    } else {
      console.log('⚠️ Model manager running without database persistence');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ FLONZA AI Backend running on port ${PORT}`);
      console.log(`🎯 Using Win Go 1Min Lottery API`);
      if (pool) {
        console.log(`💾 Database: Connected`);
      } else {
        console.log(`⚠️ Database: Not connected - running in memory only`);
      }
    });
    
    // Start the prediction loop
    console.log('🔄 Starting prediction loop...');
    fetchAndProcess();
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();