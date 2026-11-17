export type SoundscapeType = 'off' | 'rain' | 'brown' | 'binaural';

class FocusSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private currentType: SoundscapeType = 'off';

  private ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.25;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(0.6, vol)), this.ctx.currentTime, 0.08);
    }
  }

  public stop() {
    for (const node of this.activeNodes) {
      try {
        if ('stop' in node && typeof (node as AudioBufferSourceNode).stop === 'function') {
          (node as AudioBufferSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
    }
    this.activeNodes = [];
    this.currentType = 'off';
  }

  public start(type: SoundscapeType, volume = 0.25) {
    if (type === this.currentType && type !== 'off') return;
    this.stop();
    if (type === 'off') return;

    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    this.masterGain.gain.value = Math.max(0, Math.min(0.6, volume));
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'brown' || type === 'rain') {
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i += 1) {
        const white = Math.random() * 2 - 1;
        if (type === 'brown') {
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.8;
        } else {
          // Soft rain texture
          data[i] = white * 0.25 + (Math.random() > 0.996 ? (Math.random() - 0.5) * 0.45 : 0);
        }
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = type === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = type === 'rain' ? 1100 : 340;
      filter.Q.value = type === 'rain' ? 0.6 : 0.7;

      source.connect(filter);
      filter.connect(this.masterGain);
      source.start();
      this.activeNodes.push(source, filter);
    } else if (type === 'binaural') {
      // Calm harmonic focus drone (220 Hz + gentle 224 Hz)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const droneGain = this.ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 174;
      osc2.frequency.value = 178;
      droneGain.gain.value = 0.16;

      osc1.connect(droneGain);
      osc2.connect(droneGain);
      droneGain.connect(this.masterGain);
      osc1.start();
      osc2.start();
      this.activeNodes.push(osc1, osc2, droneGain);
    }

    this.currentType = type;
  }

  public playGentleChime() {
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.85);
    } catch {
      // Ignore if autoplay blocked
    }
  }
}

export const soundEngine = new FocusSoundEngine();
