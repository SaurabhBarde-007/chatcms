// WhatsApp identifies people by "wa_id": the phone number's digits including the country
// code, without "+" (e.g. "919812345678"). Everything we store uses that form.

const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164 maximum

/**
 * Turn whatever was typed or imported ("+91 98123-45678", "0091…", "98123 45678") into a wa_id.
 * Numbers written without "+"/"00" and with at most 10 digits are treated as local numbers
 * and get `defaultCountryCode`; longer ones are assumed to already include a country code.
 * Returns null if it can't be a valid number.
 */
export function normalizeWaId(raw: unknown, defaultCountryCode = ""): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const international = text.startsWith("+") || text.startsWith("00");
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("00")) digits = digits.slice(2);

  if (!international && defaultCountryCode) {
    const local = digits.replace(/^0+/, ""); // drop a trunk prefix like the 0 in "098123…"
    if (local.length <= 10) digits = defaultCountryCode.replace(/\D/g, "") + local;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS || digits.startsWith("0")) return null;
  return digits;
}

/** "919812345678" → "+919812345678" */
export function waIdToPhone(waId: string): string {
  return "+" + waId;
}
