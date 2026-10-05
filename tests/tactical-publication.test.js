'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),Builder=require('../scripts/build-tactical-preview');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
test('tactical preview allowlist is confined to one isolated route and approved asset types',()=>{
 const files=Builder.publicFiles();assert.equal(new Set(files).size,files.length);assert.ok(files.includes('preview/tactical-v2/index.html'));
 for(const p of files){assert.ok(p.startsWith('preview/tactical-v2/'));assert.ok(!/(?:\.env|\.gs|\.csv|\.json|\.pdf|\.zip|collector|private|roster|source\/)/i.test(p));assert.ok(!p.includes('..'));}
});
test('tactical source loads neither legacy progress store nor classroom integration',()=>{
 const html=source('tactical/index.html');assert.ok(!/(?:classroom_sync|receipt_client|rpg_store|rpg_app|rpg_bonus_ui)\.js/.test(html));assert.ok(!/<script[^>]+src="https?:/i.test(html));
 const sources=[...html.matchAll(/<script[^>]+src="\.\.\/([^"]+)"/g)].map(m=>m[1]);for(const p of sources)assert.ok(Builder.CORE.includes(p),p);
});
test('isolated build inlines scripts and limits requests to same-origin sound assets and disables frames and forms',()=>{
 const result=Builder.build(),html=source(result.prefix+'/index.html');assert.match(html,/Content-Security-Policy/);assert.match(html,/connect-src 'self'/);assert.match(html,/frame-src 'none'/);assert.match(html,/form-action 'none'/);
 assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/<link[^>]+rel="stylesheet"/i.test(html));assert.ok(!/AKfy[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[a-zA-Z0-9]{20,}|BEGIN .*PRIVATE KEY/.test(html));
 assert.equal([...html.matchAll(/\bfetch\s*\(/g)].length,1,'Only the legacy audio asset loader may fetch');assert.ok(!/\b(?:XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(html));assert.match(html,/\['menu', 'confirm', 'clue'\]\.map\(kind/);
 assert.ok(!html.includes("setItem('ndmu-ethics-rpg:v1'"));assert.ok(html.includes('ndmu-ethics-tactical-preview:v2'));
 assert.ok(!/href="\.\.\/#/.test(html),'Root anchor links must leave both preview folders');if(html.includes('classroom-receipt'))assert.ok(html.includes('href="../../#classroom-receipt"'));
 for(const p of result.publicFiles)assert.ok(fs.statSync(path.join(root,p)).isFile());
});
test('asset manifest has no guessed remote URLs and every declared asset exists',()=>{
 const context={};vm.runInNewContext(source('js/tactical/tactical_assets.js'),context);const data=context.TacticalAssets;assert.equal(data.version,1);
 function walk(o){for(const v of Object.values(o)){if(typeof v==='string'){assert.ok(v.startsWith('../assets/tactical/'));assert.ok(!v.includes('://'));assert.ok(fs.existsSync(path.join(root,v.slice(3))),v);}else if(v&&typeof v==='object')walk(v);}}
 for(const k of ['sprites','portraits','backgrounds','props','effects'])walk(data[k]);
 for(const cues of Object.values(data.voices))for(const cue of Object.values(cues)){if(typeof cue==='string')walk({src:cue});else{walk({src:cue.src});assert.equal(typeof cue.text,'string');assert.ok(cue.text.trim());assert.ok(Number.isFinite(cue.durationSeconds)&&cue.durationSeconds>0&&cue.durationSeconds<10);}}
 for(const variants of Object.values(data.variants||{}))for(const v of Object.values(variants)){walk(v.sprites);walk({portrait:v.portrait});assert.match(v.voiceKey,/^(guardian|scout|medic)-alt$/);}if(data.keyArt)walk({keyArt:data.keyArt});
});
test('public tactical programs cannot send records, load external code or execute user strings',()=>{
 for(const p of Builder.CORE.filter(p=>p.startsWith('js/tactical/'))){if(!fs.existsSync(path.join(root,p)))continue;const code=source(p);assert.ok(!/\b(?:eval|Function)\s*\(/.test(code),p);assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(code),p);assert.ok(!/(?:https:\/\/script\.google|AKfy[a-zA-Z0-9_-]{20,})/.test(code),p);}
});
test('legacy entry and production identity/collection flags remain byte-identical to the reviewed baseline',()=>{
 const baseline=path.resolve(root,'../final_release_restore/public-source/military-ethics-rpg');
 if(!fs.existsSync(baseline))return;
 for(const p of ['index.html','js/rpg_app.js','js/engine/rpg_store.js','js/engine/rpg_engine.js','js/classroom_config.js','js/classroom_sync_config.js','js/classroom_sync_boot.js','js/classroom_sync_client.js','js/receipt_client.js'])assert.deepEqual(fs.readFileSync(path.join(root,p)),fs.readFileSync(path.join(baseline,p)),p);
});

test('layout harness only uses fixed ordinary iframe sizes and cannot change browser or game state',()=>{
 const html=source('tactical/qa-layout.html');assert.match(html,/src="index.html"/);assert.match(html,/不模擬手機硬體、觸控或使用者代理/);assert.match(html,/frame-src 'self'/);assert.match(html,/connect-src 'none'/);assert.match(html,/phone:\[390,844\]/);assert.match(html,/laptop:\[1165,757\]/);assert.ok(!/localStorage|sessionStorage|\.contentWindow|\.contentDocument|fetch\(|XMLHttpRequest|WebSocket|userAgent\s*=|eval\(/.test(html));assert.ok(Builder.publicFiles().includes('preview/tactical-v2/qa-layout.html'));
});
