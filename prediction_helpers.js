// prediction_helpers.js
// Advanced helper functions for perfect predictions

function detectStreaks(history) {
  const streaks = {
    current: { type: history[0].resultType, length: 1 },
    historical: []
  };
  
  for (let i = 1; i < history.length; i++) {
    if (history[i].resultType === streaks.current.type) {
      streaks.current.length++;
    } else {
      streaks.historical.push({ ...streaks.current });
      streaks.current = { type: history[i].resultType, length: 1 };
    }
  }
  
  const strength = calculateStreakStrength(streaks);
  return { streaks, strength };
}

function detectAlternations(history) {
  let alternations = 0;
  let perfectCount = 0;
  
  for (let i = 1; i < history.length; i++) {
    if (history[i].resultType !== history[i-1].resultType) {
      alternations++;
      if (i > 1 && history[i].resultType === history[i-2].resultType) {
        perfectCount++;
      }
    }
  }
  
  const strength = perfectCount / (history.length - 2);
  return { alternations, perfectCount, strength };
}

function analyzeDistribution(history) {
  const bigCount = history.filter(r => r.resultType === "BIG").length;
  const smallCount = history.length - bigCount;
  const ratio = bigCount / history.length;
  
  return {
    ratio,
    bias: Math.abs(0.5 - ratio),
    strength: 1 - (2 * Math.abs(0.5 - ratio))
  };
}

function analyzeTimingPatterns(history) {
  const intervals = [];
  for (let i = 1; i < history.length; i++) {
    const t1 = new Date(history[i-1].createTime || Date.now()).getTime();
    const t2 = new Date(history[i].createTime || Date.now()).getTime();
    intervals.push(t2 - t1);
  }
  
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
  const stability = 1 - Math.min(1, Math.sqrt(variance) / avg);
  
  return { stability, strength: stability };
}

function calculatePatternWeights(patterns) {
  return {
    streaks: Math.min(1, patterns.streaks.strength * 1.2),
    alternations: patterns.alternations.strength * 0.8,
    distribution: patterns.distributions.strength * 0.6,
    timing: patterns.timing.strength * 0.4
  };
}

function determineBestPrediction(patterns, weights) {
  let prediction = null;
  let maxStrength = 0;
  
  for (const [pattern, data] of Object.entries(patterns)) {
    const weightedStrength = data.strength * weights[pattern];
    if (weightedStrength > maxStrength) {
      maxStrength = weightedStrength;
      prediction = data.prediction;
    }
  }
  
  return prediction || "BIG";
}

function calculateBaseConfidence(patterns) {
  const strengths = Object.values(patterns).map(p => p.strength);
  const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  return 70 + (avgStrength * 25);
}

function assessMarketCondition(history) {
  const volatility = calculateVolatility(history);
  const manipulation = detectManipulation(history);
  const stability = 1 - Math.max(volatility, manipulation);
  return Math.max(0.7, stability);
}

