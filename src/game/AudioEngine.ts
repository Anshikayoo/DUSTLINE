import { Gender, LocationId, SurfaceType, WeaponId } from './types';

/**
 * ============================================================================
 * SECTION: REALISTIC SPATIAL WEB AUDIO ENGINE WITH CONVOLUTION REVERB
 * ============================================================================
 * Synthesizes gunshots, ConvolverNode spatial reverb tail, 3D PannerNode
 * positioning, wall-occlusion low-pass muffling, bullet whizz pass-bys,
 * shell casing clinks, surface-aware footsteps (gravel/metal/concrete),
 * low-health heartbeat, flash tinnitus, and location ambient soundscapes.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private currentLocation: LocationId = 'dust_canyon';
  private muted = false;
  private volume = 0.72;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = 0.92;
      this.dryGain.connect(this.masterGain);

      // Procedural impulse-response reverb bus
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.createImpulseResponse(this.ctx, 1.35, 2.8);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.24;
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.5);
      this.startAmbientLoop();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
    }
  }

  public setAmbientLocation(loc: LocationId): void {
    this.currentLocation = loc;
    if (!this.ctx || !this.ambientFilter || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const isNight = loc === 'night_city' || loc === 'neon_alley';
    const isVolcano = loc === 'volcano_outpost';
    const isArctic = loc === 'arctic_base' || loc === 'snow_village';
    const freq = isVolcano ? 180 : isNight ? 320 : isArctic ? 620 : 440;
    this.ambientFilter.frequency.setTargetAtTime(freq, now, 0.25);
    this.ambientGain.gain.setTargetAtTime(isArctic ? 0.055 : 0.038, now, 0.25);
  }

  public updateListener(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  private startAmbientLoop(): void {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain || this.ambientSource) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.value = 420;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();

    this.ambientSource = src;
    this.ambientFilter = filter;
    this.ambientGain = gain;
    this.setAmbientLocation(this.currentLocation);
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  private ready(): boolean {
    if (this.muted) return false;
    if (!this.ctx) this.unlock();
    return Boolean(this.ctx && this.dryGain && this.noiseBuffer && this.ctx.state === 'running');
  }

  public playGunshot(weapon: WeaponId): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const out = this.dryGain!;

    if (weapon === 'knife') {
      this.spawnNoiseBurst(now, 0.12, 1300, 'bandpass', 0.24, out);
      return;
    }

    // Route gunfire through both dry & reverb tail
    const bus = ctx.createGain();
    bus.gain.value = 1.0;
    bus.connect(out);
    if (this.reverbNode && weapon !== 'usps') {
      const revSend = ctx.createGain();
      revSend.gain.value = weapon === 'awp' ? 0.55 : 0.3;
      bus.connect(revSend);
      revSend.connect(this.reverbNode);
    }

    if (weapon === 'usps') {
      this.spawnNoiseBurst(now, 0.08, 3200, 'bandpass', 0.28, bus);
      this.spawnPunchOsc(now, 240, 75, 0.06, 'triangle', 0.26, bus);
    } else if (weapon === 'mp9') {
      this.spawnNoiseBurst(now, 0.09, 2100, 'bandpass', 0.48, bus);
      this.spawnPunchOsc(now, 185, 58, 0.08, 'triangle', 0.36, bus);
    } else if (weapon === 'nova') {
      this.spawnNoiseBurst(now, 0.28, 950, 'lowpass', 0.85, bus);
      this.spawnNoiseBurst(now, 0.14, 2900, 'bandpass', 0.5, bus);
      this.spawnPunchOsc(now, 120, 28, 0.22, 'sawtooth', 0.68, bus);
      this.spawnClick(now + 0.36, 1750, 0.18, out);
      this.spawnClick(now + 0.48, 2250, 0.18, out);
    } else if (weapon === 'm4a4') {
      this.spawnNoiseBurst(now, 0.15, 1650, 'bandpass', 0.62, bus);
      this.spawnNoiseBurst(now, 0.07, 4200, 'highpass', 0.3, bus);
      this.spawnPunchOsc(now, 168, 42, 0.11, 'sawtooth', 0.44, bus);
    } else {
      this.spawnNoiseBurst(now, 0.36, 950, 'lowpass', 0.85, bus);
      this.spawnNoiseBurst(now, 0.14, 3400, 'bandpass', 0.55, bus);
      this.spawnPunchOsc(now, 125, 28, 0.24, 'sawtooth', 0.72, bus);
      this.spawnClick(now + 0.55, 1900, 0.16, out);
      this.spawnClick(now + 0.78, 2500, 0.18, out);
    }
  }

  public playBotGunshot(
    distance: number,
    stereoPan: number,
    worldPos?: { x: number; y: number; z: number },
    occluded = false
  ): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const out = this.dryGain!;
    const now = ctx.currentTime;

    const atten = Math.max(0.025, Math.min(0.62, 13 / (distance + 10))) * (occluded ? 0.58 : 1.0);
    const gain = ctx.createGain();
    gain.gain.value = atten;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = occluded ? Math.max(420, 1200 - distance * 12) : Math.max(700, 3200 - distance * 22);

    if (worldPos && ctx.createPanner) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'linear';
      panner.maxDistance = 180;
      panner.positionX.value = worldPos.x;
      panner.positionY.value = worldPos.y;
      panner.positionZ.value = worldPos.z;
      gain.connect(filter);
      filter.connect(panner);
      panner.connect(out);
      if (this.reverbNode) panner.connect(this.reverbNode);
    } else {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, stereoPan));
      gain.connect(filter);
      filter.connect(panner);
      panner.connect(out);
    }

    this.spawnNoiseBurst(now, 0.14, 1900, 'bandpass', 0.58, gain);
    this.spawnPunchOsc(now, 138, 38, 0.1, 'sawtooth', 0.36, gain);
  }

  public playBulletWhizz(stereoPan: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, stereoPan));
    panner.connect(this.dryGain!);
    this.spawnPunchOsc(now, 1800, 620, 0.08, 'sine', 0.12, panner);
    this.spawnNoiseBurst(now, 0.06, 3600, 'bandpass', 0.14, panner, 3.2);
  }

  public playShellBounce(stereoPan = 0.45): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = stereoPan;
    panner.connect(this.dryGain!);
    const f = 3600 + Math.random() * 900;
    this.spawnPunchOsc(now, f, f * 0.92, 0.035, 'sine', 0.045, panner);
  }

  public playHeartbeat(): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const out = this.dryGain!;
    this.spawnPunchOsc(now, 68, 34, 0.11, 'sine', 0.28, out);
    this.spawnPunchOsc(now + 0.18, 62, 30, 0.1, 'sine', 0.2, out);
  }

  public playTinnitus(intensity = 0.6): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3850, now);
    g.gain.setValueAtTime(0.08 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 2.2);
    osc.connect(g);
    g.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 2.25);
  }

  public playReload(reloadDuration: number): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const out = this.dryGain!;
    this.spawnClick(now + 0.08, 1600, 0.22, out);
    this.spawnPunchOsc(now + reloadDuration * 0.56, 190, 75, 0.07, 'triangle', 0.26, out);
    this.spawnClick(now + reloadDuration * 0.84, 2800, 0.24, out);
  }

  public playDryFire(): void {
    if (!this.ready()) return;
    this.spawnClick(this.ctx!.currentTime, 2900, 0.22, this.dryGain!);
  }

  public playWeaponSwitch(): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    this.spawnClick(now, 1400, 0.14, this.dryGain!);
    this.spawnClick(now + 0.05, 2200, 0.12, this.dryGain!);
  }

  public playScopeToggle(zoomIn: boolean): void {
    if (!this.ready()) return;
    this.spawnClick(this.ctx!.currentTime, zoomIn ? 2600 : 1850, 0.15, this.dryGain!);
  }

  public playFootstep(surface: SurfaceType = 'concrete', isLanding = false): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const scale = isLanding ? 1.65 : 1.0;
    this.synthesizeSurfaceFootstep(now, surface, scale, isLanding, this.dryGain!);
  }

  public playBotFootstep(surface: SurfaceType, distance: number, stereoPan: number, occluded = false): void {
    if (!this.ready() || distance > 34) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const atten = Math.max(0.015, Math.min(0.45, 7.2 / (distance + 6.0))) * (occluded ? 0.55 : 1.0);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, stereoPan));

    const distFilter = ctx.createBiquadFilter();
    distFilter.type = 'lowpass';
    distFilter.frequency.value = occluded ? 850 : Math.max(950, 6000 - distance * 145);

    const gain = ctx.createGain();
    gain.gain.value = atten;

    gain.connect(distFilter);
    distFilter.connect(panner);
    panner.connect(this.dryGain!);

    this.synthesizeSurfaceFootstep(now, surface, 0.88, false, gain);
  }

  private synthesizeSurfaceFootstep(
    now: number,
    surface: SurfaceType,
    scale: number,
    isLanding: boolean,
    destination: AudioNode
  ): void {
    const pitchJitter = 0.92 + Math.random() * 0.16;

    if (surface === 'gravel') {
      this.spawnPunchOsc(now, 108 * pitchJitter, 42, 0.055, 'sine', 0.11 * scale, destination);
      const grains = isLanding ? 5 : 4;
      for (let i = 0; i < grains; i++) {
        const offset = i * 0.017 + Math.random() * 0.008;
        const grainFreq = (1750 + Math.random() * 2400) * pitchJitter;
        const grainDur = 0.026 + Math.random() * 0.02;
        const grainGain = (0.14 - i * 0.02) * scale;
        this.spawnNoiseBurst(
          now + offset,
          grainDur,
          grainFreq,
          'bandpass',
          Math.max(0.03, grainGain),
          destination,
          2.3
        );
      }
      if (isLanding) {
        this.spawnNoiseBurst(now + 0.02, 0.08, 920, 'bandpass', 0.14 * scale, destination, 1.2);
      }
      return;
    }

    if (surface === 'metal') {
      const plateShift = (isLanding ? 0.84 : 1.0) * pitchJitter;
      this.spawnPunchOsc(now, 136 * plateShift, 62 * plateShift, 0.075, 'triangle', 0.18 * scale, destination);
      this.spawnNoiseBurst(now, 0.026, 2500 * plateShift, 'highpass', 0.13 * scale, destination, 1.4);

      const partials: [number, number, number][] = [
        [312 * plateShift, 0.16, 0.062 * scale],
        [542 * plateShift, 0.13, 0.044 * scale],
        [868 * plateShift, 0.1, 0.024 * scale],
      ];
      for (const [freq, dur, g] of partials) {
        this.spawnPunchOsc(now, freq, freq * 0.96, dur, 'sine', g, destination);
      }
      return;
    }

    this.spawnPunchOsc(now, 165 * pitchJitter, 54, 0.052, 'triangle', 0.16 * scale, destination);
    this.spawnNoiseBurst(now, 0.036, 1280 * pitchJitter, 'bandpass', 0.16 * scale, destination, 1.6);
    this.spawnNoiseBurst(now, 0.02, 2700 * pitchJitter, 'highpass', 0.055 * scale, destination, 1.0);
    if (isLanding) {
      this.spawnPunchOsc(now + 0.04, 130, 44, 0.06, 'triangle', 0.13 * scale, destination);
    }
  }

  public playHitConfirm(headshot: boolean, kill: boolean): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const out = this.dryGain!;
    const now = ctx.currentTime;

    if (headshot) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(1480, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.12);
      osc2.frequency.setValueAtTime(2940, now);
      osc2.frequency.exponentialRampToValueAtTime(2100, now + 0.09);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(g);
      osc2.connect(g);
      g.connect(out);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } else {
      this.spawnClick(now, 1150, 0.24, out);
      this.spawnPunchOsc(now, 210, 95, 0.055, 'sine', 0.18, out);
    }

    if (kill) {
      this.spawnPunchOsc(now + 0.03, headshot ? 880 : 660, headshot ? 1320 : 880, 0.14, 'sine', 0.14, out);
    }
  }

  public playPlayerHurt(armored: boolean, gender: Gender): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const out = this.dryGain!;
    const pitchScale = gender === 'female' ? 1.38 : 1.0;
    this.spawnPunchOsc(
      now,
      (armored ? 155 : 122) * pitchScale,
      46 * pitchScale,
      0.14,
      'triangle',
      0.42,
      out
    );
    this.spawnNoiseBurst(now, 0.08, armored ? 1400 : 750, 'bandpass', 0.24, out);
  }

  public playPlayerDeath(gender: Gender): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const scale = gender === 'female' ? 1.42 : 1.0;
    this.spawnPunchOsc(now, 190 * scale, 62 * scale, 0.32, 'sawtooth', 0.34, this.dryGain!);
  }

  public playGrenadeBounce(): void {
    if (!this.ready()) return;
    this.spawnClick(this.ctx!.currentTime, 980 + Math.random() * 240, 0.15, this.dryGain!);
  }

  public playGrenadeExplode(kind: 'smoke' | 'flash' | 'he', distance: number): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const atten = Math.max(0.08, Math.min(1, 22 / (distance + 10)));
    const gain = ctx.createGain();
    gain.gain.value = atten;
    gain.connect(this.dryGain!);
    if (this.reverbNode) gain.connect(this.reverbNode);

    if (kind === 'smoke') {
      this.spawnNoiseBurst(now, 0.85, 1150, 'bandpass', 0.45, gain);
      this.spawnClick(now, 1400, 0.2, gain);
    } else if (kind === 'flash') {
      this.spawnNoiseBurst(now, 0.25, 3600, 'highpass', 0.65, gain);
      this.spawnPunchOsc(now, 2400, 1950, 0.55, 'sine', 0.18, gain);
      if (distance < 17) this.playTinnitus(1 - distance / 17);
    } else {
      this.spawnNoiseBurst(now, 0.72, 460, 'lowpass', 0.95, gain);
      this.spawnPunchOsc(now, 95, 22, 0.46, 'sawtooth', 0.8, gain);
      if (distance < 10) this.playTinnitus(0.5);
    }
  }

  public playBombBeep(urgent: boolean): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(urgent ? 2350 : 1780, now);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(g);
    g.connect(this.dryGain!);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playBombExplosion(): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const out = this.dryGain!;
    this.spawnNoiseBurst(now, 1.5, 340, 'lowpass', 1.0, out);
    this.spawnPunchOsc(now, 72, 18, 1.05, 'sawtooth', 0.95, out);
    this.playTinnitus(0.75);
  }

  public playBuyItem(): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const out = this.dryGain!;
    this.spawnClick(now, 1900, 0.16, out);
    this.spawnPunchOsc(now + 0.04, 520, 780, 0.15, 'triangle', 0.15, out);
  }

  public playPickup(): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    this.spawnClick(now, 1300, 0.15, this.dryGain!);
    this.spawnClick(now + 0.05, 1950, 0.16, this.dryGain!);
  }

  public playRoundCue(type: 'start' | 'win' | 'loss' | 'plant' | 'defuse'): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const out = this.dryGain!;
    const now = ctx.currentTime;

    const notes =
      type === 'win' || type === 'defuse'
        ? [440, 554.37, 659.25]
        : type === 'loss'
          ? [329.63, 293.66, 220]
          : type === 'plant'
            ? [587.33, 440, 587.33]
            : [523.25, 659.25];

    notes.forEach((freq, idx) => {
      const t = now + idx * 0.1;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  private spawnNoiseBurst(
    startTime: number,
    duration: number,
    frequency: number,
    filterType: BiquadFilterType,
    peakGain: number,
    destination: AudioNode,
    qFactor = 1.1
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, startTime);
    filter.Q.value = qFactor;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  private spawnPunchOsc(
    startTime: number,
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
    destination: AudioNode
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private spawnClick(startTime: number, freq: number, peakGain: number, destination: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, startTime + 0.025);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.032);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + 0.036);
  }

  public dispose(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {
        // ignore
      }
      this.ambientSource = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
