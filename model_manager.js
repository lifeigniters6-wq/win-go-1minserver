// model_manager.js
// Manages multiple models, combines predictions, and supports self-learning updates.

import { KBTModel } from './kbt_models.js';
import { AIModel } from './ai_models.js';
import {
  calculateConsensusStrength,
  analyzePatternOverlap,
  calculateEnhancedConfidence,
  assessModelReliability,
  analyzeWindow,
  detectPatternStrength,
  assessMarketStability,
  calculateMomentum,
  detectCyclicalPatterns,
  combineSignals
} from './prediction_helpers.js';

// Ensure proper class structure and export
class ModelManager {
  constructor() {
    this.models = [];
    // instantiate default models
    this.kbt = new KBTModel('KBT');
    this.ai = new AIModel('AI_FLONZA');
    this.models.push(this.kbt, this.ai);
    // meta settings for 24/7 stability
    this.minConfidence = 65; // increased minimum confidence threshold
    this.consensusThreshold = 0.75; // required agreement between models
    this.stabilityWindow = 100; // lookback window for stability checks
    this.pool = null; // pg pool if provided via init()
    this.lastPredictions = []; // track recent predictions for stability
  }

  // initialize DB persistence (optional). Creates `models` table if missing and loads stats
  async init(pool) {
    if (!pool) return;
    this.pool = pool;
    try {
      // Use snake_case column names for Postgres and keep mapping to JS camelCase
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY,
          name TEXT,
          weight DOUBLE PRECISION,
          wins INTEGER,
          losses INTEGER,
          ema_accuracy DOUBLE PRECISION,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      const { rows } = await this.pool.query('SELECT * FROM models');
      for (const r of rows) {
        const m = this.models.find(x => (x.id || x.name) === (r.id || r.name));
        if (m) {
          if (typeof r.weight === 'number') m.weight = r.weight;
          if (typeof r.wins === 'number') m.wins = r.wins;
          if (typeof r.losses === 'number') m.losses = r.losses;
          // map snake_case DB column to camelCase property
          if (typeof r.ema_accuracy === 'number') m.emaAccuracy = r.ema_accuracy;
        } else {
          // DB has a model we don't know about in memory - log at debug level
          console.info && console.info(`DB model ${r.id} not present in memory; skipping load.`);
        }
      }
    } catch (err) {
      console.warn('ModelManager.init DB error:', err && err.message);
    }
  }

  predict(history, options = {}) {
    // defensive: ensure we have models
    if (!Array.isArray(this.models) || this.models.length === 0) {
      return { prediction: 'UNKNOWN', confidence: Math.max(50, this.minConfidence || 50), logic: 'no-models', patterns: [], chosenModel: null, contributing: [] };
    }
    // get predictions from each model and adjust by model weight
    const preds = this.models.map(m => {
      try {
        const p = m.predict(history, options) || { prediction: 'BIG', confidence: 50 };
        // score = confidence * weight
        const score = (p.confidence || 50) * (m.weight || 1);
        return { model: m, p, score };
      } catch (err) {
        return { model: m, p: { prediction: 'BIG', confidence: 50 }, score: 50 * (m.weight || 1) };
      }
    });

    // sort by score desc
    preds.sort((a, b) => b.score - a.score);

    // Enhanced ensemble decision making with perfect consensus analysis
    let final;
    if (preds.length >= 2) {
      // Calculate agreement strength and pattern overlap
      const consensusStrength = calculateConsensusStrength(preds);
      const patternOverlap = analyzePatternOverlap(preds);
      const modelReliability = assessModelReliability(preds);
      
      if (consensusStrength.agreement > 0.75 && patternOverlap.score > 0.6) {
        // Strong consensus with pattern confirmation
        const combinedConf = calculateEnhancedConfidence({
          predictions: preds,
          consensusStrength,
          patternOverlap,
          modelReliability
        });
        
        final = {
          prediction: consensusStrength.prediction,
          confidence: combinedConf,
          logic: `ENHANCED_ENSEMBLE: ${preds[0].model.id}+${preds[1].model.id}`,
          patterns: [
            ...new Set([
              ...(preds[0].p.patterns || []),
              ...(preds[1].p.patterns || []),
              `Consensus_${Math.round(consensusStrength.agreement * 100)}`,
              `PatternMatch_${Math.round(patternOverlap.score * 100)}`
            ])
          ],
          chosenModel: 'enhanced_ensemble',
          contributing: preds.map(x => ({
            id: x.model.id || x.model.name,
            name: x.model.name,
            weight: x.model.weight * (modelReliability[x.model.id] || 1),
            prediction: x.p.prediction,
            confidence: x.p.confidence,
            reliability: modelReliability[x.model.id]
          }))
        };
      } else {
        const top = preds[0];
        // if top two disagree but scores are very close, reduce confidence and optionally use long-term bias
        let useTop = true;
        let adjustedConf = top.p.confidence;
        if (preds.length >= 2) {
          const gap = preds[0].score - preds[1].score;
          // small gap threshold (tunable)
          if (gap < 15) {
            // compute recent bias from provided history
            const look = Array.isArray(history) ? history : [];
            const recent = (look || []).slice(0, 20);
            const bigCount = recent.filter(r => r.resultType === 'BIG').length;
            const bias = recent.length ? (bigCount / recent.length) : 0.5;
            if (bias > 0.6) {
              useTop = false;
              final = { prediction: 'BIG', confidence: Math.max(55, Math.round(adjustedConf - 10)), logic: 'fallback-low-consensus-bias', patterns: [], chosenModel: 'fallback' };
            } else if (bias < 0.4) {
              useTop = false;
              final = { prediction: 'SMALL', confidence: Math.max(55, Math.round(adjustedConf - 10)), logic: 'fallback-low-consensus-bias', patterns: [], chosenModel: 'fallback' };
            } else {
              // low consensus and no clear bias — choose top but mark as low_consensus and lower confidence
              adjustedConf = Math.max(50, Math.round(adjustedConf - 12));
            }
          }
        }

        if (useTop) {
          final = final || {
            prediction: top.p.prediction,
            confidence: adjustedConf,
            logic: `${top.model.id}:${top.p.logic || 'model'}`,
            patterns: top.p.patterns || [],
            chosenModel: top.model.id || top.model.name,
            contributing: preds.map(x => ({ id: x.model.id || x.model.name, name: x.model.name, weight: x.model.weight, prediction: x.p.prediction, confidence: x.p.confidence }))
          };
        }
      }

      // safety: enforce minConfidence
      if (final.confidence < this.minConfidence) final.confidence = this.minConfidence;
      return final;
    } else {
      // Fallback for single model case
      const top = preds[0];
      return {
        prediction: top.p.prediction,
        confidence: Math.max(this.minConfidence, top.p.confidence),
        logic: `${top.model.id}:${top.p.logic || 'model'}`,
        patterns: top.p.patterns || [],
        chosenModel: top.model.id,
        contributing: preds.map(x => ({ id: x.model.id, name: x.model.name, weight: x.model.weight, prediction: x.p.prediction, confidence: x.p.confidence }))
      };
    }
  }

