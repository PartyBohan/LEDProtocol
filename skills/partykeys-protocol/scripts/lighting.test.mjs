import test from 'node:test';
import assert from 'node:assert/strict';
import { createLightController, DEMO_NOTES, deviceKind, supportsPartyKeysBus, lightingInputIds, midiOutputChoices, lightInit, lightOff, lightTargetFrames, checkedFrame } from '../assets/web-midi/partykeys-lights.mjs';
import { createPartyKeysLighting, connectedPorts, lightingSysexAvailable } from '../assets/web-midi/connect-lighting.mjs';
import { fakeClock, paletteState } from './midi-light-helpers.mjs';

test('successful SysEx requests support injected bridges with omitted flags, but denial or normal-MIDI fallback never grants lighting', () => {
  assert.equal(lightingSysexAvailable({ sysexEnabled: true }, true), true);
  assert.equal(lightingSysexAvailable({}, true), true);
  assert.equal(lightingSysexAvailable({ sysexEnabled: false }, true), false);
  assert.equal(lightingSysexAvailable({ sysexEnabled: true }, false), false);
  assert.equal(lightingSysexAvailable({}), false);
  assert.equal(lightingSysexAvailable(null, true), false);
  const f = fixture();
  const lights = createPartyKeysLighting({ ...f.config, sysexEnabled: lightingSysexAvailable({}, true) });
  lights.set(DEMO_NOTES); f.time.tick(200);
  assert.deepEqual(paletteState(f.frames), DEMO_NOTES);
  lights.dispose();
});

test('all supported notes, major/minor triads and doubled-root demo encode to exactly the requested MIDI notes', () => {
  for (let root = 48; root <= 76; root++) for (const third of [3, 4]) {
    const target = [root, root + third, root + 7];
    const frames = lightTargetFrames('palette71', target);
    frames.forEach(checkedFrame);
    assert.deepEqual(paletteState(frames), target);
  }
  const all = Array.from({ length: 36 }, (_, i) => i + 48);
  const frames = lightTargetFrames('palette71', all);
  assert.equal(frames.length, 12);
  assert.ok(frames.every(f => f.length <= 16));
  assert.deepEqual(paletteState(frames), all);
  assert.deepEqual(paletteState(lightTargetFrames('palette71', [72, 60, 64, 67, 60])), DEMO_NOTES);
});

test('invalid notes fail visibly rather than silently wrapping, dropping or transposing them', () => {
  for (const note of [47, 84, NaN, Infinity, 60.5, '60', null]) {
    assert.throws(() => lightTargetFrames('palette71', [60, note]));
  }
  const time = fakeClock(), frames = [], errors = [];
  const light = createLightController({ send: f => frames.push(f) }, 'palette71', (s, d) => errors.push([s, d]), time.clock);
  light.set([84]); time.tick(200);
  assert.equal(errors[0][0], 'error');
  assert.deepEqual(paletteState(frames), []);
  light.dispose();
});

function fixture(name = 'SAM5704') {
  const time = fakeClock(), frames = [], states = [];
  const input = { id: 'in', name, state: 'connected', onmidimessage() {} };
  const output = { id: 'out', name, state: 'connected', send(frame) { frames.push(frame); }, close() { throw Error('shared port must not close'); } };
  const config = { inputs: [input], outputs: [output], sysexEnabled: true, clock: time.clock, onStatus: (s, d) => states.push([s, d]) };
  return { time, frames, states, input, output, config };
}

test('port adapters support Web MIDI Map, arrays and forEach-only bridge maps, filtering disconnected ports', () => {
  const connected = { name: 'SAM5704' }, disconnected = { name: 'SAM5704', state: 'disconnected' };
  assert.deepEqual(connectedPorts(new Map([['a', connected], ['b', disconnected]])), [connected]);
  assert.deepEqual(connectedPorts({ forEach(fn) { fn(disconnected); fn(connected); } }), [connected]);
  assert.deepEqual(connectedPorts([disconnected, connected]), [connected]);
  assert.deepEqual(connectedPorts(undefined), []);
});

