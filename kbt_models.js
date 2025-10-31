// kbt_models.js
// KBT-related model functions extracted from server logic.

import {
  detectStreaks,
  detectAlternations,
  analyzeDistribution,
  analyzeTimingPatterns,
  calculatePatternWeights,
  determineBestPrediction,
  calculateBaseConfidence,
  assessMarketCondition
} from './prediction_helpers.js';

function enhancedTrendAnalysis(history, options = {}) {
  if (!Array.isArray(history) || history.length < 3) {
    return { prediction: "BIG", confidence: 60, logic: 8, patterns: ["fallback"] };
  }
  const activePatternsKBT = [];
  const predictions = [];

  let lastStreakType = history[0].resultType;
  let streakLength = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i].resultType === lastStreakType) streakLength++;
    else break;
  }
  if (streakLength >= 3) {
    activePatternsKBT.push("Streak of " + streakLength);
    predictions.push({ prediction: lastStreakType === "BIG" ? "SMALL" : "BIG", confidence: Math.min(90, 70 + (streakLength * 5)), logic: 1 });
  }

  let alternating = true;
  for (let i = 1; i < Math.min(6, history.length); i++) {
    if ((history[i - 1].resultType === "BIG" && history[i].resultType !== "SMALL") ||
        (history[i - 1].resultType === "SMALL" && history[i].resultType !== "BIG")) {
      alternating = false; break;
    }
  }
  if (alternating && history.length >= 4) {
    activePatternsKBT.push("Alternating pattern");
    predictions.push({ prediction: history[history.length - 1].resultType === "BIG" ? "SMALL" : "BIG", confidence: 80, logic: 3 });
  }

  if (history.length >= 5) {
    const lastThree = history.slice(0, 3);
    if (lastThree[0].resultType === lastThree[1].resultType && lastThree[0].resultType === lastThree[2].resultType) {
      activePatternsKBT.push("Triple pattern");
      predictions.push({ prediction: lastThree[0].resultType === "BIG" ? "SMALL" : "BIG", confidence: 85, logic: 5 });
    }
  }

  const lookback = Math.min(30, history.length); // increased lookback window
  const bigCount = history.slice(0, lookback).filter(r => r.resultType === "BIG").length;
  const smallCount = lookback - bigCount;
  const bigPercent = (bigCount / lookback) * 100;
  
  // Enhanced stability check using moving averages
  const shortWindow = history.slice(0, 10);
  const longWindow = history.slice(0, lookback);
  const shortBigPercent = (shortWindow.filter(r => r.resultType === "BIG").length / shortWindow.length) * 100;
  const longBigPercent = (longWindow.filter(r => r.resultType === "BIG").length / longWindow.length) * 100;
  
  if (Math.abs(bigPercent - 50) > 15 && Math.abs(shortBigPercent - longBigPercent) < 20) {
    activePatternsKBT.push("Stable weighted probability");
    predictions.push({ prediction: bigPercent > 50 ? "SMALL" : "BIG", confidence: Math.min(85, Math.abs(bigPercent - 50) + 35), logic: 8 });
  }

  // loss recovery logic can be injected via options.state if needed by caller
  if (options.consecutiveLosses && options.consecutiveLosses >= 2 && options.lastPrediction) {
    activePatternsKBT.push("Loss recovery");
    predictions.push({ prediction: options.lastPrediction === "BIG" ? "SMALL" : "BIG", confidence: 75 + (options.consecutiveLosses * 5), logic: 22 });
  }

  if (history.length >= 4 &&
      history[0].resultType === history[2].resultType &&
      history[1].resultType === history[3].resultType) {
    activePatternsKBT.push("Mirror pattern");
    predictions.push({ prediction: history[1].resultType === "BIG" ? "SMALL" : "BIG", confidence: 75, logic: 6 });
  }

  if (history.length >= 8) {
    const nnPrediction = neuralNetworkPrediction(history);
    if (nnPrediction.confidence > 70) {
      activePatternsKBT.push("AI detected");
      predictions.push(nnPrediction);
    }
  }

  if (history.length >= 8) {
    const fibPrediction = fibonacciPrediction(history);
    if (fibPrediction.confidence > 65) {
      activePatternsKBT.push("Fibonacci pattern");
      predictions.push(fibPrediction);
    }
  }

  if (history.length >= 10) {
    const mlPrediction = machineLearningPrediction(history);
    if (mlPrediction.confidence > 75) {
      activePatternsKBT.push("ML detected");
      predictions.push(mlPrediction);
    }
  }

  if (predictions.length === 0) {
    if (history.length >= 2 && history[0].resultType === history[1].resultType) {
      predictions.push({ prediction: history[0].resultType === "BIG" ? "SMALL" : "BIG", confidence: 65, logic: 4 });
    } else {
      predictions.push({ prediction: history[0].resultType === "BIG" ? "SMALL" : "BIG", confidence: 60, logic: 12 });
    }
  }

  let bestPrediction = predictions[0];
  for (let i = 1; i < predictions.length; i++) {
    if (predictions[i].confidence > bestPrediction.confidence) {
      bestPrediction = predictions[i];
    }
  }
  return { ...bestPrediction, patterns: activePatternsKBT };
}

