// Safe integration entry point. The host application continues to own MIDI access,
// event listeners, device selection UI, note scoring, audio and Bluetooth pairing.
import {
  createLightController, lightingInputIds, midiOutputChoices, supportsPartyKeysBus,
} from './partykeys-lights.mjs';

// Some injected Web MIDI implementations omit sysexEnabled. As in FruitChord,
// trust a successful { sysex: true } request unless the returned access explicitly
// denies it. Merely receiving notes or succeeding with { sysex: false } is not enough.
export function lightingSysexAvailable(access, sysexRequestSucceeded = false) {
  return Boolean(access) && sysexRequestSucceeded === true && access.sysexEnabled !== false;
}

export function connectedPorts(portMap) {
  const ports = [];
  if (typeof portMap?.values === 'function') ports.push(...portMap.values());
  else if (typeof portMap?.forEach === 'function') portMap.forEach(port => ports.push(port));
  return ports.filter(port => port.state !== 'disconnected');
}

export function createPartyKeysLighting({
  inputs, outputs, outputId, sysexEnabled, onStatus = () => {}, clock,
}) {
  if (sysexEnabled !== true) throw new Error('Lighting requires confirmed SysEx access; keep ordinary MIDI input enabled.');
  const inputPorts = connectedPorts(inputs), outputPorts = connectedPorts(outputs);
  const choices = midiOutputChoices(outputPorts);
  const supported = choices.filter(({ port }) => supportsPartyKeysBus(port));
  const choice = outputId !== undefined ? choices.find(port => port.id === outputId)
    : supported.length === 1 ? supported[0] : undefined;
  if (!choice || !supportsPartyKeysBus(choice.port)) {
    throw new Error('Select one connected PartyKeys / PartyStudio / SAM5704 MIDI output.');
  }
  const inputIds = lightingInputIds(choice.port, inputPorts, outputPorts);
  if (!inputIds.length) throw new Error('Lighting input/output pairing is missing or ambiguous; keep ordinary MIDI input enabled.');
  // Deliberately force the verified profile even if an old app preference says RGB.
  const controller = createLightController(choice.port, 'palette71', onStatus, clock);
  const paired = new Set(inputIds);
  let disposed = false;
  return {
    outputId: choice.id,
    inputIds: [...inputIds],
    set(notes) { if (!disposed) controller.set(notes); },
    receive(bytes, inputId) {
      if (!disposed && paired.has(inputId)) controller.receive(bytes, inputId);
    },
    off() { if (!disposed) controller.off(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.dispose();
    },
  };
}
