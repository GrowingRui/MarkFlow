// Conversions per UTC day. Conversion runs in the browser, so the server counts these limits
// and the page enforces them.
export const LIMITS = { anonymous: 3, free: 30 };

// Sign-in and sign-up attempts per client per hour.
export const AUTH_ATTEMPTS_PER_HOUR = 20;
