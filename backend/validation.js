export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number(value.slice(0,4))>0 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function uuid(value) {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value))
    throw new HttpError(400, 'A valid record ID is required.');
  return value;
}
export function objectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Request body must be a JSON object.');
  return value;
}
export function agentInput(command, body) {
  objectBody(body);
  if (body.date !== undefined && !isDate(body.date)) throw new HttpError(400, 'date must be a valid calendar date (YYYY-MM-DD).');
  for (const key of ['periodStart', 'periodEnd']) if (body[key] !== undefined && !isDate(body[key]))
    throw new HttpError(400, `${key} must be a valid calendar date (YYYY-MM-DD).`);
  if (body.periodStart && body.periodEnd && body.periodStart > body.periodEnd) throw new HttpError(400, 'The start date must be before the end date.');
  if(command==='weekly') {
    const start=body.periodStart??new Date(Date.now()-6*86400000).toISOString().slice(0,10);
    const end=body.periodEnd??new Date().toISOString().slice(0,10);
    if(start>end || Date.parse(end)-Date.parse(start)>30*86400000)throw new HttpError(400,'Provide a report period of 1 to 31 days, start first.');
  }
  if (['checkin', 'chat'].includes(command)) {
    if (!Array.isArray(body.messages) || body.messages.length > 100 || body.messages.some(m => !m || !['astronaut', 'agent'].includes(m.from) || typeof m.text !== 'string' || m.text.length > 8000))
      throw new HttpError(400, 'Provide at most 100 conversation messages, each up to 8,000 characters.');
  }
  if (body.conversationId) uuid(body.conversationId);
  return body;
}

// Bounded memory, per-source throttling. Trust only the direct socket, not arbitrary forwarding headers.
export class RateLimiter {
  constructor(limit = 30, windowMs = 60_000) { this.limit = limit; this.windowMs = windowMs; this.entries = new Map(); }
  check(key, now = Date.now()) {
    for (const [k, entry] of this.entries) if (entry.until <= now) this.entries.delete(k);
    const entry = this.entries.get(key) || { count: 0, until: now + this.windowMs };
    if (entry.count >= this.limit || (!this.entries.has(key) && this.entries.size >= 10000)) throw new HttpError(429, 'Too many requests. Wait a minute and try again.');
    entry.count++; this.entries.set(key, entry);
  }
}
