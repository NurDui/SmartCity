import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173';
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  return { response, result };
}
const health = await request('/api/health');
assert.equal(health.response.status, 200, 'Health endpoint');
const { response, result: catalogue } = await request('/api/places');
assert.equal(response.status, 200, 'POI catalogue');
assert.ok(catalogue.places.length >= 8, 'Sourced POI dataset is available');
assert.equal(new Set(catalogue.places.map(p => p.id)).size, catalogue.places.length, 'Unique POI identifiers');
for (const poi of catalogue.places) {
  assert.ok(Number.isFinite(poi.lat) && Number.isFinite(poi.lon));
  assert.match(poi.sourceUrl, /^https:\/\//, 'POI source attribution');
}
const scenario = {
  query: 'Хочу посмотреть город рядом с EXPO',
  location: { lat: 51.089, lon: 71.416, label: 'EXPO' },
  durationMinutes: 120, mood: 'any', weatherMode: 'summer', indoorOnly: false,
};
for (const [name, changes] of [
  ['summer at EXPO', {}],
  ['severe winter', { weatherMode: 'winter' }],
  ['indoor preference', { indoorOnly: true }],
  ['culture at Baiterek', { location: { lat: 51.1283, lon: 71.4306, label: 'Байтерек' }, mood: 'culture' }],
]) {
  const input = { ...scenario, ...changes };
  const { response, result } = await request('/api/recommend', input);
  assert.equal(response.status, 200, name);
  assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 3, name);
  assert.ok(['template', 'llm'].includes(result.mode));
  assert.equal(result.weather.isDemo, true);
  for (const item of result.recommendations) {
    assert.ok(catalogue.places.some(p => p.id === item.poi.id), 'Recommendation must exist in the dataset');
    assert.ok(item.why.length > 10 && item.actions.length > 0 && item.sourceLabel);
    assert.ok(item.walkMinutes + item.visitMinutes <= input.durationMinutes, 'Visit fits available time');
    if (input.indoorOnly || input.weatherMode === 'winter') assert.equal(item.poi.indoor, true, name);
  }
  console.log(`PASS ${name}: ${result.recommendations.length} sourced suggestions (${result.mode})`);
}
for (const invalid of [
  { ...scenario, location: { lat: 999, lon: 71 } },
  { ...scenario, durationMinutes: -1 },
  { ...scenario, query: 'x'.repeat(5001) },
]) {
  const { response } = await request('/api/recommend', invalid);
  assert.ok(response.status >= 400 && response.status < 500, 'Invalid input rejected');
}
console.log(`PASS health, catalogue (${catalogue.places.length} places), input validation`);
