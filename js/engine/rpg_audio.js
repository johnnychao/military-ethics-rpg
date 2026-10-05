/* Original generated field BGM with local synth fallback. Audio starts only after user interaction. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.RPGMusic = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const BEAT = 60 / 84, STEP = BEAT / 2, STEPS = 128;
  const CHORDS = [[60,64,67],[57,60,64],[53,57,60],[55,59,62],
    [60,64,67],[57,60,64],[53,57,60],[55,59,62],
    [64,67,71],[57,60,64],[53,57,60],[55,59,62],
    [53,57,60],[55,59,62],[60,64,67],[55,59,62]];
  // 每列為一小節；空拍讓閱讀對話時仍有呼吸空間。
  const MELODY = [
    [72,0,76,74,72,0,67,0], [69,0,72,76,74,0,72,0],
    [69,0,72,0,77,76,72,0], [71,0,74,72,67,0,0,0],
    [72,0,76,0,79,76,74,0], [72,0,69,0,76,74,72,0],
    [69,72,0,76,77,0,76,0], [74,0,71,0,67,0,0,0],
    [76,0,79,0,83,79,76,0], [76,0,72,69,72,0,0,0],
    [77,0,76,72,69,0,72,0], [74,0,76,74,71,0,67,0],
    [69,0,72,0,77,76,72,0], [71,0,74,0,79,74,71,0],
    [72,0,76,74,72,0,67,0], [71,0,74,0,67,0,0,0]
  ];
  const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
  class RPGMusic {
    constructor({ onStatus, contextFactory, timer } = {}) {
      const Audio = root.AudioContext || root.webkitAudioContext;
      this.factory = contextFactory || (Audio ? () => new Audio() : null);
      this.timer = timer || { setInterval: (fn, ms) => root.setInterval(fn, ms), clearInterval: id => root.clearInterval(id) };
      this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
      this.enabled = true; this.volume = 0.2; this.paused = false; this.destroyed = false;
      this.scene = 'exploration'; this.playing = false; this.available = !!this.factory;
      this.message = this.available ? '操作遊戲後開始播放背景音樂' : '此瀏覽器不支援背景音樂，仍可繼續遊玩';
      this.context = null; this.master = null; this.filter = null; this.interval = null;
      this.pending = null; this.unlocked = false; this.step = 0; this.nextTime = 0;
      this.voices = new Set(); this.lastStatus = '';
      this.trackBuffer=null;this.trackSource=null;this.trackGain=null;this.trackRequest=null;this.trackOffset=0;this.trackStartedAt=0;this.trackFailed=false;this.effects=new Map();this.effectLoadStarted=false;
      this.emit();
    }
    getStatus() { return { enabled: this.enabled, volume: this.volume, playing: this.playing, available: this.available, message: this.message }; }
    emit() {
      const status = this.getStatus(), serialized = JSON.stringify(status);
      if (serialized === this.lastStatus) return;
      this.lastStatus = serialized;
      try { this.onStatus(status); } catch (_) { /* 狀態顯示失敗不影響遊戲或排程。 */ }
    }
    setEnabled(enabled) {
      if (this.destroyed) return this.getStatus();
      this.enabled = !!enabled;
      if (!this.enabled) { this.stop(); this.message = '背景音樂已關閉'; this.emit(); }
      else if (this.paused) { this.message = '背景音樂暫停，回到遊戲後恢復'; this.emit(); }
      else if (this.unlocked) this.activate();
      else { this.message = this.available ? '操作遊戲後開始播放背景音樂' : '此瀏覽器不支援背景音樂，仍可繼續遊玩'; this.emit(); }
      return this.getStatus();
    }
    setVolume(volume) {
      if (typeof volume !== 'number' || !Number.isFinite(volume)) return false;
      if (this.destroyed) return false;
      this.volume = Math.min(1, Math.max(0, volume));
      this.fade(this.playing ? this.volume * 0.65 : 0);
      this.emit(); return true;
    }
    setScene(scene) {
      if (this.destroyed) return;
      this.scene = typeof scene === 'string' ? scene : 'exploration';
      if (this.filter && this.context) {
        const cutoff = this.scene === 'tactics' ? 2600 : ['review','complete','outcome'].includes(this.scene) ? 1800 : 2200;
        try { this.filter.frequency.setTargetAtTime(cutoff, this.context.currentTime, 0.3); } catch (_) {}
      }
    }
    unlock() {
      if (this.destroyed || !this.enabled || this.paused) return Promise.resolve(false);
      if (!this.available) { this.emit(); return Promise.resolve(false); }
      return this.activate();
    }
    activate() {
      if (this.pending) return this.pending;
      if (this.destroyed || !this.enabled || this.paused) return Promise.resolve(false);
      if (this.playing && this.context?.state === 'running') return Promise.resolve(true);
      // 包裝在 Promise 中，包含建構器同步失敗與 autoplay resume 拒絕。
      this.pending = (async () => {
        if (!this.context) {
          try {
            this.context = this.factory();
            this.master = this.context.createGain(); this.master.gain.value = 0;
            this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass';
            this.filter.frequency.value = 2200; this.filter.Q.value = 0.35;
            this.filter.connect(this.master); this.master.connect(this.context.destination);
          } catch (error) {
            try { const closing = this.context?.close(); closing?.catch?.(() => {}); } catch (_) {}
            this.context = null; this.master = null; this.filter = null;
            throw error;
          }
        }
        if (this.context.state !== 'running') await this.context.resume();
        if (this.context.state !== 'running') throw new Error('blocked');
        this.unlocked = true;
        if (this.destroyed || !this.enabled || this.paused) return false;
        this.playing = true; this.message = '背景音樂播放中';
        this.nextTime = this.context.currentTime + 0.06;
        this.fade(this.volume * 0.65);this.loadEffects(); if(this.trackBuffer)this.startTrack();else this.loadTrack(); this.schedule();
        if (this.interval === null) this.interval = this.timer.setInterval(() => {
          try { this.schedule(); } catch (_) { this.fail('背景音樂排程失敗，可繼續遊玩'); }
        }, 120);
        this.emit(); return true;
      })().catch(() => {
        if (this.destroyed) return false;
        this.fail('背景音樂尚未啟動，請再操作遊戲或使用音樂開關');
        return false;
      }).finally(() => { this.pending = null; });
      return this.pending;
    }
    fade(value) {
      if (!this.master || !this.context) return;
      const param = this.master.gain, now = this.context.currentTime;
      try { param.cancelScheduledValues(now); param.setTargetAtTime(value, now, 0.025); } catch (_) {}
    }
    fail(message) { this.stop(); this.message = message; this.emit(); }
    stop() {
      if(this.trackSource&&this.context){this.trackOffset=(this.trackOffset+this.context.currentTime-this.trackStartedAt)%this.trackBuffer.duration;const source=this.trackSource,gain=this.trackGain;this.trackSource=null;this.trackGain=null;try{source.stop(this.context.currentTime+.08);}catch(_){}source.onended=()=>{try{source.disconnect();gain?.disconnect();}catch(_){}};}
      this.playing = false;
      if (this.interval !== null) { this.timer.clearInterval(this.interval); this.interval = null; }
      this.fade(0);
      const now = this.context?.currentTime || 0;
      for (const voice of this.voices) {
        try { voice.source.stop(now + 0.08); } catch (_) {}
        // 預約尚未開始的聲音也會取消；已開始的聲音留 80ms 淡出。
      }
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
      this.message = !this.enabled ? '背景音樂已關閉' : this.available ? '操作遊戲後開始播放背景音樂' : '此瀏覽器不支援背景音樂，仍可繼續遊玩';
      this.emit(); return Promise.resolve(false);
    }
    schedule() {
      if (!this.playing || this.paused || !this.enabled || this.destroyed) return;
      if (this.context.state !== 'running') { this.fail('背景音樂暫時中斷，請再操作遊戲恢復'); return; }
      if(this.trackSource)return;
      const now = this.context.currentTime;
      for (const voice of this.voices) if (voice.end < now) this.release(voice);
      // 瀏覽器計時器延遲時，從目前位置續奏，不補播積壓的音符。
      if (this.nextTime < now) this.nextTime = now + 0.04;
      while (this.nextTime < now + 0.38) {
        const bar = Math.floor(this.step / 8), beat = this.step % 8, chord = CHORDS[bar];
        const time = this.nextTime, melody = MELODY[bar][beat];
        const quiet = ['review','complete','outcome'].includes(this.scene);
        if (melody) this.note(melody, time, STEP * 1.8, quiet ? 0.095 : 0.13, 'triangle');
        if (beat % 2 === 0) {
          this.note(chord[(beat / 2) % 3], time, STEP * 2.5, 0.065, 'sine');
          if (beat === 0 || beat === 4) this.note(chord[beat === 0 ? 0 : 2] - 24, time, STEP * 3.5, 0.11, 'sine');
          // 柔和短音作為輕節奏，不使用尖銳方波或高音警示聲。
          if (!quiet) this.note(beat === 0 ? 36 : 48, time, 0.075, this.scene === 'tactics' ? 0.045 : 0.025, 'sine');
        }
        this.step = (this.step + 1) % STEPS; this.nextTime += STEP;
      }
    }
    loadTrack() {
      if(this.trackRequest||this.trackBuffer||this.trackFailed||!root.fetch||!this.context?.decodeAudioData)return;
      const url=root.RPG_AUDIO_TRACK||((root.RPG_ASSET_BASE||'assets/')+'audio/morning-base.mp3');
      this.trackRequest=root.fetch(url).then(r=>{if(!r.ok)throw new Error('track unavailable');return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{if(this.destroyed)return;this.trackBuffer=buffer;if(this.playing&&!this.paused&&this.enabled)this.startTrack();}).catch(()=>{this.trackFailed=true;if(this.playing)this.message='本機合成配樂播放中';this.emit();}).finally(()=>this.trackRequest=null);
    }
    startTrack(){
      if(!this.trackBuffer||this.trackSource||!this.playing||this.paused||!this.enabled||this.destroyed)return;
      const now=this.context.currentTime;
      for(const voice of this.voices){try{voice.source.stop(now+.04);}catch(_){}}
      const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.trackBuffer;source.loop=true;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.86,now+.8);source.connect(gain);gain.connect(this.master);this.trackSource=source;this.trackGain=gain;this.trackStartedAt=now;source.start(now,this.trackOffset||0);this.message='探索配樂播放中';this.emit();
    }
    loadEffects(){
      if(this.effectLoadStarted||!root.fetch||!this.context?.decodeAudioData)return;this.effectLoadStarted=true;
      this.effectRequests=['menu','confirm','clue'].map(kind=>{const url=root.RPG_EFFECT_ASSETS?.[kind]||((root.RPG_ASSET_BASE||'assets/')+'audio/'+kind+'.mp3');return root.fetch(url).then(r=>{if(!r.ok)throw new Error('effect unavailable');return r.arrayBuffer();}).then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{if(!this.destroyed)this.effects.set(kind,buffer);}).catch(()=>{});});
    }
    effect(kind='confirm'){
      if(!this.unlocked||!this.enabled||this.paused||this.destroyed||this.context?.state!=='running'||this.volume===0)return;
      const now=this.context.currentTime,buffer=this.effects.get(kind==='discovery'||kind==='complete'?'clue':kind);
      if(buffer){const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=1.1;source.connect(gain);gain.connect(this.master);const voice={source,gain,end:now+buffer.duration+.02};this.voices.add(voice);source.onended=()=>this.release(voice);source.start(now);return;}
      const notes=kind==='menu'?[76]:kind==='discovery'?[72,76,79]:kind==='complete'?[72,76,79,84]:kind==='step'?[]:[69,74];
      notes.forEach((n,i)=>this.note(n,now+i*.07,.18,.12,'sine'));
    }
    note(midi, start, length, level, type) {
      const source = this.context.createOscillator(), gain = this.context.createGain();
      source.type = type; source.frequency.value = frequency(midi);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + Math.min(0.035, length / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      source.connect(gain); gain.connect(this.filter);
      const voice = { source, gain, end: start + length + 0.015 };
      this.voices.add(voice); source.onended = () => this.release(voice);
      source.start(start); source.stop(voice.end);
    }
    release(voice) {
      if (!this.voices.delete(voice)) return;
      try { voice.source.disconnect(); voice.gain.disconnect(); } catch (_) {}
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.stop();
      for (const voice of [...this.voices]) this.release(voice);
      this.effects.clear();try { this.filter?.disconnect(); this.master?.disconnect(); } catch (_) {}
      try { const closing = this.context?.close(); if (closing?.catch) closing.catch(() => {}); } catch (_) {}
      this.message = '背景音樂已停止'; this.emit();
    }
  }
  return RPGMusic;
});