test('safe entry refuses missing or denied SysEx before any output write', () => {
  for (const sysexEnabled of [undefined, false, null]) {
    const f = fixture();
    assert.throws(() => createPartyKeysLighting({ ...f.config, sysexEnabled }), /SysEx/);
    assert.equal(f.frames.length, 0);
  }
});

test('safe entry never lights unknown, disconnected or PopuPiano outputs with the relay profile', () => {
  for (const name of ['USB MIDI', 'Bluetooth Speaker', 'PopuPiano']) {
    const f = fixture(name);
    assert.throws(() => createPartyKeysLighting(f.config), /Select/);
    assert.equal(f.frames.length, 0);
  }
  const f = fixture(); f.output.state = 'disconnected';
  assert.throws(() => createPartyKeysLighting(f.config), /Select/);
  assert.equal(f.frames.length, 0);
});

test('safe entry requires selection with multiple supported outputs and never falls back from a stale ID', () => {
  const f = fixture();
  const other = { id: 'other', name: 'PartyKeys B', send() { throw Error('wrong device'); } };
  f.config.outputs.push(other);
  assert.throws(() => createPartyKeysLighting(f.config), /Select/);
  assert.throws(() => createPartyKeysLighting({ ...f.config, outputId: 'gone' }), /Select/);
  assert.equal(f.frames.length, 0);
  const lights = createPartyKeysLighting({ ...f.config, outputId: 'out' });
  lights.set(DEMO_NOTES); f.time.tick(200);
  assert.deepEqual(paletteState(f.frames), DEMO_NOTES);
  assert.deepEqual(f.frames[0], [240,127,48,127,127,32,0,15,5,247]);
  lights.dispose();
});

test('missing, disconnected and ambiguous input pairing block output without stealing ordinary MIDI handlers', () => {
  for (const inputs of [[], [{ name: 'USB MIDI' }], [{ name: 'SAM5704' }, { name: 'SAM5704' }], [{ name: 'SAM5704', state: 'disconnected' }]]) {
    const f = fixture(), handler = f.input.onmidimessage;
    assert.throws(() => createPartyKeysLighting({ ...f.config, inputs }), /pairing/);
    assert.equal(f.frames.length, 0);
    assert.equal(f.input.onmidimessage, handler);
  }
});

test('fallback IDs remain consistent with the connected list, including unknown ports', () => {
  const f = fixture(); delete f.input.id; delete f.output.id;
  f.config.inputs.unshift({ name: 'USB MIDI' });
  f.config.outputs.unshift({ name: 'USB MIDI', send() { throw Error('wrong device'); } });
  const lights = createPartyKeysLighting({ ...f.config, outputId: 'output-1' });
  assert.deepEqual(lights.inputIds, ['input-1']);
  lights.set(DEMO_NOTES); f.time.tick(200);
  assert.deepEqual(paletteState(f.frames), DEMO_NOTES);
  lights.dispose();
});

test('safe entry forwards only paired routing reports and never mutates incoming note data or handlers', () => {
  const f = fixture(), handler = f.input.onmidimessage;
  const lights = createPartyKeysLighting(f.config);
  lights.set([60, 64, 67]); f.time.tick(200);
  const report = [240,5,48,32,0,3,63,2,1,247];
  const count = f.frames.length;
  lights.receive(report, 'other'); f.time.tick(40);
  assert.equal(f.frames.length, count);
  lights.receive(report, 'in'); f.time.tick(40);
  assert.ok(f.frames.some(frame => frame[7] === 0x71 && frame[3] === 3 && frame[4] === 63));
  const raw = Object.freeze([0x91,60,99,64,88,0xb1,64,127]);
  lights.receive(raw, 'in');
  assert.deepEqual(raw, [0x91,60,99,64,88,0xb1,64,127]);
  assert.equal(f.input.onmidimessage, handler);
  assert.ok(f.frames.every(frame => frame[0] === 0xf0), 'never send Note On lighting');
  lights.dispose();
});

