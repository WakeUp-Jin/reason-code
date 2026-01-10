import type { Currency } from '../context/store.js';

/**
 * 获取货币符号
 * @param currency 货币类型
 * @returns 货币符号
 */
export function getCurrencySymbol(currency: Currency): string {
  return currency === 'CNY' ? '¥' : '$';
}
