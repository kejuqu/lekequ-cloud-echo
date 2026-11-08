// All sounds are synthesized locally: no samples, downloads, or autoplay before a gesture.
export class Sound {
  private ctx?: AudioContext;
  private muted = false;
  private active = false;
  private windGain?: GainNode;
  private wind?: AudioBufferSourceNode;
  private beat = 0;
  private timer = 0;
  private chasing = false;
  setMuted(v: boolean) {
    this.muted = v;
    this.syncWind();
  }
  unlock() {
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
  }
  private syncWind() {
    if (this.windGain)
      this.windGain.gain.value = this.muted || !this.active ? 0 : 0.22;
  }
  tone(
    f: number,
    duration = 0.3,
    type: OscillatorType = "sine",
    volume = 0.055,
  ) {
    if (!this.active || this.muted || !this.ctx || this.ctx.state !== "running")
      return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, c.currentTime);
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + duration);
  }
  /** 短噪声包络模拟开火爆破与弓弦摩擦，无需加载外部音频。 */
  private noise(duration: number, volume: number, frequency: number) {
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
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start();
  }
  effect(kind: string, index = 0) {
    if (kind === "word") this.tone(261.63 * Math.pow(2, index / 7), 0.65);
    else if (kind === "shot") {
      if (index === 1) {
        this.noise(0.22, 0.32, 3200);
        this.tone(92, 0.22, "sawtooth", 0.14);
        this.tone(1350, 0.06, "square", 0.065);
      } else {
        this.tone(460, 0.09, "triangle", 0.095);
        this.tone(170, 0.18, "sine", 0.035);
        this.noise(0.08, 0.065, 2800);
      }
    } else if (kind === "boss-cast") {
      this.noise(index === 1 ? 0.45 : 0.65, 0.16, index === 1 ? 3500 : 750);
      this.tone(index === 1 ? 65 : 110, 0.45, "sawtooth", 0.09);
    } else if (kind === "hit") {
      this.noise(0.09, 0.12, 2600);
      this.tone(220, 0.1, "triangle", 0.08);
    } else if (kind === "death") {
      this.tone(60, 0.8, "sawtooth");
      this.tone(43, 0.7, "triangle");
    } else if (kind === "jump") this.tone(440, 0.15, "triangle");
    else if (kind === "burst") this.tone(80, 0.8, "triangle");
    else this.tone(660, 0.4);
  }
  update(dt: number, level: number, boss: number, chase = false, gap = 12) {
    if (chase !== this.chasing) {
      this.chasing = chase;
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
    if (this.timer < (boss ? 0.35 : 0.65 - level * 0.045)) return;
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
    this.wind?.stop();
    void this.ctx?.close();
  }
}
