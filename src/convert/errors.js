// Errors created with fail() are written for users; anything else gets a generic explanation.
export const fail = message => Object.assign(new Error(message), { friendly: true });

// Converters and their libraries load on demand, so a dropped connection surfaces here.
export const loadModule = promise => promise.catch(() => {
  throw fail('A conversion library failed to load. Check your connection and try again.');
});
