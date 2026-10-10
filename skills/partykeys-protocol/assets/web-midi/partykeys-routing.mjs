// Extracted from FruitChord dea4ad71; see references/verified-web-midi.md.
// Keyboard discovery on an explicitly selected PartyKeys bus. The App still owns
// USB/BLE; these are raw Web MIDI SysEx, never BLE timestamp-wrapped packets.
export const KEYBOARD_QUERY = [0xf0, 5, 0x30, 0x7f, 0x7f, 0x20, 0, 1, 0xf7];
export function createKeyboardRouting(send, changed, clock) {
    let alive = true, routes = new Map(), pending;
    const buffers = new Map(), allocated = new Map();
    let queryTimer, requeryTimer;
    function query() {
        if (!alive)
            return;
        if (queryTimer !== undefined)
            clock.clear(queryTimer);
        pending = new Map();
        allocated.clear();
        // No idle-mode preamble: querying during a run must not hand lights to firmware.
        send([...KEYBOARD_QUERY]);
        queryTimer = clock.set(() => {
            queryTimer = undefined;
            const answered = pending;
            pending = undefined;
            allocated.clear();
            // Silence isn't proof of disconnection. Keep the last known good routes.
            if (!answered?.size)
                return;
            const different = routes.size !== answered.size || [...answered].some(([address, route]) => {
                const old = routes.get(address);
                return old?.channel !== route.channel || old.octave !== route.octave;
            });
            routes = answered;
            if (different)
                changed();
        }, 3000);
    }
    function report(bytes) {
        if (bytes.length < 9 || ![5, 0x7f].includes(bytes[1]) || bytes[2] !== 0x30)
            return;
        if (!((bytes[3] === 0x20 && bytes[4] === 0) || (bytes[3] === 0x7e && bytes[4] === 0x7e)))
            return;
        const [, , , , , channel, address, command, value] = bytes;
        if (channel > 15 || address > 0x6f)
            return;
        if (command === 4 || command === 5) {
            if (requeryTimer !== undefined)
                clock.clear(requeryTimer);
            requeryTimer = clock.set(() => { requeryTimer = undefined; query(); }, 700);
        }
        else if (command === 2 && bytes.length >= 10) {
            if (channel === 0) {
                // Unassigned main keyboard only. Sub-keyboards follow their main device.
                if (value !== 1 || allocated.has(address))
                    return;
                const used = new Set([...routes.values()].map(route => route.channel).concat([...allocated.values()]));
                const next = Array.from({ length: 15 }, (_, i) => i + 1).find(id => !used.has(id));
                if (next && send([0xf0, 5, 0x30, 0, 0x7f, 0x20, 0, 3, next, 0xf7]))
                    allocated.set(address, next);
                return; // Wait for the keyboard to acknowledge its assigned channel.
            }
            const previous = routes.get(address);
            const route = { channel, octave: previous?.channel === channel ? previous.octave : 0 };
            pending?.set(address, route);
            routes.set(address, route);
            if (!previous || previous.channel !== channel)
                changed();
        }
        else if (command === 0x18 && channel > 0 && bytes.length >= 10) {
            const octave = value > 0x40 ? value - 0x80 : value;
            if (octave < -3 || octave > 3)
                return;
            let different = false;
            for (const [address, route] of routes)
                if (route.channel === channel && route.octave !== octave) {
                    const next = { channel, octave };
                    routes.set(address, next);
                    if (pending?.has(address))
                        pending.set(address, next);
                    different = true;
                }
            if (different)
                changed();
        }
    }
    return {
        query,
        route(note) {
            for (const [address, { channel, octave }] of routes) {
                const low = 48 + (address - 0x3f) * 36 + octave * 12;
                if (note >= low && note < low + 36)
                    return { address, channel };
            }
            return { address: 0x7f, channel: 0x7f };
        },
        receive(raw, portId) {
            if (!alive)
                return;
            for (const byte of Array.from(raw)) {
                if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
                    buffers.delete(portId);
                    continue;
                }
                if (byte >= 0xf8)
                    continue;
                if (byte === 0xf0) {
                    buffers.set(portId, [byte]);
                    continue;
                }
                const buffer = buffers.get(portId);
                if (!buffer)
                    continue;
                if (byte === 0xf7) {
                    buffers.delete(portId);
                    report([...buffer, byte]);
                }
                else if (byte >= 0x80 || buffer.length >= 256)
                    buffers.delete(portId);
                else
                    buffer.push(byte);
            }
        },
        dispose() {
            alive = false;
            buffers.clear();
            routes.clear();
            allocated.clear();
            pending = undefined;
            if (queryTimer !== undefined)
                clock.clear(queryTimer);
            if (requeryTimer !== undefined)
                clock.clear(requeryTimer);
        },
    };
}
