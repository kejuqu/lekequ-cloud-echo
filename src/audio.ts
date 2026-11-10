import { musicTrack, MUSIC_GAIN } from "./music.ts";

// Generated local music assets; interaction sounds remain synthesized.
export class Sound {
  private ctx?: AudioContext;
  private musicKey = "";
  private playingMusicKey = "";
  private musicRequest = 0;
  private musicSource?: AudioBufferSourceNode;
  private musicGain?: GainNode;
  private musicBus?: GainNode;
  private duckUntil = 0;
  private ducked = false;
  private backgroundNotes = false;
  private musicBuffers = new Map<string, Promise<AudioBuffer>>();
  private musicSources = new Map<AudioBufferSourceNode, GainNode>();
  private disposed = false;
  private failedMusic = new Set<string>();
  private muted = false;
  private active = false;
  private windGain?: GainNode;
  private wind?: AudioBufferSourceNode;
  private beat = 0;
  private timer = 0;
  private chasing = false;
  private bossPhase = 0;
  get soundtrack() {
    return {
      key: this.playingMusicKey,
      playing:
        this.active &&
        !this.muted &&
        !!this.musicSource &&
        this.ctx?.state === "running",
    };
  }
  setMuted(v: boolean) {
    this.muted = v;
    this.syncWind();
    this.syncMusic();
  }
  unlock() {
    if (this.disposed) return;
    this.ctx ??= new AudioContext();
    if (!this.wind) {
      const c = this.ctx,
        buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate),
        data = buffer.getChannelData(0);
      let n = 0;
      for (let i = 0; i < data.length; i++) {
        n = (n + Math.random() * 0.04 - 0.02) * 0.98;
        data[i] = n;
      }
      this.wind = c.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 450;
      this.windGain = c.createGain();
      this.wind.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(c.destination);
      this.wind.start();
      this.syncWind();
    }
    void this.ctx.resume().catch(() => {});
  }
  setActive(v: boolean) {
    this.active = v;
    this.syncWind();
    this.syncMusic();
    if (!v) void this.ctx?.suspend().catch(() => {});
  }
  private syncMusic() {
    if (this.ctx && (this.muted || !this.active)) {
      for (const gain of this.musicSources.values()) {
        gain.gain.cancelScheduledValues(this.ctx.currentTime);
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return;
    }
    if (this.ctx && this.musicGain) {
      const gain = this.musicGain.gain;
      gain.cancelScheduledValues(this.ctx.currentTime);
      gain.setTargetAtTime(
        this.muted || !this.active
          ? 0
          : (MUSIC_GAIN[this.playingMusicKey] ?? 0.2),
        this.ctx.currentTime,
        0.15,
      );
    }
  }
  private duckMusic(duration: number) {
    if (!this.active || this.muted || this.ctx?.state !== "running") return;
    this.duckUntil = Math.max(this.duckUntil, this.ctx.currentTime + duration);
    this.updateDucking();
  }
  private updateDucking() {
    if (!this.ctx) return;
    const ducked = this.ctx.currentTime < this.duckUntil;
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(
        ducked ? 0.28 : 1,
        this.ctx.currentTime,
        ducked ? 0.012 : 0.25,
      );
    }
  }
  private getMusicBus() {
    if (!this.musicBus) {
      this.musicBus = this.ctx!.createGain();
      this.musicBus.gain.value = this.ducked ? 0.28 : 1;
      this.musicBus.connect(this.ctx!.destination);
    }
    return this.musicBus;
  }
  private selectMusic(key: string) {
    const ctx = this.ctx;
    if (
      !ctx ||
      this.disposed ||
      this.musicKey === key ||
      this.failedMusic.has(key)
    )
      return;
    this.musicKey = key;
    const request = ++this.musicRequest;
    let buffer = this.musicBuffers.get(key);
    if (!buffer) {
      const base = import.meta.env?.BASE_URL ?? "/";
      buffer = fetch(`${base}music/${key}.mp3`)
        .then((response) => {
          if (!response.ok)
            throw new Error(`Music ${key}: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      this.musicBuffers.set(key, buffer);
    }
    void buffer
      .then((decoded) => {
        if (this.disposed || request !== this.musicRequest) return;
        const previous = this.musicSource;
        if (previous && this.musicGain) {
          this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
          this.musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
          previous.stop(ctx.currentTime + 1);
        }
        const source = ctx.createBufferSource(),
          gain = ctx.createGain();
        source.buffer = decoded;
        source.loop = true;
        source.connect(gain);
        gain.connect(this.getMusicBus());
        gain.gain.value = 0;
        this.musicSource = source;
        this.playingMusicKey = key;
        this.musicGain = gain;
        this.musicSources.set(source, gain);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.musicSources.delete(source);
        };
        source.start();
        this.syncMusic();
      })
      .catch((error: unknown) => {
        if (this.disposed) return;
        this.failedMusic.add(key);
        this.musicBuffers.delete(key);
        if (request === this.musicRequest) {
          this.musicSource?.stop();
          this.musicSource = undefined;
          this.playingMusicKey = "";
          this.musicKey = "";
        }
        console.warn("背景音乐加载失败，暂用合成伴奏", error);
      });
  }
  private syncWind() {
    if (this.windGain)
      this.windGain.gain.value = this.muted || !this.active ? 0 : 0.12;
  }
  tone(
    f: number,
    duration = 0.3,
    type: OscillatorType = "sine",
    volume = 0.055,
    endFrequency?: number,
  ) {
    if (!this.active || this.muted || !this.ctx || this.ctx.state !== "running")
      return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime);
    if (endFrequency)
      o.frequency.exponentialRampToValueAtTime(
        endFrequency,
        c.currentTime + duration,
      );
    g.gain.setValueAtTime(
      volume * (this.backgroundNotes ? 0.35 : 1),
      c.currentTime,
    );
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(this.backgroundNotes ? this.getMusicBus() : c.destination);
    o.start();
    o.stop(c.currentTime + duration);
  }
  /** 短噪声包络模拟开火爆破与弓弦摩擦，无需加载外部音频。 */
  private noise(
    duration: number,
    volume: number,
    frequency: number,
    filterType: BiquadFilterType = "lowpass",
  ) {
    if (!this.active || this.muted || !this.ctx || this.ctx.state !== "running")
      return;
    const c = this.ctx,
      buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * duration),
        c.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(
      volume * (this.backgroundNotes ? 0.35 : 1),
      c.currentTime,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.backgroundNotes ? this.getMusicBus() : c.destination);
    source.start();
  }
  effect(kind: string, index = 0) {
    if (kind === "win") {
      [261.63, 329.63, 392, 523.25].forEach((f) =>
        this.tone(f, 1.8, "triangle", 0.055),
      );
    } else if (kind === "explosion") {
      this.noise(0.6, 0.3, 1800);
      this.tone(45, 0.7, "sawtooth", 0.1);
    } else if (kind === "word")
      this.tone(261.63 * Math.pow(2, index / 7), 0.65);
    else if (kind === "shot") {
      this.duckMusic(index === 1 ? 0.2 : 0.3);
      if (index === 1) {
        this.noise(0.14, 0.32, 4800);
        this.tone(110, 0.16, "sawtooth", 0.14, 55);
        this.tone(1800, 0.045, "square", 0.09, 750);
      } else {
        this.tone(620, 0.18, "triangle", 0.17, 155);
        this.tone(1100, 0.045, "sine", 0.045, 500);
        this.noise(0.12, 0.09, 2300, "bandpass");
      }
    } else if (kind === "boss-cast") {
      this.noise(index === 1 ? 0.45 : 0.65, 0.16, index === 1 ? 3500 : 750);
      this.tone(index === 1 ? 65 : 110, 0.45, "sawtooth", 0.09);
    } else if (kind === "hit") {
      this.duckMusic(0.12);
      this.noise(0.09, index === 1 ? 0.12 : 0.07, index === 1 ? 2600 : 850);
      this.tone(index === 1 ? 220 : 150, 0.1, "triangle", 0.08);
    } else if (kind === "death") {
      this.tone(60, 0.8, "sawtooth");
      this.tone(43, 0.7, "triangle");
    } else if (kind === "jump") this.tone(440, 0.15, "triangle");
    else if (kind === "burst") this.tone(80, 0.8, "triangle");
    else this.tone(660, 0.4);
  }
  update(dt: number, level: number, boss: number, chase = false, gap = 12) {
    this.updateDucking();
    this.selectMusic(musicTrack(level, boss, chase));
    if (this.musicSource) return;
    this.backgroundNotes = true;
    try {
      this.updateSynth(dt, level, boss, chase, gap);
    } finally {
      this.backgroundNotes = false;
    }
  }
  private updateSynth(
    dt: number,
    level: number,
    boss: number,
    chase: boolean,
    gap: number,
  ) {
    if (chase !== this.chasing) {
      this.chasing = chase;
      this.timer = 0;
      this.beat = 0;
    }
    if (boss !== this.bossPhase) {
      this.bossPhase = boss;
      this.timer = 0;
      this.beat = 0;
    }
    this.timer += dt;
    if (chase) {
      // 半音与三全音低音、双拍心跳和擦噪营造恐怖追逐；距离越近节奏越急。
      const pulse = gap < 7 ? 0.17 : 0.23;
      if (this.timer < pulse) return;
      this.timer -= pulse;
      const notes = [0, 1, 0, 6, 0, -1, 6, 1];
      this.tone(
        49 * Math.pow(2, notes[this.beat % 8] / 12),
        0.34,
        "sawtooth",
        0.035,
      );
      if (this.beat % 4 < 2)
        this.tone(this.beat % 4 === 0 ? 57 : 43, 0.12, "sine", 0.12);
      if (this.beat % 8 === 6) this.noise(0.24, 0.045, 2100);
      if (this.beat % 16 === 0)
        this.tone(196 * Math.sqrt(2), 0.8, "triangle", 0.025);
      this.beat++;
      return;
    }
    if (boss) {
      const pulse = boss >= 3 ? 0.13 : boss === 2 ? 0.16 : 0.19;
      if (this.timer < pulse) return;
      this.timer -= pulse;
      const riff = [0, 0, 3, 0, 6, 5, 3, 1];
      this.tone(
        65.4 * Math.pow(2, riff[this.beat % 8] / 12),
        pulse * 1.8,
        "sawtooth",
        0.045,
      );
      if (this.beat % 4 === 0) {
        this.tone(48, 0.2, "sine", 0.17);
        this.noise(0.12, 0.08, 450);
      }
      if (this.beat % 4 === 2) this.noise(0.12, 0.075, 2600);
      this.noise(0.035, 0.025, 6500);
      if (this.beat % 8 === 0) this.tone(196, pulse * 6, "triangle", 0.035);
      this.beat++;
      return;
    }
    if (this.timer < 0.65 - level * 0.045) return;
    this.timer = 0;
    const scale = [0, 3, 7, 10, 7, 5, 3, 0];
    this.tone(
      (level === 4 ? 130.81 : 164.81) * Math.pow(2, scale[this.beat % 8] / 12),
      0.7,
      "sine",
      0.016,
    );
    if (level > 1 && this.beat % 2 === 0)
      this.tone(50 + level * 7, 0.1, "triangle", 0.02);
    this.beat++;
  }
  dispose() {
    this.disposed = true;
    for (const source of this.musicSources.keys()) source.stop();
    this.musicSources.clear();
    this.musicBuffers.clear();
    this.wind?.stop();
    void this.ctx?.close();
  }
}
