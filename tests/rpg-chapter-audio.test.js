'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Music = require('../js/engine/rpg_audio');
const catalog = require('../js/data/rpg_music');
const chapters = require('../js/data/rpg_chapters').chapters;
function harness({ state = 'running', resume } = {}) {
  const sources = [], timers = new Map(), nodes = []; let timerId = 0, created = 0, closed = 0;
  const param = () => ({ value:0, events:[], cancelScheduledValues(t) { this.events.push(['cancel',t]); },
    setTargetAtTime(v,t) { this.value=v; this.events.push(['target',v,t]); },
    setValueAtTime(v,t) { this.value=v; this.events.push(['value',v,t]); },
    linearRampToValueAtTime(v,t) { this.value=v; this.events.push(['linear',v,t]); },
    exponentialRampToValueAtTime(v,t) { this.value=v; this.events.push(['exp',v,t]); } });
  const node = () => { const n = { gain:param(), frequency:param(), detune:param(), pan:param(), Q:param(), connections:[],
    connect(other) { this.connections.push(other); }, disconnect() { this.disconnected=true; this.connections=[]; },
    start(time) { this.started=time; }, stop(time) { this.stopped=time; }, setPeriodicWave(wave) { this.wave=wave; } }; nodes.push(n); return n; };
  const context = { currentTime:0, state, destination:{}, sampleRate:8000,
    createGain:node, createBiquadFilter:node, createConvolver:node, createStereoPanner:node,
    createPeriodicWave(real,imag) { return {real,imag}; },
    createBuffer(channels,length) { const data=Array.from({length:channels},()=>new Float32Array(length)); return { getChannelData:i=>data[i], duration:length/8000 }; },
    createOscillator() { const n=node(); sources.push(n); return n; },
    createBufferSource() { const n=node(); sources.push(n); return n; },
    resume() { return resume ? resume(context) : (context.state='running',Promise.resolve()); },
    close() { closed++; context.state='closed'; return Promise.resolve(); }
  };
  const music = new Music({ contextFactory:() => { created++; return context; }, timer:{
    setInterval(fn) { const id=++timerId; timers.set(id,fn); return id; }, clearInterval(id) { timers.delete(id); }
  }});
  function advance(time) { context.currentTime=time; for (const source of sources) if (!source.ended && source.stopped <= time) { source.ended=true; source.onended?.(); } for (const fn of [...timers.values()]) fn(); }
  return { music, context, sources, nodes, timers, advance, get created() { return created; }, get closed() { return closed; } };
}
const normalized = rows => { const first=rows.flat().find(n=>n); return rows.map(row=>row.map(n=>n ? n-first : null)); };