function neuralNetworkPrediction(recent) {
  const bigCount = recent.filter(r => r.resultType === "BIG").length;
  const smallCount = recent.length - bigCount;
  
  // Enhanced pattern detection with multi-layer analysis
  const patterns = {
    streaks: detectStreaks(recent),
    alternations: detectAlternations(recent),
    distributions: analyzeDistribution(recent),
    timing: analyzeTimingPatterns(recent)
  };
  
  // Weighted decision making
  const weights = calculatePatternWeights(patterns);
  const prediction = determineBestPrediction(patterns, weights);
  
  // Confidence calculation with multiple factors
  const baseConfidence = calculateBaseConfidence(patterns);
  const marketCondition = assessMarketCondition(recent);
  const finalConfidence = Math.min(92, baseConfidence * marketCondition);
  
  return { 
    prediction: prediction,
    confidence: Math.max(70, finalConfidence),
    logic: 19,
    patterns: Object.entries(patterns)
      .filter(([_, p]) => p.strength > 0.7)
      .map(([name, _]) => `Strong_${name}`)
  };
}

function fibonacciPrediction(recent) {
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const bigCount = recent.filter(r => r.resultType === "BIG").length;
  const totalResults = recent.length;
  if (totalResults === 0) return { prediction: "BIG", confidence: 50, logic: 25 };
  const ratio = bigCount / totalResults;
  let closestLevel = levels.reduce((prev, curr) => (Math.abs(curr - ratio) < Math.abs(prev - ratio) ? curr : prev));
  if (closestLevel >= 0.618) return { prediction: "SMALL", confidence: 75, logic: 25 };
  else if (closestLevel <= 0.382 && closestLevel !== 0) return { prediction: "BIG", confidence: 75, logic: 25 };
  else return { prediction: recent[0].resultType === "BIG" ? "SMALL" : "BIG", confidence: 70, logic: 25 };
}

function machineLearningPrediction(recent) {
  const bigCount = recent.filter(r => r.resultType === "BIG").length;
  const smallCount = recent.length - bigCount;
  let lastType = recent[0].resultType;
  let streakLength = 1;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].resultType === lastType) streakLength++;
    else break;
  }
  let alternating = true;
  for (let i = 1; i < Math.min(6, recent.length); i++) {
    if ((recent[i - 1].resultType === "BIG" && recent[i].resultType !== "SMALL") ||
        (recent[i - 1].resultType === "SMALL" && recent[i].resultType !== "BIG")) {
      alternating = false; break;
    }
  }
  if (streakLength >= 3) return { prediction: lastType === "BIG" ? "SMALL" : "BIG", confidence: 85, logic: 28 };
  else if (alternating) return { prediction: recent[recent.length - 1].resultType === "BIG" ? "SMALL" : "BIG", confidence: 80, logic: 28 };
  else if (bigCount / recent.length > 0.6) return { prediction: "SMALL", confidence: 78, logic: 28 };
  else if (smallCount / recent.length > 0.6) return { prediction: "BIG", confidence: 78, logic: 28 };
  else return { prediction: bigCount > smallCount ? "SMALL" : "BIG", confidence: 75, logic: 28 };
}

export {
  enhancedTrendAnalysis,
  neuralNetworkPrediction,
  fibonacciPrediction,
  machineLearningPrediction
};

// --- Self-learning model wrapper ---
class KBTModel {
  constructor(id = 'KBT') {
    this.id = id;
    this.name = 'KBT Ultralogic';
    this.weight = 1.0; // adaptive weight used by ensemble
    this.history = []; // recent outcomes for the model (1/0)
    this.wins = 0;
    this.losses = 0;
    this.lookback = 200; // track last N outcomes for lightweight smoothing
    this.emaAccuracy = 0.5; // exponential moving average of accuracy
    this.emaAlpha = 0.05; // smoothing factor for EMA
    this.minWeight = 0.2;
    this.maxWeight = 3.0;
    this.decay = 0.999; // small decay to avoid runaway weights
  }

  predict(history, options = {}) {
    // call the pure function to get prediction
    const result = enhancedTrendAnalysis(history, options);
    // attach model metadata
    return { ...result, modelId: this.id, modelName: this.name, modelWeight: this.weight };
  }

  // learn accepts optional options: { lr: 1.0 }
  learn(wasWin, options = {}) {
    // record outcome and update rolling stats
    const v = wasWin ? 1 : 0;
    this.history.push(v);
    if (this.history.length > this.lookback) this.history.shift();
    if (wasWin) this.wins++; else this.losses++;

    const total = this.wins + this.losses;
    const instantAcc = total > 0 ? (this.wins / total) : 0.5;
    // update EMA accuracy
    this.emaAccuracy = this.emaAccuracy * (1 - this.emaAlpha) + instantAcc * this.emaAlpha;

    // adaptive weight update using logistic-like scaling and decay
    const advantage = this.emaAccuracy - 0.5;
    const delta = advantage * 0.5; // scale sensitivity
    // learning rate multiplier option (used for loss-streaks)
    const lr = typeof options.lr === 'number' ? Math.max(0.1, options.lr) : 1.0;
    // apply small decay and then nudge towards better accuracy scaled by lr
    this.weight = Math.max(this.minWeight, Math.min(this.maxWeight, this.weight * Math.pow(this.decay, lr) + (1 + delta) * lr));

    return { wins: this.wins, losses: this.losses, weight: this.weight, emaAccuracy: this.emaAccuracy };
  }
}

export { KBTModel };
