// Extracted from FruitChord dea4ad71; see references/verified-web-midi.md.
// MIDI notes are the single source of truth. Wire encoders alone convert to key indices.
import { createKeyboardRouting, } from "./partykeys-routing.mjs";
export const DEMO_NOTES = [60, 64, 67, 72]; // Middle C: do mi sol do.
const HEADER = [0xf0, 0x05, 0x30, 0x7f, 0x7f, 0x20, 0x00];
const range = (count) => Array.from({ length: count }, (_, i) => i);
export function deviceKind(port) {
    const name = `${port.name ?? ""} ${port.manufacturer ?? ""}`.replace(/[\s_-]/g, "");
    if (/popupiano/i.test(name))
        return "popupiano";
    // PartyStudio's APP USB port is the host-facing MIDI relay, not a keyboard.
    // Keep it explicit; a generic Bluetooth/audio output is never a light route.
    // SAM5704 is the USB endpoint alias in the working PopuMusic device profile.
    if (/partystudio|sam5704/i.test(name))
        return "partystudio";
    if (/partykey/i.test(name))
        return "partykeys";
    return null;
}
export function supportsPartyKeysBus(port) {
    const kind = deviceKind(port);
    return kind === "partykeys" || kind === "partystudio";
}
export function midiOutputChoices(ports) {
    // Assign fallback IDs before filtering, so the UI and sender select the same port.
    return ports.map((port, i) => ({ id: port.id ?? `output-${i}`, port, kind: deviceKind(port) }))
        .filter(choice => typeof choice.port.send === "function");
}
export function lightingInputIds(output, inputs, outputs) {
    if (!output || !supportsPartyKeysBus(output))
        return [];
    const kind = deviceKind(output), candidates = inputs.map((port, i) => ({ port, id: port.id ?? `input-${i}` })).filter(({ port }) => deviceKind(port) === kind);
    const named = candidates.filter(({ port }) => port.name && port.name === output.name);
    if (named.length === 1 && outputs.filter(port => deviceKind(port) === kind && port.name === output.name).length === 1)
        return [named[0].id];
    // Never attach an ambiguous second instrument's reports to the selected bus.
    return candidates.length === 1 && outputs.filter(port => deviceKind(port) === kind).length === 1 ? [candidates[0].id] : [];
}
export function checkedFrame(frame) {
    if (frame.length > 256 || frame[0] !== 0xf0 || frame.at(-1) !== 0xf7 || frame.slice(1, -1).some(v => !Number.isInteger(v) || v < 0 || v > 127))
        throw new Error("Invalid lighting frame");
    return frame;
}
export function lightInit(protocol) {
    if (protocol === "popupiano")
        return [[0xf0, 3, 0x1e, 1, 1, 18, 112, 86, 0xf7]];
    // 0x71 and performance mode 05 are a pair. Mode uses the all-device 7F head;
    // key-color frames keep 05, as in the working internal keyboard implementation.
    if (protocol === "palette71")
        return [[0xf0, 0x7f, ...HEADER.slice(2), 0x0f, 5, 0xf7]];
    return [[...HEADER, 0x0f, 1, 0xf7]];
}
export function lightOff(protocol) {
    if (protocol === "popupiano")
        return [0xf0, 3, 0x20, 29, ...range(29).flatMap(i => [i, 0]), 0xf7];
    if (protocol === "rgb15")
        return [...HEADER, 0x15, 1, 0, 0, 0, 0, 0, 0, 36, ...range(36), 0xf7];
    return [...HEADER, protocol === "index14" ? 0x14 : 0x71, 0, 0xf7];
}
function cleanTarget(protocol, notes) {
    const max = protocol === "popupiano" ? 76 : 83;
    const clean = [...new Set(notes)].sort((a, b) => a - b);
    if (clean.some(n => !Number.isInteger(n) || n < 48 || n > max))
        throw new Error("Target outside device range");
    return clean;
}
export function lightTargetFrames(protocol, notes, previous = [], route = () => ({ address: 0x7f, channel: 0x7f })) {
    const clean = cleanTarget(protocol, notes);
    if (!clean.length)
        return [lightOff(protocol)];
    if (protocol === "palette71") {
        const pairs = [...cleanTarget(protocol, previous).filter(n => !clean.includes(n)).map(n => [n, 0]), ...clean.filter(n => !previous.includes(n)).map(n => [n, 8])];
        const groups = new Map();
        for (const pair of pairs) {
            const target = route(pair[0]), key = `${target.channel}:${target.address}`;
            const group = groups.get(key) ?? { ...target, pairs: [] };
            group.pairs.push(pair);
            groups.set(key, group);
        }
        // Three pairs = 16-byte SysEx, still fits the speaker's BLE hop with framing.
        return [...groups.values()].sort((a, b) => a.address - b.address || a.channel - b.channel).flatMap(group => {
            const frames = [];
            for (let i = 0; i < group.pairs.length; i += 3) {
                const chunk = group.pairs.slice(i, i + 3);
                frames.push(checkedFrame([0xf0, 5, 0x30, group.channel, group.address, 0x20, 0, 0x71, chunk.length, ...chunk.flat(), 0xf7]));
            }
            return frames;
        });
    }
    // Legacy/direct-device encoders retain their existing protocol-specific layout.
    if (protocol === "popupiano")
        return [checkedFrame([0xf0, 3, 0x20, 29, ...range(29).flatMap(i => [i, clean.includes(i + 48) ? 1 : 0]), 0xf7])];
    if (protocol === "index14")
        return [checkedFrame([...HEADER, 0x14, 36, ...range(36).flatMap(i => [i, clean.includes(i + 48) ? 8 : 0]), 0xf7])];
    const off = range(36).filter(i => !clean.includes(i + 48));
    const on = clean.map(n => n - 48);
    const group = (keys, color) => [...color.flatMap(v => [v >> 7, v & 127]), keys.length, ...keys];
    return [checkedFrame([...HEADER, 0x15, off.length ? 2 : 1, ...group(on, [36, 224, 172]), ...(off.length ? group(off, [0, 0, 0]) : []), 0xf7])];
}
export function createLightController(output, protocol, onStatus, clock = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) }) {
    let alive = true, opened = false, ready = false, failed = false, desired = [], sent = "", needsClear = false;
    const written = new Set(), controls = [];
    let timer;
    const later = (fn, ms) => { timer = clock.set(() => { timer = undefined; if (alive)
        fn(); }, ms); };
    function send(frame) {
        try {
            output.send(checkedFrame(frame));
            return true;
        }
        catch (error) {
            failed = true;
            onStatus("error", error instanceof Error ? error.message : "MIDI send failed");
            return false;
        }
    }
    const routing = protocol === "palette71" ? createKeyboardRouting(frame => {
        if (!alive || failed)
            return false;
        controls.push(frame);
        flush();
        return true;
    }, () => { needsClear = true; sent = "unset"; flush(); }, clock) : null;
    function flush() {
        if (!alive || !ready || failed || timer !== undefined)
            return;
        if (controls.length) {
            if (send(controls.shift()))
                later(flush, 8);
            return;
        }
        if (needsClear) {
            if (send(lightOff(protocol))) {
                written.clear();
                sent = "";
                needsClear = false;
                later(flush, 8);
            }
            return;
        }
        const signature = desired.join(",");
        if (signature === sent)
            return;
        try {
            const frame = lightTargetFrames(protocol, desired, [...written], routing?.route)[0];
            if (frame && !send(frame))
                return;
            if (protocol === "palette71") {
                if (!desired.length)
                    written.clear();
                else if (frame)
                    for (let i = 9; i < frame.length - 1; i += 2) {
                        if (frame[i + 1])
                            written.add(frame[i]);
                        else
                            written.delete(frame[i]);
                    }
            }
            else {
                written.clear();
                desired.forEach(note => written.add(note));
            }
            if (desired.length === written.size && desired.every(note => written.has(note))) {
                sent = signature;
                onStatus("sent");
            }
            // Recompute the next chunk from ACTUALLY written notes, not a stale queue.
            // Rapid chord changes / pause can safely supersede a partly sent target.
            if (frame)
                later(flush, 8);
        }
        catch (error) {
            onStatus("error", String(error));
        }
    }
    function initialize() {
        if (!alive)
            return;
        opened = true;
        for (const frame of lightInit(protocol))
            if (!send(frame))
                return;
        later(() => {
            if (!send(lightOff(protocol)))
                return;
            // Mode settle before discovery / lighting; not a measured physical latency.
            later(() => { ready = true; routing?.query(); flush(); }, 120);
        }, 8);
    }
    try {
        if (output.open)
            void Promise.resolve(output.open()).then(initialize).catch(error => { if (alive)
                onStatus("error", String(error)); });
        else
            initialize();
    }
    catch (error) {
        onStatus("error", String(error));
    }
    return {
        set(notes) {
            try {
                desired = cleanTarget(protocol, notes);
                flush();
            }
            catch (error) {
                onStatus("error", String(error));
            }
        },
        receive(bytes, portId) { routing?.receive(bytes, portId); },
        off() {
            desired = [];
            needsClear = true;
            if (alive && opened && failed && send(lightOff(protocol))) {
                written.clear();
                needsClear = false;
            }
            else
                flush();
        },
        dispose() { if (timer !== undefined)
            clock.clear(timer); routing?.dispose(); controls.length = 0; if (alive && opened)
            send(lightOff(protocol)); alive = false; },
    };
}
