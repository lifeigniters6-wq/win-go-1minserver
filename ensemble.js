// ensemble.js
// Utility and engine name mapping used by server

function getEngineName(logicIdentifier) {
  if (typeof logicIdentifier === 'string') {
    if (logicIdentifier.includes('FLONZA_V4_HYBRID')) return 'Advanced AI';
    if (logicIdentifier.includes('DUAL')) {
      if (logicIdentifier.includes('19') || logicIdentifier.includes('28')) return 'Machine Learning';
      if (logicIdentifier.includes('25')) return 'Fibonacci Engine';
      if (logicIdentifier.includes('22')) return 'Loss Recovery';
      return 'Hybrid AI';
    }
  }
  const id = typeof logicIdentifier === 'number' ? logicIdentifier : parseInt(logicIdentifier);
  if ([1, 3, 4, 5, 6, 8, 12].includes(id)) return 'Pattern Bias';
  if ([19, 28].includes(id)) return 'Machine Learning';
  if (id === 25) return 'Fibonacci Engine';
  if (id === 22) return 'Loss Recovery';
  return 'Trend Logic';
}

export { getEngineName };
