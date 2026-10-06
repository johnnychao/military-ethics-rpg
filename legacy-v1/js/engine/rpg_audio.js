/* Original chapter scores rendered locally with Web Audio. Never autoplay before a gesture.
 * The separately authored score catalog is loaded before this file in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('../data/rpg_music'));
  else root.RPGMusic = factory(root, root.RPGChapterMusic);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, catalog) {
  'use strict';
  const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const quietScenes = new Set(['dialogue', 'reading', 'briefing', 'planning', 'review', 'complete', 'outcome']);
  // Harmonic spectra plus individual envelopes make the lead, accompaniment and bass distinct.
  const instruments = {
    felt: { harmonics:[1,.21,.07,.025], attack:.012, sustain:.18 },
    marimba: { harmonics:[1,.04,.3,.01,.06], attack:.008, sustain:.07 },
    glass: { harmonics:[1,.02,.24,.01,.11,.02], attack:.015, sustain:.12 },
    bell: { harmonics:[1,.03,.16,.01,.04,.02,.015], attack:.01, sustain:.08 },
    celesta: { harmonics:[1,.28,.04,.1], attack:.012, sustain:.1 },
    kalimba: { harmonics:[1,.1,.34,.07], attack:.009, sustain:.08 },
    pluck: { harmonics:[1,.35,.16,.08,.03], attack:.008, sustain:.09 },
    harp: { harmonics:[1,.27,.1,.04], attack:.014, sustain:.13 },
    mellow: { harmonics:[1,.1,.2,.025], attack:.025, sustain:.25 },
    flute: { harmonics:[1,.025,.08,.015], attack:.09, sustain:.72 },
    reed: { harmonics:[1,.08,.24,.045,.055], attack:.05, sustain:.55 },
    horn: { harmonics:[1,.29,.17,.065,.015], attack:.11, sustain:.65 },
    strings: { harmonics:[1,.28,.17,.09,.04,.02], attack:.3, sustain:.72, detune:3 },
    choir: { harmonics:[1,.08,.13,.03,.02], attack:.38, sustain:.8, detune:-3 },
    warm: { harmonics:[1,.13,.05], attack:.23, sustain:.68, detune:2 },
    round: { harmonics:[1,.14,.025], attack:.025, sustain:.42 },
    soft: { harmonics:[1,.035], attack:.06, sustain:.6 },
    pluckedBass: { harmonics:[1,.3,.08], attack:.014, sustain:.2 }
  };
  class RPGMusic {
    constructor({ onStatus, contextFactory, timer } = {}) {
      const Audio = root.AudioContext || root.webkitAudioContext;
      this.factory = contextFactory || (Audio ? () => new Audio() : null);
      this.timer = timer || { setInterval:(fn, ms) => root.setInterval(fn, ms), clearInterval:id => root.clearInterval(id) };
      this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
      this.enabled = true; this.volume = .2; this.paused = false; this.destroyed = false;
      this.scene = 'exploration'; this.playing = false; this.available = !!this.factory && !!catalog?.get('u01');
      this.chapterId = 'u01'; this.score = catalog?.get('u01') || null;
      this.message = this.idleMessage();
      this.context = null; this.master = null; this.filter = null; this.stage = null;
      this.interval = null; this.pending = null; this.unlocked = false; this.step = 0; this.nextTime = 0; this.scheduledSteps = [];
      this.voices = new Set(); this.retired = new Set(); this.waves = new Map(); this.lastStatus = '';
      this.effects = new Map(); this.effectLoadStarted = false; this.effectRequests = [];
      this.impulse = null; this.noise = null;
      this.emit();
    }
    idleMessage() {
      return this.available ? '操作遊戲後開始播放背景音樂' : '此瀏覽器無法播放背景音樂，仍可繼續遊玩';
    }
    getStatus() {
      return { enabled:this.enabled, volume:this.volume, playing:this.playing, available:this.available,
        message:this.message, chapterId:this.chapterId, title:this.score?.title || '',
        character:this.score?.character || '' };
    }
    emit() {
      const status = this.getStatus(), serialized = JSON.stringify(status);
      if (serialized === this.lastStatus) return;
      this.lastStatus = serialized;
      try { this.onStatus(status); } catch (_) { /* A failed label cannot break gameplay. */ }
    }
    playingMessage() { return '第 ' + Number(this.chapterId.slice(1)) + ' 章配樂 · ' + this.score.title; }
    setChapter(id) {
      if (this.destroyed || !catalog?.get(id)) return false;
      if (id === this.chapterId) return true;
      this.retireStage(); this.chapterId = id; this.score = catalog.get(id); this.step = 0; this.scheduledSteps = [];
      if (this.playing) {
        try {
          this.makeStage(); this.nextTime = this.context.currentTime + .09; this.schedule();
          this.message = this.playingMessage();
        } catch (_) { this.fail('背景音樂暫時中斷，可使用音樂開關重試'); }
      }
      this.emit(); return true;
    }
    setEnabled(enabled) {
      if (this.destroyed) return this.getStatus();
      this.enabled = !!enabled;
      if (!this.enabled) { this.stop(); this.message = '背景音樂已關閉'; this.emit(); }
      else if (this.paused) { this.message = '背景音樂暫停，回到遊戲後恢復'; this.emit(); }
      else if (this.unlocked) this.activate();
      else { this.message = this.idleMessage(); this.emit(); }
      return this.getStatus();
    }
    setVolume(volume) {
      if (this.destroyed || typeof volume !== 'number' || !Number.isFinite(volume)) return false;
      this.volume = Math.min(1, Math.max(0, volume));
      this.fade(this.playing ? this.volume * .65 : 0); this.emit(); return true;
    }
    setScene(scene) {
      if (this.destroyed) return;
      this.scene = typeof scene === 'string' ? scene : 'exploration';
      this.tuneStage();
    }
    tuneStage() {
      if (!this.stage || !this.context) return;
      const quiet = quietScenes.has(this.scene), now = this.context.currentTime;
      try {
        this.stage.output.gain.setTargetAtTime(quiet ? .48 : 1, now, .12);
        this.stage.filter.frequency.setTargetAtTime(this.score.cutoff * (quiet ? .72 : 1), now, .2);
      } catch (_) {}
    }
    unlock() {
      if (this.destroyed || !this.enabled || this.paused || !this.available) return Promise.resolve(false);
      return this.activate();
    }
    activate() {
      if (this.pending) return this.pending;
      if (this.destroyed || !this.enabled || this.paused || !this.available) return Promise.resolve(false);
      if (this.playing && this.context?.state === 'running') return Promise.resolve(true);
      if (this.playing) this.stop();
      this.pending = (async () => {
        if (!this.context) {
          try {
            this.context = this.factory(); this.master = this.context.createGain(); this.master.gain.value = 0;
            this.master.connect(this.context.destination);
          } catch (error) {
            try { this.context?.close()?.catch?.(() => {}); } catch (_) {}
            this.context = null; this.master = null; throw error;
          }
        }
        // Resume stays inside the caller's gesture; a rejected resume is recoverable on the next gesture.
        if (this.context.state !== 'running') await this.context.resume();
        if (this.context.state !== 'running') throw new Error('Audio resume blocked');
        if (this.destroyed || !this.enabled || this.paused) return false;
        this.unlocked = true; this.playing = true;
        this.cleanup(); this.makeStage(); this.nextTime = this.context.currentTime + .09;
        this.fade(this.volume * .65); this.loadEffects(); this.schedule();
        if (this.interval === null) this.interval = this.timer.setInterval(() => {
          try { this.schedule(); } catch (_) { this.fail('背景音樂排程失敗，可繼續遊玩'); }
        }, 100);
        this.message = this.playingMessage(); this.emit(); return true;
      })().catch(() => {
        if (!this.destroyed) this.fail('背景音樂尚未啟動，請再操作遊戲或使用音樂開關');
        return false;
      }).finally(() => { this.pending = null; });
      return this.pending;
    }
    fade(value) {
      if (!this.master || !this.context) return;
      const param = this.master.gain, now = this.context.currentTime;
      try { param.cancelScheduledValues(now); param.setTargetAtTime(value, now, .025); } catch (_) {}
    }
    makeStage() {
      if (this.stage) return;
      const context = this.context, input = context.createGain(), filter = context.createBiquadFilter(), output = context.createGain();
      filter.type = 'lowpass'; filter.frequency.value = this.score.cutoff; filter.Q.value = .35;
      input.connect(filter); filter.connect(output); output.connect(this.master);
      const stage = { input, filter, output, nodes:[input, filter, output], voices:new Set(), retired:false };
      this.stage = stage; this.filter = filter;
      // Optional native convolution gives instruments a small, shared room. Dry playback is always available.
      if (context.createConvolver && context.createBuffer) {
        try {
          if (!this.impulse) {
            const rate = context.sampleRate || 44100, length = Math.floor(rate * 1.35);
            this.impulse = context.createBuffer(2, length, rate);
            let seed = 1537;
            for (let channel = 0; channel < 2; channel++) {
              const samples = this.impulse.getChannelData(channel);
              for (let i = 0; i < length; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                samples[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / length, 3.5);
              }
            }
          }
          const room = context.createConvolver(), wet = context.createGain();
          room.buffer = this.impulse; wet.gain.value = this.score.space;
          filter.connect(room); room.connect(wet); wet.connect(output); stage.nodes.push(room, wet);
        } catch (_) { /* Older/mobile contexts retain the same dry composition. */ }
      }
      this.tuneStage();
    }
    retireStage() {
      if (!this.stage || !this.context) return;
      const stage = this.stage, now = this.context.currentTime;
      this.stage = null; this.filter = null; stage.retired = true; stage.end = now + .06;
      this.retired.add(stage);
      try { stage.output.gain.cancelScheduledValues(now); stage.output.gain.setTargetAtTime(0, now, .009); } catch (_) {}
      for (const voice of stage.voices) this.cancelVoice(voice, now + .045);
      if (!stage.voices.size) this.disposeStage(stage);
    }
    disposeStage(stage) {
      for (const node of stage.nodes) { try { node.disconnect(); } catch (_) {} }
      this.retired.delete(stage);
    }
    cancelVoice(voice, end) {
      voice.end = Math.min(voice.end, end);
      try { voice.source.stop(voice.end); } catch (_) {}
    }
    cleanup() {
      const now = this.context?.currentTime || 0;
      for (const voice of [...this.voices]) if (voice.end <= now) this.release(voice);
      for (const stage of [...this.retired]) if (stage.end <= now) this.disposeStage(stage);
    }
    fail(message) { this.stop(); this.message = message; this.emit(); }
    stop() {
      const now = this.context?.currentTime || 0;
      if (this.playing) {
        // Keep the first unheard onset, including swing, rather than replaying/skipping lookahead.
        const queued = this.scheduledSteps.find(item => item.time > now);
        if (queued) this.step = queued.step;
      }
      this.scheduledSteps = [];
      this.playing = false;
      if (this.interval !== null) { this.timer.clearInterval(this.interval); this.interval = null; }
      this.fade(0); this.retireStage();
      for (const voice of this.voices) this.cancelVoice(voice, now + .045);
      this.cleanup();
    }
    pause() {
      if (this.destroyed) return;
      this.paused = true; this.stop();
      if (this.enabled && this.available) this.message = '背景音樂暫停，回到遊戲後恢復';
      this.emit();
    }
    resume() {
      if (this.destroyed) return Promise.resolve(false);
      this.paused = false;
      if (this.enabled && this.unlocked) return this.activate();
      this.message = this.enabled ? this.idleMessage() : '背景音樂已關閉'; this.emit(); return Promise.resolve(false);
    }
    schedule() {
      if (!this.playing || this.paused || !this.enabled || this.destroyed) return;
      if (this.context.state !== 'running') { this.fail('背景音樂暫時中斷，請再操作遊戲恢復'); return; }
      this.cleanup();
      const now = this.context.currentTime, score = this.score, duration = 30 / score.bpm;
      this.scheduledSteps = this.scheduledSteps.filter(item => item.time > now);
      // Throttled background timers must never replay a backlog of notes.
      if (this.nextTime < now) this.nextTime = now + .04;
      while (this.nextTime < now + .32) {
        const time = this.nextTime + (this.step % 2 ? duration * score.swing : 0);
        this.scheduledSteps.push({ step:this.step, time });
        const quiet = quietScenes.has(this.scene);
        for (const event of catalog.eventsForStep(score, this.step)) {
          if (event.drum) { if (!quiet) this.drum(event, time); }
          else this.tone(event.note, time, event.length * duration, event.level, event.instrument, event.pan);
        }
        this.step = (this.step + 1) % (score.steps * score.bars); this.nextTime += duration;
      }
    }
    wave(instrument) {
      if (!this.context.createPeriodicWave) return null;
      if (!this.waves.has(instrument)) {
        const harmonics = instruments[instrument].harmonics;
        this.waves.set(instrument, this.context.createPeriodicWave(new Float32Array(harmonics.length + 1), new Float32Array([0, ...harmonics])));
      }
      return this.waves.get(instrument);
    }
    attachVoice(source, gain, start, length, { stage = this.stage, pan = 0, extra = [] } = {}) {
      const nodes = [gain, ...extra]; source.connect(gain);
      let output = gain;
      if (pan && this.context.createStereoPanner) {
        const panner = this.context.createStereoPanner(); panner.pan.value = pan;
        gain.connect(panner); nodes.push(panner); output = panner;
      }
      output.connect(stage ? stage.input : this.master);
      const voice = { source, gain, nodes, stage, start, end:start + length + .02 };
      this.voices.add(voice); stage?.voices.add(voice);
      source.onended = () => this.release(voice);
      source.start(start); source.stop(voice.end); return voice;
    }
    tone(midi, start, length, level, instrument, pan = 0) {
      const profile = instruments[instrument] || instruments.felt;
      const source = this.context.createOscillator(), gain = this.context.createGain();
      const wave = this.wave(instruments[instrument] ? instrument : 'felt');
      if (wave && source.setPeriodicWave) source.setPeriodicWave(wave); else source.type = 'sine';
      source.frequency.value = frequency(midi);
      if (source.detune) source.detune.value = profile.detune || 0;
      const attack = Math.min(profile.attack, length * .18), decay = Math.min(attack + .14, length * .55);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + attack);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, level * profile.sustain), start + decay);
      gain.gain.exponentialRampToValueAtTime(.0001, start + length);
      this.attachVoice(source, gain, start, length, { pan });
    }
    drum(event, start) {
      const context = this.context, gain = context.createGain(); let source;
      if (event.drum === 'brush' && context.createBuffer) {
        if (!this.noise) {
          this.noise = context.createBuffer(1, Math.floor((context.sampleRate || 44100) * .13), context.sampleRate || 44100);
          const samples = this.noise.getChannelData(0); let seed = 947;
          for (let i = 0; i < samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; samples[i] = seed / 2147483648 - 1; }
        }
        source = context.createBufferSource(); source.buffer = this.noise;
      } else {
        source = context.createOscillator(); source.type = 'sine';
        source.frequency.setValueAtTime(event.drum === 'pulse' ? 104 : 610, start);
        source.frequency.exponentialRampToValueAtTime(event.drum === 'pulse' ? 48 : 260, start + event.length);
      }
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(event.level, start + .005);
      gain.gain.exponentialRampToValueAtTime(.0001, start + event.length);
      this.attachVoice(source, gain, start, event.length, { pan:event.pan || 0 });
    }
    loadEffects() {
      if (this.effectLoadStarted || !root.fetch || !this.context?.decodeAudioData) return;
      this.effectLoadStarted = true;
      const context = this.context;
      this.effectRequests = ['menu', 'confirm', 'clue'].map(kind => {
        const url = root.RPG_EFFECT_ASSETS?.[kind] || ((root.RPG_ASSET_BASE || 'assets/') + 'audio/' + kind + '.mp3');
        return root.fetch(url).then(response => {
          if (!response.ok) throw new Error('Effect unavailable');
          return response.arrayBuffer();
        }).then(bytes => this.destroyed ? null : context.decodeAudioData(bytes))
          .then(buffer => { if (!this.destroyed && buffer) this.effects.set(kind, buffer); }).catch(() => {});
      });
    }
    effect(kind = 'confirm') {
      if (!this.unlocked || !this.enabled || this.paused || this.destroyed || !this.playing || this.context?.state !== 'running' || this.volume === 0) return;
      const now = this.context.currentTime, buffer = this.effects.get(kind === 'discovery' || kind === 'complete' ? 'clue' : kind);
      if (buffer) {
        const source = this.context.createBufferSource(), gain = this.context.createGain(); source.buffer = buffer; gain.gain.value = 1.1;
        this.attachVoice(source, gain, now, buffer.duration, { stage:null }); return;
      }
      const notes = kind === 'menu' ? [76] : kind === 'discovery' ? [72,76,79] : kind === 'complete' ? [72,76,79,84] : kind === 'step' ? [] : [69,74];
      notes.forEach((note, i) => this.note(note, now + i * .07, .18, .12, 'sine'));
    }
    // Retain the original small synthesised UI-effect voice, independent of dialogue ducking.
    note(midi, start, length, level, type = 'sine') {
      const source = this.context.createOscillator(), gain = this.context.createGain();
      source.type = type; source.frequency.value = frequency(midi);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level, start + Math.min(.035, length / 4));
      gain.gain.exponentialRampToValueAtTime(.0001, start + length);
      this.attachVoice(source, gain, start, length, { stage:null });
    }
    release(voice) {
      if (!this.voices.delete(voice)) return;
      try { voice.source.disconnect(); } catch (_) {}
      for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
      voice.stage?.voices.delete(voice);
      if (voice.stage?.retired && !voice.stage.voices.size) this.disposeStage(voice.stage);
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.stop();
      for (const voice of [...this.voices]) this.release(voice);
      for (const stage of [...this.retired]) this.disposeStage(stage);
      this.effects.clear(); this.waves.clear(); this.impulse = null; this.noise = null;
      try { this.master?.disconnect(); } catch (_) {}
      try { this.context?.close()?.catch?.(() => {}); } catch (_) {}
      this.message = '背景音樂已停止'; this.emit();
    }
  }
  return RPGMusic;
});
