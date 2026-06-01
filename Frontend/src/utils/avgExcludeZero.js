/**
 * Average numeric samples excluding exact zero (matches backend historian ``avg``).
 * @param {Array<unknown>} values
 * @returns {number|null}
 */
export function averageExcludingZero(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const nums = values
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n) && n !== 0);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
