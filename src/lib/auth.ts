export const AUTH_COOKIE_NAME = "foci_auth";
export const AUTH_COOKIE_VALUE = "ok";
export const AUTH_PASSWORD_ENV = "APP_PASSWORD";

export function getConfiguredPassword() {
  return process.env[AUTH_PASSWORD_ENV] || "";
}

export function isPasswordValid(input: string) {
  const configured = getConfiguredPassword();
  if (!configured) return false;
  return input === configured;
}