test('safe entry cleanup is idempotent, cancels timers and never closes a host-owned MIDI port', () => {
  const f = fixture(), lights = createPartyKeysLighting(f.config);
  lights.set(DEMO_NOTES); f.time.tick(136); lights.off(); f.time.tick(16);
  assert.deepEqual(paletteState(f.frames), []);
  lights.dispose(); const count = f.frames.length;
  lights.dispose(); lights.off(); lights.set([62,65,69]); lights.receive([240,5,48,32,0,1,63,5,247], 'in'); f.time.tick(5000);
  assert.equal(f.frames.length, count);
  assert.equal(f.time.pending(), 0);
});

test('asynchronous open failures are reported and never generate lighting writes', async () => {
  const f = fixture(); f.output.open = () => Promise.reject(Error('permission revoked'));
  const lights = createPartyKeysLighting(f.config);
  lights.set(DEMO_NOTES);
  await Promise.resolve(); await Promise.resolve(); f.time.tick(5000);
  assert.equal(f.states.at(-1)[0], 'error');
  assert.equal(f.frames.length, 0);
  lights.dispose();
});

test('protocol modes and indices are isolated; out-of-range input never silently drops target notes',()=>{
  assert.equal(lightInit('palette71')[0][8],5);
  assert.deepEqual(lightInit('palette71')[0],[240,127,48,127,127,32,0,15,5,247]);
  assert.equal(lightInit('rgb15')[0][8],1);
  assert.equal(lightOff('rgb15')[7],0x15);
  assert.equal(lightTargetFrames('popupiano',[60])[0][1],3);
  assert.equal(lightTargetFrames('index14',[60])[0][7],0x14);
  assert.throws(()=>lightTargetFrames('popupiano',[77]));
  assert.throws(()=>lightTargetFrames('rgb15',[84]));
  assert.throws(()=>checkedFrame([240,128,247]));
  assert.throws(()=>checkedFrame([240,...Array(255).fill(0),247]));
});
test('device recognition tolerates platform naming but never selects unrelated outputs',()=>{
  assert.equal(deviceKind({name:'Party Keys BLE'}),'partykeys');
  assert.equal(deviceKind({name:'PopuPiano MIDI'}),'popupiano');
  assert.equal(deviceKind({name:'MIDI',manufacturer:'PartyKeys'}),'partykeys');
  assert.equal(deviceKind({name:'Bluetooth MIDI'}),null);
});
test('PartyStudio relay is explicit and does not broaden lighting to generic audio or MIDI devices',()=>{
  for(const name of ['PartyStudio','PartyStudio One','Party Studio USB MIDI','PartyStudio-1','弹唱音响PartyStudio','SAM5704','SAM5704 USB MIDI']) {
    const port={name,manufacturer:'PartyKeys'};
    assert.equal(deviceKind(port),'partystudio');assert.equal(supportsPartyKeysBus(port),true);
  }
  for(const name of ['USB MIDI','Bluetooth Speaker','Studio One','音箱','PopuPiano']) assert.equal(supportsPartyKeysBus({name}),false);
});
test('output IDs stay stable before recognition filtering and unknown ports remain visible but unsupported',()=>{
  const ports=[{name:'USB MIDI',send(){}},{name:'PartyStudio One',send(){}},{name:'No output'}];
  const choices=midiOutputChoices(ports);
  assert.deepEqual(choices.map(c=>[c.id,c.kind]),[['output-0',null],['output-1','partystudio']]);
  assert.equal(choices.find(c=>c.id==='output-1').port,ports[1]);
});
test('light initialization coalesces targets, never restores stale paused notes, cancels on dispose and reports errors',()=>{
  const frames=[],states=[],{clock,tick,pending}=fakeClock();
  const light=createLightController({send:f=>frames.push(f)},'palette71',s=>states.push(s),clock);
  light.set(DEMO_NOTES); light.set([62,65,69]);
  assert.equal(frames.length,1);
  tick(160);
  assert.deepEqual(paletteState(frames),[62,65,69]);
  const count=frames.length;light.set([62,65,69]);assert.equal(frames.length,count);
  light.off();tick(16);assert.deepEqual(paletteState(frames),[]);light.dispose();
  const stopped=frames.length;
  light.set(DEMO_NOTES);tick(5000);assert.deepEqual(paletteState(frames),[]);assert.equal(frames.length,stopped);assert.equal(pending(),0);
  const bad=createLightController({send(){throw Error('gone');}},'rgb15',s=>states.push(s),clock);
  assert.equal(states.at(-1),'error');bad.dispose();
});

