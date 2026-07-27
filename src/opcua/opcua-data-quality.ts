export type OpcUaDataQuality = 'good' | 'uncertain' | 'bad';

export function opcUaDataQuality(statusCode: any): OpcUaDataQuality {
  if (!statusCode) return 'uncertain';
  if (typeof statusCode.isGood === 'function' && statusCode.isGood()) {
    return 'good';
  }
  if (
    typeof statusCode.isUncertain === 'function' &&
    statusCode.isUncertain()
  ) {
    return 'uncertain';
  }

  const numericValue = Number(statusCode.value);
  if (Number.isFinite(numericValue)) {
    const severity = (numericValue >>> 30) & 0b11;
    if (severity === 0) return 'good';
    if (severity === 1) return 'uncertain';
  }
  return 'bad';
}
