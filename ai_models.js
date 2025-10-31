// ai_models.js
// FLONZA V4 and helper models extracted from server logic.

import {
  calculateVolatility,
  detectManipulation,
  analyzeTrendStrength,
  analyzeWindow,
  detectPatternStrength,
  assessMarketStability,
  calculateMomentum,
  detectCyclicalPatterns,
  combineSignals
} from './prediction_helpers.js';

function flonzaElitePredict(history) {
  if (!Array.isArray(history) || history.length < 10) {
    return { prediction: "BIG", confidence: 55, logic: "fallback", patterns: ["insufficient_data"] };
  }
  const models = {
    pattern: model1_patternAnalysis(history),
    colorNumber: model2_colorNumberAnalysis(history),
    anomaly: model3_manipulationDetector(history),
    hybrid: model4_hybridPredictor(history)
  };
  let totalWeight = 0;
  let weightedPrediction = { BIG: 0, SMALL: 0 };
  for (const [name, result] of Object.entries(models)) {
    const weight = (result.confidence || 60) / 100;
    totalWeight += weight;
    weightedPrediction[result.prediction] += weight;
  }
  // Enhanced stability checks
  const finalPrediction = weightedPrediction.BIG > weightedPrediction.SMALL ? "BIG" : "SMALL";
  const predictionStrength = Math.abs(weightedPrediction.BIG - weightedPrediction.SMALL) / totalWeight;
  const avgConfidence = Math.min(90, Math.max(65, (weightedPrediction[finalPrediction] / totalWeight) * 100));
  
  // Multiple stability indicators
  const randomnessScore = detectTrueRandomness(history);
  const patternStrength = models.pattern.confidence / 100;
  const anomalyRisk = models.anomaly.isManipulated ? 0.5 : 1;
  
  // Compute stable confidence with multiple factors
  const stabilityFactor = (patternStrength + (1 - randomnessScore) + anomalyRisk) / 3;
  const adjustedConfidence = Math.round(avgConfidence * stabilityFactor);
  
  return {
    prediction: finalPrediction,
    confidence: Math.max(65, adjustedConfidence), // ensure minimum confidence
    logic: "FLONZA_V4_ENHANCED",
    contributors: Object.entries(models).map(([name, result]) => ({
      model: name,
      prediction: result.prediction,
      confidence: result.confidence
    })),
    patterns: [
      ...(models.pattern.patterns || []),
      ...(models.colorNumber.patterns || []),
      ...(models.anomaly.isManipulated ? ["⚠️ manipulation_risk"] : [])
    ].filter(p => p)
  };
}

function model1_patternAnalysis(hist) {
  const patterns = [];
  const recent = hist.slice(0, 20);
  const bigCount = recent.filter(r => r.resultType === "BIG").length;
  const smallCount = recent.length - bigCount;
  let streak = 1;
  let current = recent[0].resultType;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].resultType === current) streak++;
    else break;
  }
  if (streak >= 3) {
    patterns.push(`Streak_${streak}`);
    return { prediction: current === "BIG" ? "SMALL" : "BIG", confidence: Math.min(90, 70 + streak * 3), patterns };
  }
  let alt = true;
  for (let i = 1; i < Math.min(6, recent.length); i++) {
    if (recent[i].resultType === recent[i-1].resultType) { alt = false; break; }
  }
  if (alt && recent.length >= 4) {
    patterns.push("Alternating");
    return { prediction: recent[recent.length-1].resultType === "BIG" ? "SMALL" : "BIG", confidence: 82, patterns };
  }
  if (recent.length >= 4 && recent[0].resultType === recent[2].resultType && recent[1].resultType === recent[3].resultType) {
    patterns.push("Mirror");
    return { prediction: recent[1].resultType === "BIG" ? "SMALL" : "BIG", confidence: 78, patterns };
  }
  const bias = Math.abs(bigCount - smallCount) / recent.length;
  if (bias > 0.3) {
    patterns.push(`Bias_${bigCount > smallCount ? "BIG" : "SMALL"}`);
    return { prediction: bigCount > smallCount ? "SMALL" : "BIG", confidence: 70 + bias * 30, patterns };
  }
  return { prediction: "BIG", confidence: 60, patterns: ["No_clear_pattern"] };
}

function model2_colorNumberAnalysis(hist) {
  const patterns = [];
  const nums = hist.slice(0, 30).map(r => r.number);
  const freq = Array(10).fill(0);
  nums.forEach(n => { if (typeof n === 'number' && !Number.isNaN(n)) freq[n]++; });
  const maxFreq = Math.max(...freq);
  const hotNumber = freq.indexOf(maxFreq);
  if (hotNumber >= 5) {
    patterns.push(`Hot_BIG_${hotNumber}`);
    return { prediction: "BIG", confidence: 75, patterns };
  } else if (hotNumber < 5) {
    patterns.push(`Hot_SMALL_${hotNumber}`);
    return { prediction: "SMALL", confidence: 75, patterns };
  }
  return { prediction: "BIG", confidence: 62, patterns: ["Neutral_numbers"] };
}

