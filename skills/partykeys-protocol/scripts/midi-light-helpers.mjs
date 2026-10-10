import assert from 'node:assert/strict';

export function paletteState(frames) {
  const lit = new Set();
  for (const frame of frames) {
    if (frame[7] !== 0x71) continue;
    assert.ok(frame[8] <= 3, 'the relay must never get an oversized light frame');
    assert.equal(frame.length, 10 + frame[8] * 2);
    if (!frame[8]) lit.clear();
    for (let i = 9; i < frame.length - 1; i += 2) {
      if (frame[i + 1]) lit.add(frame[i]); else lit.delete(frame[i]);
    }
  }
  return [...lit].sort((a,b) => a-b);
}

export function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    clock: { set(fn, ms) { const next=++id; timers.set(next,{fn,at:now+ms});return next; }, clear(id) {timers.delete(id);} },
    tick(ms) {
      const end=now+ms;
      let count=0;
      while (true) {
        const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!entry)break;
        assert.ok(count++<2000,'unbounded timer loop');
        timers.delete(entry[0]);now=entry[1].at;entry[1].fn();
      }
      now=end;
    },
    pending: () => timers.size,
  };
}
