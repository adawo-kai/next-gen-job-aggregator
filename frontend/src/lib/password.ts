/* Client-side password rules: the same for registration, reset and change (the backend enforces them too). */

export const MIN_PASSWORD = 8;

/** The most common leaked passwords: rejected outright even when long enough. */
const COMMON = new Set([
  "123456",
  "password",
  "123456789",
  "12345678",
  "12345",
  "qwerty",
  "qwerty123",
  "1234567",
  "111111",
  "1234567890",
  "123123",
  "abc123",
  "1234",
  "password1",
  "iloveyou",
  "1q2w3e4r",
  "000000",
  "qwertyuiop",
  "123321",
  "654321",
  "11111111",
  "00000000",
  "87654321",
  "password123",
  "qwerty12",
  "йцукен",
  "йцукенгш",
]);

export function isCommonPassword(pw: string) {
  const p = pw.trim().toLowerCase();
  if (COMMON.has(p)) return true;
  // one repeated character ("aaaaaaaa") or a plain run of digits ("12345678", "98765432")
  if (/^(.)\1+$/.test(p)) return true;
  if (/^\d+$/.test(p) && ("01234567890".includes(p) || "09876543210".includes(p))) return true;
  return false;
}

/** null when the password is acceptable, otherwise the message to show. */
export function passwordError(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Пароль должен быть не короче ${MIN_PASSWORD} символов`;
  if (isCommonPassword(pw)) return "Этот пароль слишком распространён — его легко подобрать. Придумайте другой";
  return null;
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/** A simple hint, not a guarantee: length plus character variety. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  if (pw.length < MIN_PASSWORD) return { score: 1, label: `Слишком короткий — нужно от ${MIN_PASSWORD} символов` };
  if (isCommonPassword(pw)) return { score: 1, label: "Слишком простой — такой пароль легко подобрать" };
  const kinds = [/[a-zа-яё]/, /[A-ZА-ЯЁ]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(pw)).length;
  const points = kinds + (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 ? 1 : 0);
  if (points >= 4) return { score: 4, label: "Надёжный пароль" };
  if (points >= 3) return { score: 3, label: "Хороший пароль" };
  return { score: 2, label: "Средний — добавьте цифры, заглавные буквы или символы" };
}