function model3_manipulationDetector(hist) {
  const recent = hist.slice(0, 50);
  const intervals = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const t1 = new Date(recent[i].createTime || Date.now()).getTime();
    const t2 = new Date(recent[i+1].createTime || Date.now()).getTime();
    intervals.push(Math.abs(t1 - t2));
  }
  const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 60000;
  const stdDev = intervals.length ? Math.sqrt(intervals.reduce((sum, x) => sum + Math.pow(x - avgInterval, 2), 0) / intervals.length) : 0;
  const isManipulated = stdDev > 8000 || intervals.some(iv => iv > 120000);
  return { isManipulated, riskScore: isManipulated ? 0.9 : 0.1 };
}

function model4_hybridPredictor(hist) {
  const recent = hist.slice(0, 15);
  const extended = hist.slice(0, 30); // longer window for trend analysis
  
  if (recent.length === 0) return { prediction: "BIG", confidence: 60, patterns: ["no_data"] };
  
  // Multi-window analysis
  const shortTerm = analyzeWindow(recent);
  const longTerm = analyzeWindow(extended);
  
  // Pattern strength analysis
  const patternStrength = detectPatternStrength(recent);
  const trendStrength = analyzeTrendStrength(extended);
  const marketCondition = assessMarketStability(extended);
  
  // Advanced trend detection
  const trends = {
    momentum: calculateMomentum(recent),
    volatility: calculateVolatility(extended),
    cyclical: detectCyclicalPatterns(extended)
  };
  
  // Weighted ensemble prediction
  const signals = combineSignals({
    short: shortTerm,
    long: longTerm,
    pattern: patternStrength,
    trend: trendStrength,
    market: marketCondition,
    ...trends
  });
  
  const prediction = signals.finalPrediction;
  const baseConf = Math.min(92, 70 + (signals.strength * 25));
  const adjustedConf = baseConf * marketCondition.stabilityFactor;
  
  return {
    prediction,
    confidence: Math.max(70, Math.min(92, adjustedConf)),
    patterns: [
      "Neural_Trend",
      ...Object.entries(signals.activePatterns)
        .filter(([_, strength]) => strength > 0.7)
        .map(([name, _]) => `Strong_${name}`)
    ]
  };
}

function detectTrueRandomness(hist) {
  const seq = hist.slice(0, 50).map(r => r.resultType === "BIG" ? 1 : 0);
  if (seq.length < 10) return 0.5;
  let runs = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] !== seq[i-1]) runs++;
  }
  const n1 = seq.filter(x => x === 1).length;
  const n2 = seq.length - n1;
  const expectedRuns = (2 * n1 * n2) / (n1 + n2) + 1;
  const variance = n1 && n2 ? (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / ((n1 + n2) ** 2 * (n1 + n2 - 1)) : 1;
  const z = variance > 0 ? Math.abs(runs - expectedRuns) / Math.sqrt(variance) : 0;
  return Math.max(0, 1 - Math.abs(z) / 3);
}

export {
  flonzaElitePredict,
  model1_patternAnalysis,
  model2_colorNumberAnalysis,
  model3_manipulationDetector,
  model4_hybridPredictor,
  detectTrueRandomness
};

// --- Self-learning AI model wrapper ---
class AIModel {
  constructor(id = 'AI_FLONZA') {
    this.id = id;
    this.name = 'FLONZA_V4_HYBRID';
    this.weight = 1.0;
    this.history = [];
    this.wins = 0;
    this.losses = 0;
    this.lookback = 200;
    this.emaAccuracy = 0.5;
    this.emaAlpha = 0.05;
    this.minWeight = 0.2;
    this.maxWeight = 3.0;
    this.decay = 0.999;
  }

  predict(history, options = {}) {
    const result = flonzaElitePredict(history, options);
    return { ...result, modelId: this.id, modelName: this.name, modelWeight: this.weight };
  }

  learn(wasWin) {
    const v = wasWin ? 1 : 0;
    this.history.push(v);
    if (this.history.length > this.lookback) this.history.shift();
    if (wasWin) this.wins++; else this.losses++;
    const total = this.wins + this.losses;
    const instantAcc = total > 0 ? (this.wins / total) : 0.5;
    this.emaAccuracy = this.emaAccuracy * (1 - this.emaAlpha) + instantAcc * this.emaAlpha;
    const advantage = this.emaAccuracy - 0.5;
    const delta = advantage * 0.5;
    const lr = typeof arguments[1] === 'object' && typeof arguments[1].lr === 'number' ? Math.max(0.1, arguments[1].lr) : 1.0;
    this.weight = Math.max(this.minWeight, Math.min(this.maxWeight, this.weight * Math.pow(this.decay, lr) + (1 + delta) * lr));
    return { wins: this.wins, losses: this.losses, weight: this.weight, emaAccuracy: this.emaAccuracy };
  }
}

export { AIModel };
