/**
 * Matches a business-scoped user ID (BSUID): a two-letter country code, a
 * period, then up to 128 alphanumeric characters. The parent variant inserts
 * ENT after the country code (US.ENT.1181...).
 *
 * BSUIDs must be sent whole: stripping the prefix or normalising the case
 * makes the request fail, so this pattern is for validation only.
 *
 * @category Utils
 */
export const BSUID_PATTERN = /^[A-Za-z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;

/**
 * Returns true when the value has the shape of a business-scoped user ID,
 * including the parent ENT variant.
 *
 * The send builders deliberately do not enforce this, so that future format
 * changes on Meta's side don't turn valid sends into client-side errors. Use
 * it at your own boundaries, for example to stop a caller from writing a
 * BSUID into a phone number column or the other way around.
 *
 * @category Utils
 */
export function isBusinessScopedUserId(value: string): boolean {
  return BSUID_PATTERN.test(value);
}