function calculateVolatility(history) {
  const changes = [];
  for (let i = 1; i < history.length; i++) {
    changes.push(history[i].resultType !== history[i-1].resultType ? 1 : 0);
  }
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

function detectManipulation(history) {
  const intervals = [];
  for (let i = 1; i < history.length; i++) {
    const t1 = new Date(history[i-1].createTime || Date.now()).getTime();
    const t2 = new Date(history[i].createTime || Date.now()).getTime();
    intervals.push(t2 - t1);
  }
  
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const anomalies = intervals.filter(i => Math.abs(i - avg) > avg * 0.5).length;
  return anomalies / intervals.length;
}

function analyzeTrendStrength(history) {
  const windows = [5, 10, 15, 20];
  const trends = windows.map(w => {
    const window = history.slice(0, w);
    const bigCount = window.filter(r => r.resultType === "BIG").length;
    return bigCount / w;
  });
  
  const consistency = trends.reduce((a, b, i, arr) => {
    if (i === 0) return 0;
    return a + Math.abs(b - arr[i-1]);
  }, 0) / (trends.length - 1);
  
  return 1 - consistency;
}

function calculateConsensusStrength(predictions) {
  const total = predictions.length;
  const bigVotes = predictions.filter(p => p.p.prediction === "BIG").length;
  const agreement = Math.max(bigVotes, total - bigVotes) / total;
  return {
    agreement,
    prediction: bigVotes > total/2 ? "BIG" : "SMALL"
  };
}

function analyzePatternOverlap(predictions) {
  const allPatterns = predictions.flatMap(p => p.p.patterns || []);
  const uniquePatterns = new Set(allPatterns);
  const overlap = 1 - (uniquePatterns.size / allPatterns.length);
  return {
    score: overlap,
    patterns: Array.from(uniquePatterns)
  };
}

function calculateEnhancedConfidence(params) {
  const { predictions, consensusStrength, patternOverlap, modelReliability } = params;
  
  const baseConfidence = predictions.reduce((acc, p) => {
    return acc + (p.p.confidence * modelReliability[p.model.id]);
  }, 0) / predictions.length;
  
  const enhancementFactor = Math.min(1.3, 1 + (consensusStrength.agreement * 0.2) + (patternOverlap.score * 0.1));
  return Math.min(92, Math.round(baseConfidence * enhancementFactor));
}

function assessModelReliability(predictions) {
  const reliability = {};
  for (const p of predictions) {
    reliability[p.model.id] = Math.min(1, (p.model.weight || 0.5) * (p.model.emaAccuracy || 0.5) * 2);
  }
  return reliability;
}

// ----- Additional helper utilities used by AI models -----
function calculateStreakStrength(streaks) {
  if (!streaks || !streaks.current) return 0;
  const currentLen = streaks.current.length || 0;
  const historicalMax = streaks.historical && streaks.historical.length ? Math.max(...streaks.historical.map(s => s.length)) : 0;
  const maxLen = Math.max(currentLen, historicalMax);
  return Math.min(1, maxLen / 10);
}

function analyzeWindow(history) {
  const windowSize = Math.min(history.length, 15);
  if (windowSize === 0) return { prediction: 'BIG', confidence: 0.5, bias: 0.5 };
  const window = history.slice(0, windowSize);
  const bigCount = window.filter(r => r.resultType === 'BIG').length;
  const ratio = bigCount / windowSize;
  return { prediction: ratio > 0.5 ? 'BIG' : 'SMALL', confidence: Math.abs(ratio - 0.5), bias: ratio };
}

function detectPatternStrength(history) {
  const streaks = detectStreaks(history);
  const alternations = detectAlternations(history);
  return { strength: Math.max(streaks.strength || 0, alternations.strength || 0), pattern: (streaks.strength || 0) > (alternations.strength || 0) ? 'streak' : 'alternation' };
}

function assessMarketStability(history) {
  const volatility = calculateVolatility(history) || 0;
  const manipulation = detectManipulation(history) || 0;
  const stabilityFactor = 1 - Math.max(volatility, manipulation);
  return { stabilityFactor: Math.max(0, Math.min(1, stabilityFactor)), isStable: stabilityFactor > 0.5 };
}

function calculateMomentum(history) {
  const recent = history.slice(0, 10);
  const older = history.slice(10, 20);
  const recentRatio = recent.length ? recent.filter(r => r.resultType === 'BIG').length / recent.length : 0.5;
  const olderRatio = older.length ? older.filter(r => r.resultType === 'BIG').length / older.length : 0.5;
  return { momentum: recentRatio - olderRatio, direction: (recentRatio - olderRatio) > 0 ? 'BIG' : 'SMALL' };
}

function detectCyclicalPatterns(history) {
  if (!history || history.length === 0) return { isCyclical: false, cycleLength: 0, strength: 0 };
  const sequences = [];
  let currentSeq = [history[0].resultType];
  for (let i = 1; i < history.length; i++) {
    if (history[i].resultType === history[i-1].resultType) currentSeq.push(history[i].resultType);
    else { sequences.push(currentSeq); currentSeq = [history[i].resultType]; }
  }
  sequences.push(currentSeq);
  const avgLength = sequences.reduce((s, seq) => s + seq.length, 0) / sequences.length;
  const isCyclical = Math.abs(avgLength - Math.round(avgLength)) < 0.5;
  return { isCyclical, cycleLength: Math.round(avgLength), strength: isCyclical ? 0.8 : 0.2 };
}

function combineSignals(signals) {
  const weights = { short: 0.3, long: 0.2, pattern: 0.2, trend: 0.1, market: 0.2 };
  let bigScore = 0, smallScore = 0, totalWeight = 0;
  for (const [type, signal] of Object.entries(signals)) {
    const weight = weights[type] || 0.1;
    const conf = (typeof signal.confidence === 'number') ? signal.confidence : (signal.strength || 0.5);
    if (signal.prediction === 'BIG') bigScore += weight * conf;
    else smallScore += weight * conf;
    totalWeight += weight;
  }
  const normalizedBig = bigScore / totalWeight;
  const normalizedSmall = smallScore / totalWeight;
  return {
    finalPrediction: normalizedBig > normalizedSmall ? 'BIG' : 'SMALL',
    strength: Math.abs(normalizedBig - normalizedSmall),
    activePatterns: {}
  };
}

export {
  detectStreaks,
  detectAlternations,
  analyzeDistribution,
  analyzeTimingPatterns,
  calculatePatternWeights,
  determineBestPrediction,
  calculateBaseConfidence,
  assessMarketCondition,
  calculateVolatility,
  detectManipulation,
  analyzeTrendStrength,
  calculateConsensusStrength,
  analyzePatternOverlap,
  calculateEnhancedConfidence,
  assessModelReliability,
  calculateStreakStrength,
  analyzeWindow,
  detectPatternStrength,
  assessMarketStability,
  calculateMomentum,
  detectCyclicalPatterns,
  combineSignals
};