test('all thirteen actual chapters have an immutable original sixteen-bar score', () => {
  assert.deepEqual(catalog.scores.map(score=>score.id), chapters.map(chapter=>chapter.id));
  assert.equal(new Set(catalog.scores.map(score=>score.title)).size,13);
  for (const score of catalog.scores) {
    assert.equal(score.original,true); assert.equal(score.bars,16); assert.ok(Object.isFrozen(score.melody[0]));
    assert.equal(score.melody.length,8); assert.equal(score.chords.length,8); assert.equal(score.answer.length,8);
    assert.ok(score.bpm>=60 && score.bpm<=110);
    for (const row of score.melody) { assert.equal(row.length,score.steps); assert.ok(row.every(note=>note===0 || (note>=60 && note<=88))); }
    assert.ok(score.chords.every(chord=>chord.length===4 && chord.every(note=>note>=48 && note<=84)));
    for (const key of ['arpPattern','bassPattern','kick','tick']) assert.equal(score[key].length,score.steps);
    assert.ok(score.arpPattern.every(index=>index>=-1 && index<4));
    assert.ok(score.bassPattern.every(index=>index>=-1 && index<4));
  }
  assert.equal(catalog.get('u14'),null);
});
test('chapters differ in melodies and harmony beyond simple transposition, plus rhythm and orchestration', () => {
  assert.equal(new Set(catalog.scores.map(score=>JSON.stringify(normalized(score.melody)))).size,13);
  assert.equal(new Set(catalog.scores.map(score=>JSON.stringify(normalized(score.chords)))).size,13);
  assert.equal(new Set(catalog.scores.map(score=>JSON.stringify([score.arpPattern,score.bassPattern,score.kick,score.tick]))).size,13);
  assert.equal(new Set(catalog.scores.map(score=>[score.lead,score.pad,score.arp,score.bass].join(':'))).size,13);
  assert.ok(new Set(catalog.scores.map(score=>score.meter)).size>=4);
});
test('every composed event has safe notes, levels and timing and its second section has new orchestration', () => {
  for (const score of catalog.scores) {
    let count=0;
    for (let step=0;step<score.steps*score.bars;step++) for (const event of catalog.eventsForStep(score,step)) {
      count++; assert.ok(event.level>0 && event.level<=.12); assert.ok(event.length>0 && Number.isFinite(event.length));
      if (!event.drum) { assert.ok(event.note>=28 && event.note<=90); assert.equal(typeof event.instrument,'string'); }
    }
    assert.ok(count>150 && count<500,score.id+': a bounded, arranged score');
    assert.notDeepEqual(catalog.eventsForStep(score,0),catalog.eventsForStep(score,score.steps*8));
  }
});
test('chapter selection, scene changes, resume and volume cannot bypass the first gesture', async () => {
  const h=harness(); h.music.setChapter('u12'); h.music.setScene('tactics'); h.music.setVolume(.8); await h.music.resume(); h.music.effect();
  assert.equal(h.created,0); assert.equal(h.sources.length,0); assert.equal(h.timers.size,0);
  assert.equal(h.music.getStatus().chapterId,'u12'); assert.equal(h.music.getStatus().title,'守護微光'); h.music.destroy();
});
test('invalid chapters are rejected and the current chapter selection is idempotent', async () => {
  const h=harness(); await h.music.unlock(); const n=h.sources.length, stage=h.music.stage, step=h.music.step;
  assert.equal(h.music.setChapter('u99'),false); assert.equal(h.music.setChapter(null),false); assert.equal(h.music.setChapter('u01'),true);
  assert.equal(h.music.stage,stage); assert.equal(h.music.step,step); assert.equal(h.sources.length,n); h.music.destroy();
});
test('switches stop every old scheduled voice before the new chapter begins, without another timer', async () => {
  const h=harness(); await h.music.unlock(); const old=[...h.music.voices], oldStage=h.music.stage;
  h.music.setChapter('u07'); assert.equal(h.timers.size,1); assert.equal(h.music.getStatus().chapterId,'u07');
  assert.ok(old.every(voice=>voice.source.stopped<=.045));
  assert.ok([...h.music.voices].filter(voice=>voice.stage===h.music.stage).every(voice=>voice.start>=.09));
  assert.equal(oldStage.output.gain.value,0); assert.notEqual(h.music.stage,oldStage);
  h.advance(.15); assert.equal(h.music.retired.size,0); assert.ok(old.every(voice=>voice.source.disconnected)); h.music.destroy();
});
test('130 rapid chapter changes release every retired stage and source', async () => {
  const h=harness(); await h.music.unlock();
  for (let i=0;i<130;i++) h.music.setChapter(catalog.scores[i%13].id);
  assert.equal(h.timers.size,1); h.advance(.2); assert.equal(h.music.retired.size,0);
  assert.ok([...h.music.voices].every(voice=>voice.stage===h.music.stage)); assert.ok(h.music.voices.size<30);
  h.music.destroy(); assert.equal(h.timers.size,0); assert.equal(h.music.voices.size,0); assert.equal(h.closed,1);
});
test('muted or paused chapter switches never create sound or restart the scheduler', async () => {
  const h=harness(); await h.music.unlock(); h.music.setEnabled(false); const n=h.sources.length;
  for(const score of catalog.scores) h.music.setChapter(score.id);
  await h.music.unlock(); await h.music.resume(); assert.equal(h.sources.length,n); assert.equal(h.timers.size,0);
  h.music.setEnabled(true); await h.music.pending; h.music.pause(); const m=h.sources.length;
  h.music.setChapter('u04'); await h.music.unlock(); assert.equal(h.sources.length,m); assert.equal(h.timers.size,0);
  await h.music.resume(); assert.equal(h.music.getStatus().chapterId,'u04'); assert.equal(h.timers.size,1); h.music.destroy();
});
test('dialogue and reflection duck only music while preserving volume and effects', async () => {
  const h=harness(); await h.music.unlock(); h.music.setVolume(.5); const master=h.music.master.gain.value;
  h.music.setScene('dialogue'); assert.equal(h.music.stage.output.gain.value,.48); assert.equal(h.music.master.gain.value,master);
  h.music.effect('menu'); assert.equal([...h.music.voices].at(-1).stage,null);
  h.music.setChapter('u09'); assert.equal(h.music.stage.output.gain.value,.48);
  h.music.setScene('exploration'); assert.equal(h.music.stage.output.gain.value,1);
  h.music.setScene('review'); assert.equal(h.music.stage.output.gain.value,.48); assert.equal(h.music.volume,.5);
  h.music.setVolume(0); assert.equal(h.music.master.gain.value,0); h.music.destroy();
});
test('pause before the first onset resumes at the first step, never the last bar', async () => {
  const h=harness(); await h.music.unlock(); assert.equal(h.music.step,1); h.music.pause(); assert.equal(h.music.step,0);
  h.advance(1); await h.music.resume(); assert.equal(h.music.step,1); h.music.destroy();
});
test('pause after a heard onset retains the next unheard step', async () => {
  const h=harness(); await h.music.unlock(); h.context.currentTime=.15; h.music.pause(); assert.equal(h.music.step,1);
  h.advance(1); await h.music.resume(); assert.equal(h.music.step,2); h.music.destroy();
});
test('one hundred background/foreground cycles leave exactly one scheduler and no retired graphs', async () => {
  const h=harness(); await h.music.unlock();
  for (let i=0;i<100;i++) { h.music.pause(); assert.equal(h.timers.size,0); h.advance(i+1); await h.music.resume(); assert.equal(h.timers.size,1); }
  h.advance(100.2); assert.equal(h.music.retired.size,0); assert.ok(h.music.voices.size<30); h.music.destroy();
});
test('an autoplay resume rejection is recoverable on a later explicit gesture', async () => {
  let attempts=0; const h=harness({state:'suspended',resume:context=>{attempts++; if(attempts===1)return Promise.reject(new Error('NotAllowedError')); context.state='running'; return Promise.resolve(); }});
  assert.equal(await h.music.unlock(),false); assert.equal(h.sources.length,0); assert.equal(h.timers.size,0);
  assert.equal(await h.music.unlock(),true); assert.equal(h.timers.size,1); assert.equal(h.created,1); h.music.destroy();
});
test('late context resume starts only the latest chapter with one shared pending activation', async () => {
  let resolve; const h=harness({state:'suspended',resume:context=>new Promise(r=>{resolve=()=>{context.state='running';r();};})});
  const a=h.music.unlock(), b=h.music.unlock(); assert.equal(a,b); h.music.setChapter('u13'); resolve();
  assert.equal(await a,true); assert.equal(h.music.getStatus().title,'共同前行'); assert.equal(h.timers.size,1);
  assert.ok([...h.music.voices].every(voice=>voice.stage===h.music.stage)); h.music.destroy();
});
for(const action of ['pause','mute','destroy']) test('pending activation stays silent after '+action, async () => {
  let resolve; const h=harness({state:'suspended',resume:context=>new Promise(r=>{resolve=()=>{context.state='running';r();};})});
  const pending=h.music.unlock(); if(action==='mute')h.music.setEnabled(false);else h.music[action](); resolve();
  assert.equal(await pending,false); assert.equal(h.sources.length,0); assert.equal(h.timers.size,0); assert.equal(h.music.playing,false); h.music.destroy();
});
test('suspended audio is reported and a new gesture recovers without stacking timers', async () => {
  const h=harness(); await h.music.unlock(); h.context.state='suspended'; h.music.schedule();
  assert.equal(h.music.playing,false); assert.equal(h.timers.size,0); await h.music.unlock(); assert.equal(h.timers.size,1); h.music.destroy();
});
test('a delayed timer schedules a small current window, never a backlog', async () => {
  const h=harness(); await h.music.unlock(); const n=h.sources.length; h.advance(600);
  assert.ok(h.sources.length-n<25); assert.ok([...h.music.voices].every(voice=>voice.start>=600)); h.music.destroy();
});
test('all thirteen chapters survive a full score without accumulating voices', async () => {
  const h=harness(); await h.music.unlock(); let time=0;
  for(const score of catalog.scores) {
    h.music.setChapter(score.id); const end=time+score.steps*score.bars*30/score.bpm;
    while(time<end) { time+=.15; h.advance(time); assert.ok(h.music.voices.size<60,score.id+' voice bound'); }
  }
  h.music.destroy(); assert.equal(h.music.voices.size,0); assert.equal(h.music.retired.size,0); assert.equal(h.timers.size,0);
});
test('destroy is final and idempotent and disconnects the complete graph', async () => {
  const h=harness(); await h.music.unlock(); h.music.setChapter('u11'); h.music.destroy(); h.music.destroy();
  assert.equal(h.closed,1); assert.equal(h.timers.size,0); assert.equal(h.music.voices.size,0); assert.equal(h.music.retired.size,0);
  assert.equal(h.music.setChapter('u02'),false); assert.equal(h.music.setVolume(.4),false);
  assert.equal(await h.music.unlock(),false); assert.equal(await h.music.resume(),false); assert.ok(h.nodes.every(node=>node.disconnected));
});

test('a swing-delayed onset is still unheard until its actual scheduled time', async () => {
  const h=harness(); h.music.setChapter('u05'); await h.music.unlock(); h.advance(.3);
  const pending=h.music.scheduledSteps.find(item=>item.step===1); assert.ok(pending.time>.45);
  h.context.currentTime=.45; h.music.pause(); assert.equal(h.music.step,1); h.music.destroy();
});
test('a gesture during a just-suspended context retires its old voices before rescheduling', async () => {
  const h=harness(); await h.music.unlock(); const old=[...h.music.voices]; h.context.state='suspended';
  await h.music.unlock(); assert.ok(old.every(voice=>voice.source.stopped<=.045)); assert.equal(h.timers.size,1); h.music.destroy();
});