test('short palette deltas turn old notes off, preserve shared notes and route by keyboard address',()=>{
  const old=[60,64,67], next=[62,65,69,72,76];
  const frames=lightTargetFrames('palette71',next,old);
  assert.equal(frames.length,3);
  assert.deepEqual(paletteState([...lightTargetFrames('palette71',old),...frames]),next);
  assert.deepEqual(lightTargetFrames('palette71',old,old),[]);
  assert.deepEqual(lightTargetFrames('palette71',[60,64,67],[],()=>({channel:2,address:63})),[[240,5,48,2,63,32,0,113,3,60,8,64,8,67,8,247]]);
});

test('partial target writes coalesce to newest chord, are paced and pause cancels remaining keys',()=>{
  const time=fakeClock(),frames=[],at=[],states=[];
  const light=createLightController({send:f=>{frames.push(f);at.push(time.now());}},'palette71',s=>states.push(s),time.clock);
  light.set(DEMO_NOTES);time.tick(136); // First 3 notes sent; C5 is still pending.
  assert.deepEqual(paletteState(frames),[60,64,67]);
  light.set([62,65,69,72,76]);time.tick(8); // Old notes turned off.
  light.set([60,65,69]);time.tick(40);
  assert.deepEqual(paletteState(frames),[60,65,69]);
  assert.ok(frames.every(f=>!f.includes(76)),'superseded target never leaked its pending high note');
  assert.ok(at.slice(1).every((t,i)=>t-at[i]>=8));
  light.set([62,66,69,73,76]);light.off();time.tick(100);
  assert.deepEqual(paletteState(frames),[]);
  light.dispose();assert.equal(time.pending(),0);assert.equal(states.at(-1),'sent');
});

test('send failure never marks partial chord complete and late open cannot relight a disposed page',async()=>{
  const time=fakeClock(),frames=[],states=[];let fail=false,open;
  const light=createLightController({send:f=>{if(fail)throw Error('relay unavailable');frames.push(f);}},'palette71',s=>states.push(s),time.clock);
  light.set(DEMO_NOTES);time.tick(136);fail=true;time.tick(8);
  assert.equal(states.at(-1),'error');assert.ok(!states.includes('sent'));
  light.set([62,65,69]);time.tick(5000);assert.equal(states.at(-1),'error');light.dispose();
  const late=createLightController({open:()=>new Promise(r=>{open=r;}),send:f=>frames.push(f)},'palette71',()=>{},time.clock);
  late.set(DEMO_NOTES);late.dispose();const count=frames.length;open();await Promise.resolve();time.tick(5000);
  assert.equal(frames.length,count);assert.equal(time.pending(),0);
});

test('routing reports only come from an unambiguously paired input; unknown devices stay excluded',()=>{
  const out={name:'SAM5704'};
  assert.deepEqual(lightingInputIds(out,[{id:'in',name:'SAM5704'}],[out]),['in']);
  assert.deepEqual(lightingInputIds(out,[{id:'in',name:'USB MIDI'}],[out]),[]);
  assert.deepEqual(lightingInputIds(out,[{name:'SAM5704'},{name:'SAM5704'}],[out]),[]);
  assert.deepEqual(lightingInputIds({name:'PartyKeys A'},[{id:'a',name:'PartyKeys A'},{id:'b',name:'PartyKeys B'}],[{name:'PartyKeys A'},{name:'PartyKeys B'}]),['a']);
});