  learn(chosenModelId, wasWin, context = {}) {
    const m = this.models.find(x => (x.id || x.name) === chosenModelId);
    if (!m) return null;
    // scale learning rate with context (e.g., consecutiveLosses)
    const streak = context.consecutiveLosses || 0;
    const lr = 1 + Math.min(3, streak * 0.4);
    const res = m.learn(!!wasWin, { lr });
    // persist updated stats if pool is available (fire-and-forget but centralized)
    if (this.pool) {
      this.persistModelStats(m).catch(e => console.warn('Persist model stats failed:', e && e.message));
    }
    return res;
  }

  // credit multiple contributors (from ensemble) proportionally
  learnMultiple(contributions = [], wasWin, context = {}) {
    // contributions: [{ id, weight, prediction, confidence }]
    if (!Array.isArray(contributions) || contributions.length === 0) return null;
    // compute total score to normalize
    const totalScore = contributions.reduce((s, c) => s + ((c.weight || 1) * (c.confidence || 50)), 0) || 1;
    const results = [];
    // dynamic LR multiplier based on context e.g., consecutiveLosses
    const streak = context.consecutiveLosses || 0;
    const baseLR = 1 + Math.min(3, streak * 0.4); // increase lr with streaks
    for (const c of contributions) {
      const share = ((c.weight || 1) * (c.confidence || 50)) / totalScore;
      const model = this.models.find(m => (m.id || m.name) === c.id);
      if (!model) continue;
      // scale lr by share so more contributing models get stronger updates
      const lr2 = baseLR * (0.2 + 0.8 * share);
      const r = model.learn(!!wasWin, { lr: lr2 });
      results.push({ id: model.id, lr: lr2, res: r });
      // persist per-model update
      if (this.pool) {
        this.persistModelStats(model).catch(e => console.warn('Persist model stats failed:', e && e.message));
      }
    }
    return results;
  }

  // centralized persistence helper (returns a Promise)
  async persistModelStats(m) {
    if (!this.pool || !m) return;
    const id = m.id || m.name;
    const sql = `INSERT INTO models (id, name, weight, wins, losses, ema_accuracy, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        weight = EXCLUDED.weight,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        ema_accuracy = EXCLUDED.ema_accuracy,
        updated_at = NOW()`;
    return this.pool.query(sql, [id, m.name, m.weight, m.wins, m.losses, m.emaAccuracy]);
  }

  // debug utility to show model internals
  dumpModelState() {
    return this.models.map(m => ({ id: m.id, name: m.name, weight: m.weight, wins: m.wins, losses: m.losses, emaAccuracy: m.emaAccuracy }));
  }
}

// Create singleton instance
const instance = new ModelManager();

// Export singleton and class
export default instance;
export { ModelManager };
