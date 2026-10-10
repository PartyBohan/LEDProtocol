import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardRouting, KEYBOARD_QUERY } from '../assets/web-midi/partykeys-routing.mjs';
import { createLightController, DEMO_NOTES } from '../assets/web-midi/partykeys-lights.mjs';
import { fakeClock, paletteState } from './midi-light-helpers.mjs';

const report=(channel,address,command=2,value=1)=>[240,5,48,32,0,channel,address,command,value,247];
const broadcast={channel:127,address:127};
function setup() {
  const time=fakeClock(),frames=[];let changes=0;
  const routes=createKeyboardRouting(f=>{frames.push(f);return true;},()=>changes++,time.clock);
  return {time,frames,routes,changes:()=>changes};
}

test('keyboard discovery handles split/realtime/multiple reports and never treats query echoes or speakers as keyboards',()=>{
  const {time,frames,routes,changes}=setup();routes.query();
  assert.deepEqual(frames,[KEYBOARD_QUERY]);
  routes.receive(report(2,63).slice(0,5),'a');routes.receive([0xf8,...report(2,63).slice(5)],'a');
  routes.receive([...report(2,62),...report(2,64)],'a');
  assert.deepEqual(routes.route(60),{channel:2,address:63});assert.deepEqual(routes.route(90),{channel:2,address:64});
  assert.equal(changes(),3);
  routes.receive(KEYBOARD_QUERY,'a');routes.receive([240,17,48,32,0,1,63,2,1,247],'a');
  routes.receive(report(1,63).slice(5),'b');
  routes.receive([240,...Array(257).fill(1),247],'a');
  for(const bad of [report(16,63),report(1,112),[240,5,49,32,0,1,63,2,1,247],[240,5,48,127,127,1,63,2,1,247]])routes.receive(bad,'a');
  assert.equal(changes(),3);time.tick(3000);assert.equal(changes(),3);routes.dispose();assert.equal(time.pending(),0);
});

test('unassigned main keyboards get distinct available channels, duplicate/sub-keyboard reports do not spam writes',()=>{
  const {routes,frames}=setup();routes.query();routes.receive(report(1,63),'a');
  routes.receive(report(0,62,2,0),'a');assert.equal(frames.length,1);
  routes.receive(report(0,62),'a');routes.receive(report(0,62),'a');routes.receive(report(0,64),'a');
  assert.deepEqual(frames.slice(1),[[240,5,48,0,127,32,0,3,2,247],[240,5,48,0,127,32,0,3,3,247]]);
  assert.deepEqual(routes.route(90),broadcast,'no route until assignment is acknowledged');
  routes.receive(report(3,64),'a');assert.deepEqual(routes.route(90),{channel:3,address:64});routes.dispose();
});

test('topology converges without discarding unanswered routes; channel changes and octave reports invalidate lights',()=>{
  const {time,routes,changes,frames}=setup();routes.query();routes.receive(report(1,63),'a');routes.receive(report(1,64),'a');time.tick(3000);
  routes.query();time.tick(3000);assert.deepEqual(routes.route(90),{channel:1,address:64});
  routes.query();routes.receive(report(2,63),'a');assert.deepEqual(routes.route(60),{channel:2,address:63});
  const before=changes();routes.receive(report(2,63),'a');assert.equal(changes(),before);
  routes.receive(report(2,63,0x18,1),'a');assert.equal(changes(),before+1);assert.deepEqual(routes.route(48),broadcast);
  routes.receive(report(2,63,0x18,4),'a');assert.equal(changes(),before+1);
  time.tick(3000);assert.deepEqual(routes.route(96),broadcast,'missing right keyboard removed on nonempty query');
  routes.receive([240,5,48,32,0,2,63,5,247],'a');routes.receive(report(2,63,4),'a');
  const count=frames.length;time.tick(699);assert.equal(frames.length,count);time.tick(1);assert.equal(frames.length,count+1);
  assert.ok(frames.every(f=>f[7]===1),'live requery must never send idle mode');
  routes.dispose();time.tick(5000);assert.equal(time.pending(),0);
});

test('controller rediscovers routing on reconnect and restores CURRENT target, never the previous demo or paused chord',()=>{
  const time=fakeClock(),frames=[];
  const make=()=>createLightController({send:f=>frames.push(f)},'palette71',()=>{},time.clock);
  const first=make();first.set(DEMO_NOTES);time.tick(200);first.receive(report(1,63),'a');time.tick(40);
  assert.deepEqual(paletteState(frames),DEMO_NOTES);first.dispose();
  const second=make();second.set([62,65,69]);second.receive(report(3,63),'a');time.tick(200);
  assert.deepEqual(paletteState(frames),[62,65,69]);
  assert.ok(frames.some(f=>f[7]===113&&f[3]===3&&f[4]===63));
  second.off();second.receive(report(4,63),'a');time.tick(100);assert.deepEqual(paletteState(frames),[]);
  second.dispose();const count=frames.length;second.receive(report(1,63,5),'a');time.tick(5000);
  assert.equal(frames.length,count);assert.equal(time.pending(),0);
});
