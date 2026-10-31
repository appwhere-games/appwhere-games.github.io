import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseDay,recentRelease,mergeApps} from '../scripts/normalize.mjs';
test('release days retain the original store calendar date', () => {
  assert.equal(releaseDay('2026-10-30T23:30:00-07:00'),'2026-10-30');
  assert.equal(releaseDay('Oct 29, 2026'),'2026-10-29');
  assert.equal(releaseDay('2026-02-30'),null);
  assert.equal(releaseDay(undefined),null);
});
test('unknown, old and future dates cannot masquerade as new releases', () => {
  const now=new Date('2026-10-31T17:00:00Z');
  assert.equal(recentRelease('Oct 30, 2026',now),'2026-10-30');
  for(const day of [undefined,'nonsense','Jan 1, 2020','Nov 1, 2026']) assert.equal(recentRelease(day,now),null);
});
test('duplicate country discoveries merge without changing the first discovery', () => {
  const base={id:'ios:1',name:'A',releaseDate:'2026-10-30',countries:['us'],firstSeenAt:'first'};
  const result=mergeApps([base],[{...base,countries:['tr'],firstSeenAt:'second'}]);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].countries,['tr','us']);
  assert.equal(result[0].firstSeenAt,'first');
});
test('hourly collection follows the same Istanbul calendar day as TODAY at midnight',()=>{
  const now=new Date('2026-10-31T21:01:00Z');
  assert.equal(recentRelease('Nov 1, 2026',now),'2026-11-01');
  assert.equal(recentRelease('Nov 2, 2026',now),null);
});
