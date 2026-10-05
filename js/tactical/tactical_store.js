/* Tactical v2 local records. Independent of every legacy game and classroom key.
 * Device timestamps and imported records are not proof of identity or attendance.
 * A successful save means validated JSON was read back exactly from local storage.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(null,require('../engine/rpg_avatar'),require('../engine/rpg_bonus'));
  else root.TacticalStore=factory(root.TacticalEngine,root.RPGAvatar,root.RPGBonus);
})(typeof globalThis!=='undefined'?globalThis:this,function(DefaultEngine,Avatar,Bonus){
'use strict';
const KEY='ndmu-ethics-tactical-preview:v2',FORMAT='ndmu-ethics-tactical-records',VERSION=2;
const SCHEMA_REVISION=2;
const ENGINE_VERSION='2.0.0',CONTENT_VERSION='tactical-2026-10-06-v1';
const MAX_BYTES=6*1024*1024,MAX_ATTEMPTS=130,LEGACY_KEY='ndmu-ethics-rpg:v1';
const SETTINGS={reducedMotion:false,musicEnabled:false,musicVolume:.2,voiceEnabled:true,voiceVolume:.65,coachEnabled:true};
const ROLES=['guardian','scout','medic'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
const copy=o=>JSON.parse(JSON.stringify(o));
const canonical=o=>Array.isArray(o)?o.map(canonical):plain(o)?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=m=>{throw new Error(m);};
const bytes=s=>typeof TextEncoder==='function'?new TextEncoder().encode(s).length:s.length*3;
const iso=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9._:-]{8,100}$/.test(s);
const chapter=s=>typeof s==='string'&&/^u(0[1-9]|1[0-3])$/.test(s);
function exact(o,keys,label){if(!plain(o)||Object.keys(o).length!==keys.length||keys.some(k=>!own(o,k)))fail(label+'欄位不正確。');}
function tree(o,depth=0){
 if(depth>80)fail('紀錄層數過多。');
 if(o===null||typeof o==='boolean')return;
 if(typeof o==='string'){if(o.length>MAX_BYTES)fail('文字過長。');return;}
 if(typeof o==='number'){if(!Number.isFinite(o))fail('紀錄含無效數值。');return;}
 if(Array.isArray(o)){if(o.length>10000||Object.keys(o).length!==o.length)fail('紀錄陣列不正確。');for(let i=0;i<o.length;i++){if(!own(o,i))fail('紀錄陣列不可缺項。');tree(o[i],depth+1);}return;}
 if(!plain(o))fail('紀錄不是支援的 JSON 資料。');
 for(const k of Object.keys(o)){if(['__proto__','constructor','prototype'].includes(k))fail('紀錄含不安全欄位。');tree(o[k],depth+1);}
}
function uuid(){
 const c=typeof globalThis!=='undefined'?globalThis.crypto:null;
 if(c&&typeof c.randomUUID==='function')return c.randomUUID();
 if(c&&typeof c.getRandomValues==='function'){const a=new Uint8Array(16);c.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;return [...a].map((n,i)=>([4,6,8,10].includes(i)?'-':'')+n.toString(16).padStart(2,'0')).join('');}
 fail('此瀏覽器無法產生可靠的紀錄識別碼，請使用新版瀏覽器。');
}
function validAppearance(v){
 if(!Avatar)fail('角色資料尚未載入。');
 exact(v,['version',...Object.keys(Avatar.catalog)],'角色外觀');
 if(v.version!==1)fail('角色版本不相容。');
 for(const [k,choices]of Object.entries(Avatar.catalog))if(!choices.some(c=>c.id===v[k]))fail('角色選項不正確。');
}
function normalizeProfile(input){
 if(!plain(input))fail('個人設定不正確。');
 const allowed=['nickname','appearance','squadAppearance','squadArtMode','settings'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('個人設定含未知欄位。');
 const p={nickname:input.nickname===undefined?'隊長':input.nickname,appearance:input.appearance===undefined?copy(Avatar.defaults):copy(input.appearance),squadAppearance:{},squadArtMode:{guardian:'illustrated',scout:'illustrated',medic:'illustrated',...(input.squadArtMode||{})},settings:{...SETTINGS,...(input.settings||{})}};
 if(typeof p.nickname!=='string'||p.nickname.trim().length<1||p.nickname.length>40)fail('暱稱請填 1–40 個字。');
 p.nickname=p.nickname.trim();validAppearance(p.appearance);
 if(input.squadAppearance!==undefined&&(!plain(input.squadAppearance)||Object.keys(input.squadAppearance).some(k=>!ROLES.includes(k))))fail('小隊造型欄位不正確。');
 for(const r of ROLES){p.squadAppearance[r]=copy(input.squadAppearance?.[r]||p.appearance);validAppearance(p.squadAppearance[r]);}
 if(input.squadArtMode!==undefined&&!plain(input.squadArtMode))fail('小隊美術選項不正確。');exact(p.squadArtMode,ROLES,'小隊美術模式');for(const v of Object.values(p.squadArtMode))if(!['illustrated','illustrated-alt','custom'].includes(v))fail('小隊美術模式不正確。');
 if(input.settings!==undefined&&!plain(input.settings))fail('設定格式不正確。');
 exact(p.settings,Object.keys(SETTINGS),'操作設定');
 for(const k of ['reducedMotion','musicEnabled','voiceEnabled','coachEnabled'])if(typeof p.settings[k]!=='boolean')fail('開關設定須為開或關。');
 for(const k of ['musicVolume','voiceVolume'])if(typeof p.settings[k]!=='number'||!Number.isFinite(p.settings[k])||p.settings[k]<0||p.settings[k]>1)fail('音量须在 0 至 1 之間。');
 return p;
}
class TacticalStore{
 constructor(options={}){
  this.Engine=options.Engine||DefaultEngine;
  if(!this.Engine&&typeof require==='function'){try{this.Engine=require('./tactical_engine');}catch(_){}}
  this.storage=options.storage;this.onWarning=typeof options.onWarning==='function'?options.onWarning:()=>{};
  this.clock=typeof options.now==='function'?options.now:()=>new Date().toISOString();
  this.makeId=typeof options.makeId==='function'?options.makeId:uuid;
  this.persisted=false;this.damagedRaw=null;this.recoveryRaw=null;this.baseRaw=null;this.warningMessages=new Set();
  this.validatedStates=new Map();this.lockState='unsupported';this.releaseWriteLock=null;
  const locks=options.lockManager||(typeof window!=='undefined'&&typeof navigator!=='undefined'?navigator.locks:null);
  if(locks&&typeof locks.request==='function'){this.lockState='pending';try{Promise.resolve(locks.request(KEY+':writer',{mode:'exclusive',ifAvailable:true},lock=>{this.lockState=lock?'owned':'unavailable';if(!lock){this.warn('新版遊戲已在另一個分頁開啟，本頁只暫存記憶體。請下載備份，或關閉另一頁後重新整理。');return;}return new Promise(resolve=>{this.releaseWriteLock=resolve;});})).catch(()=>{this.lockState='unavailable';this.warn('無法確認紀錄寫入鎖，本頁只保留記憶體，請下載備份。');});}catch(_){this.lockState='unavailable';}}
  this.data=this.fresh();
  try{const raw=this.storage?.getItem(KEY)||null;this.baseRaw=raw;if(raw){this.damagedRaw=raw;const parsed=this.migrate(JSON.parse(raw));this.validate(parsed);this.data=parsed;this.damagedRaw=null;this.persisted=true;}}
  catch(error){this.warn('原有新版紀錄無法讀取，已保留原文，不會覆寫。請先下載備份。'+error.message);}
 }
 fresh(){const t=this.clock();return {format:FORMAT,version:VERSION,schemaRevision:SCHEMA_REVISION,engineVersion:ENGINE_VERSION,contentVersion:CONTENT_VERSION,profileId:this.makeId(),createdAt:t,updatedAt:t,clockSource:'device-untrusted',profile:normalizeProfile({}),session:null,attempts:[],bonus:Bonus?Bonus.createState():null};}
 migrate(input){
  tree(input);const d=copy(input);if(d.format!==FORMAT||d.version!==VERSION)return d;
  if(d.schemaRevision!==undefined&&d.schemaRevision!==1)return d;
  const priorKeys=['format','version','engineVersion','contentVersion','profileId','createdAt','updatedAt','clockSource','profile','session','attempts','bonus'];if(own(d,'schemaRevision'))priorKeys.push('schemaRevision');exact(d,priorKeys,'早期戰棋存檔');
  exact(d.profile,['nickname','appearance','squadAppearance','squadArtMode','settings'],'早期個人設定');exact(d.profile.settings,Object.keys(SETTINGS).filter(k=>k!=='coachEnabled'),'早期操作設定');
  d.profile.settings.coachEnabled=true;d.schemaRevision=SCHEMA_REVISION;
  if(d.session!==null){exact(d.session,['attemptId','startedAt','state'],'早期目前挑戰');d.session.draft={reason:'',revisionCondition:''};}
  if(!Array.isArray(d.attempts))fail('挑戰紀錄格式不正確。');for(const a of d.attempts){exact(a,['attemptId','chapterId','startedAt','closedAt','closure','battle','learning'],'早期挑戰紀錄');a.draft=null;}
  return d;
 }
 draftValid(draft){exact(draft,['reason','revisionCondition'],'反思草稿');for(const v of Object.values(draft))if(typeof v!=='string'||v.length>6000)fail('反思草稿每欄最多 6000 字。');}
 warn(message){if(this.warningMessages.has(message))return;this.warningMessages.add(message);try{this.onWarning(message);}catch(_){}}
 stateValid(s){if(!this.Engine||typeof this.Engine.validateState!=='function')fail('戰棋引擎尚未載入。');const encoded=JSON.stringify(s);if(!this.validatedStates.has(encoded)){const r=this.Engine.validateState(s);if(r!==true&&!r?.ok)fail('戰況驗證失敗：'+(r?.errors?.[0]||'版本或資料不相容'));this.validatedStates.set(encoded,true);if(this.validatedStates.size>150)this.validatedStates.delete(this.validatedStates.keys().next().value);}if(!chapter(s.missionId))fail('找不到這個章節。');}
 terminal(s){return s&&s.phase==='complete'&&['won','lost'].includes(s.status);}
 validateAttempt(a){
  exact(a,['attemptId','chapterId','startedAt','closedAt','closure','battle','learning','draft'],'挑戰紀錄');
  if(!id(a.attemptId)||!chapter(a.chapterId)||!iso(a.startedAt)||!iso(a.closedAt)||!['finished','retry','left'].includes(a.closure))fail('挑戰紀錄資訊不正確。');
  this.stateValid(a.battle);if(a.battle.missionId!==a.chapterId)fail('章節紀錄不一致。');
  if(a.learning!==null){exact(a.learning,['reason','revision','completedAt','clockSource'],'反思紀錄');for(const k of ['reason','revision'])if(typeof a.learning[k]!=='string'||!a.learning[k].trim()||a.learning[k].length>6000)fail('兩欄反思都須填寫，且每欄最多 6000 字。');if(!iso(a.learning.completedAt)||a.learning.clockSource!=='device-untrusted'||!this.terminal(a.battle)||a.closure!=='finished')fail('學習完成紀錄不正確。');}
  if(a.draft!==null){this.draftValid(a.draft);if(a.learning!==null||!this.terminal(a.battle))fail('草稿不可冒充完成紀錄或套到未結束的戰況。');}
  if(a.closure==='finished'&&a.learning===null)fail('完成紀錄缺少反思。');
 }
 validate(d){
  tree(d);if(bytes(JSON.stringify(d))>MAX_BYTES)fail('紀錄超過 6 MB，請先備份。');
  exact(d,['format','version','schemaRevision','engineVersion','contentVersion','profileId','createdAt','updatedAt','clockSource','profile','session','attempts','bonus'],'存檔');
  if(d.format!==FORMAT||d.version!==VERSION||d.schemaRevision!==SCHEMA_REVISION||d.engineVersion!==ENGINE_VERSION||d.contentVersion!==CONTENT_VERSION||d.clockSource!=='device-untrusted')fail('不是新版戰棋 v2 紀錄；舊遊戲紀錄仍可回原版開啟。');
  if(!id(d.profileId)||!iso(d.createdAt)||!iso(d.updatedAt))fail('存檔資訊不正確。');
  exact(d.profile,['nickname','appearance','squadAppearance','squadArtMode','settings'],'個人設定');exact(d.profile.squadAppearance,ROLES,'小隊造型');exact(d.profile.squadArtMode,ROLES,'小隊美術模式');exact(d.profile.settings,Object.keys(SETTINGS),'操作設定');normalizeProfile(d.profile);
  if(!Array.isArray(d.attempts)||d.attempts.length>MAX_ATTEMPTS)fail('挑戰紀錄已達 130 份，請先下載備份。');
  const ids=new Set();for(const a of d.attempts){this.validateAttempt(a);if(ids.has(a.attemptId))fail('重複的挑戰編號。');ids.add(a.attemptId);}
  if(d.session!==null){exact(d.session,['attemptId','startedAt','state','draft'],'目前挑戰');this.draftValid(d.session.draft);if(!this.terminal(d.session.state)&&(d.session.draft.reason||d.session.draft.revisionCondition))fail('未結束的戰況不能預填反思草稿。');if(!id(d.session.attemptId)||!iso(d.session.startedAt)||ids.has(d.session.attemptId))fail('目前挑戰編號不正確。');this.stateValid(d.session.state);}
  if(Bonus){if(!Bonus.validateState(d.bonus))fail('支線紀錄不正確。');}else if(d.bonus!==null)fail('支線引擎尚未載入。');
  return true;
 }
 commit(next,options={}){
  try{next.updatedAt=this.clock();this.validate(next);const raw=JSON.stringify(next);this.data=next;
   if(['pending','unavailable'].includes(this.lockState)){this.persisted=false;this.warn('本頁尚未取得紀錄寫入權，操作只留在記憶體；請下載備份並保留原分頁。');return {ok:true,persisted:false,conflict:true,message:'本頁未取得寫入權，請下載紀錄備份。'};}
   if(this.damagedRaw&&!options.replaceDamaged){this.persisted=false;this.warn('新的操作暫留記憶體；損壞的原存檔仍保留，請立即匯出新版備份。');return {ok:true,persisted:false,message:'操作已在記憶體保留，尚未寫入瀏覽器。'};}
   try{if(!this.storage)throw new Error('無可用儲存空間');const current=this.storage.getItem(KEY)||null;if(current!==this.baseRaw&&!options.replaceExisting){this.persisted=false;this.warn('另一個分頁已更新紀錄。為避免覆蓋，新操作只留在本頁記憶體；請下載備份後重新整理。');return {ok:true,persisted:false,conflict:true,message:'偵測到其他分頁的紀錄，未覆寫；請下載本頁備份。'};}this.storage.setItem(KEY,raw);if(this.storage.getItem(KEY)!==raw)throw new Error('寫入後核對不一致');this.baseRaw=raw;this.persisted=true;if(options.replaceDamaged){this.recoveryRaw=this.damagedRaw||this.recoveryRaw;this.damagedRaw=null;}return {ok:true,persisted:true,message:'已在此瀏覽器保存。'};}
   catch(error){this.persisted=false;this.warn('儲存失敗，操作暫留記憶體，請下載紀錄備份。'+error.message);return {ok:true,persisted:false,message:'尚未確認儲存，請下載備份。'};}
  }catch(error){return {ok:false,persisted:this.persisted,message:error.message};}
 }
 result(data){return {ok:true,data:copy(data),persisted:this.persisted};}
 loadProfile(){return this.result(this.data.profile);}
 saveProfile(profile){try{tree(profile);const p=normalizeProfile(profile),next=copy(this.data);next.profile=p;return {...this.commit(next),data:copy(p)};}catch(e){return {ok:false,message:e.message};}}
 progress(){
  const completed={};for(const a of this.data.attempts){if(!a.learning)continue;const prev=completed[a.chapterId];completed[a.chapterId]={count:(prev?.count||0)+1,lastCompletedAt:a.learning.completedAt,lastOutcome:a.battle.status};}
  let summary=null;try{summary=Bonus?.getSummary(this.data.bonus);}catch(_){}
  return {unlocked:13,completed,collectibles:summary?.collectibles||[],puzzles:summary?.progress||{}};
 }
 loadProgress(){return this.result(this.progress());}
 saveProgress(progress){try{tree(progress);if(JSON.stringify(progress)!==JSON.stringify(this.progress()))fail('完成與支線進度由可驗證的實際紀錄產生，不能直接改寫。');return this.result(this.progress());}catch(e){return {ok:false,message:e.message};}}
 loadSession(){return {...this.result(this.data.session?.state||null),attemptId:this.data.session?.attemptId||null,draft:this.data.session?copy(this.data.session.draft):null};}
 saveDraft(attemptId,draft){try{if(!this.data.session||this.data.session.attemptId!==attemptId)return {ok:false,code:'draft-stale',message:'草稿不屬於目前挑戰，未覆寫任何紀錄。'};if(!this.terminal(this.data.session.state))fail('戰术結束後才能保存反思草稿。');tree(draft);this.draftValid(draft);const next=copy(this.data);next.session.draft=copy(draft);return {...this.commit(next),data:copy(draft),attemptId};}catch(e){return {ok:false,message:e.message};}}
 archive(next,closure){if(!next.session)return;const s=next.session;next.attempts.push({attemptId:s.attemptId,chapterId:s.state.missionId,startedAt:s.startedAt,closedAt:this.clock(),closure,battle:s.state,learning:null,draft:s.draft&&(s.draft.reason||s.draft.revisionCondition)?copy(s.draft):null});next.session=null;}
 startAttempt(state){try{this.stateValid(state);if(state.revision!==0||state.phase!=='player'||state.status!=='active'||(Array.isArray(state.commandLog)&&state.commandLog.length!==0))fail('新挑戰須從初始戰況開始；現有紀錄請使用匯入。');const next=copy(this.data);this.archive(next,'retry');next.session={attemptId:this.makeId(),startedAt:this.clock(),state:copy(state),draft:{reason:'',revisionCondition:''}};const result=this.commit(next);return {...result,data:copy(state),attemptId:next.session.attemptId};}catch(e){return {ok:false,message:e.message};}}
 saveSession(state){
  try{this.stateValid(state);if(!this.data.session)return this.startAttempt(state);const old=this.data.session.state;
   if(old.missionId!==state.missionId)fail('新章節請建立新的挑戰紀錄。');
   for(const k of ['format','version','engineVersion','contentVersion','decisionId'])if(!equal(old[k],state[k]))fail('新戰況的版本或決策不屬於這次挑戰。');
   if(Array.isArray(old.commandLog)&&(!Array.isArray(state.commandLog)||state.commandLog.length<old.commandLog.length||!old.commandLog.every((c,i)=>equal(c,state.commandLog[i]))))fail('新戰況未延續這次挑戰的行動紀錄。');
   if(state.revision<old.revision)fail('不接受過期的戰況；重試請建立新挑戰。');
   if(state.revision===old.revision&&!equal(state,old))fail('相同版本的戰況不一致。');
   const next=copy(this.data);next.session.state=copy(state);return {...this.commit(next),data:copy(state)};
  }catch(e){return {ok:false,message:e.message};}
 }
 clearSession(){const next=copy(this.data);this.archive(next,'left');return this.commit(next);}
 finishAttempt(state,reflection){
  try{this.stateValid(state);if(!this.terminal(state))fail('請先完成或結束這次戰術挑戰，再保存反思。');
   if(!plain(reflection)||Object.keys(reflection).some(k=>!['reason','revisionCondition'].includes(k)))fail('反思欄位不正確。');
   const reason=reflection.reason,revision=reflection.revisionCondition;
   for(const v of [reason,revision])if(typeof v!=='string'||!v.trim()||v.length>6000)fail('兩欄反思都須填寫，且每欄最多 6000 字。');
   const prior=this.data.attempts.find(a=>a.learning&&JSON.stringify(a.battle)===JSON.stringify(state)&&a.learning.reason===reason.trim()&&a.learning.revision===revision.trim());
   if(!this.data.session&&prior)return {...this.result(prior),duplicate:true};
   if(!this.data.session)fail('找不到這次挑戰，請先保存戰況。');
   const next=copy(this.data),s=next.session;if(!equal(s.state,state))fail('請先保存這次終局戰況，再填寫反思；不能混入另一份挑戰。');
   const t=this.clock(),a={attemptId:s.attemptId,chapterId:state.missionId,startedAt:s.startedAt,closedAt:t,closure:'finished',battle:copy(state),draft:null,learning:{reason:reason.trim(),revision:revision.trim(),completedAt:t,clockSource:'device-untrusted'}};
   next.attempts.push(a);next.session=null;return {...this.commit(next),data:copy(a)};
  }catch(e){return {ok:false,message:e.message};}
 }
 loadAttempts(){return this.result(this.data.attempts);}
 loadBonus(){return this.result(this.data.bonus);}
 saveBonus(state){try{if(!Bonus?.validateState(state))fail('支線紀錄不正確。');const next=copy(this.data);next.bonus=copy(state);return {...this.commit(next),data:copy(state)};}catch(e){return {ok:false,message:e.message};}}
 exportJSON(){return JSON.stringify(this.data,null,2);}
 exportDamagedJSON(){return this.damagedRaw||this.recoveryRaw;}
 importJSON(raw,options={}){
  try{if(!plain(options)||Object.keys(options).some(k=>k!=='replaceExisting')||(own(options,'replaceExisting')&&typeof options.replaceExisting!=='boolean'))fail('匯入選項不正確。');if(typeof raw!=='string'||bytes(raw)>MAX_BYTES)fail('匯入檔案須小於 6 MB。');const incoming=this.migrate(JSON.parse(raw));this.validate(incoming);
   if((this.damagedRaw||this.data.session||this.data.attempts.length||this.baseRaw)&&!options.replaceExisting)fail('請先下載目前備份，再確認以匯入檔取代新版紀錄。');
   const next=copy(incoming);const result=this.commit(next,{replaceDamaged:true,replaceExisting:options.replaceExisting===true});return {...result,data:copy(next)};
  }catch(e){return {ok:false,message:e.message};}
 }
 legacySummary(){
  try{const raw=this.storage?.getItem(LEGACY_KEY);if(!raw)return {ok:true,data:{exists:false,count:0}};if(bytes(raw)>2*1024*1024)return {ok:true,data:{exists:true,count:null,readable:false}};
   const old=JSON.parse(raw);if(old?.format!=='ndmu-ethics-rpg'||old.version!==1||!plain(old.records))return {ok:true,data:{exists:true,count:null,readable:false}};
   const count=Object.values(old.records).filter(r=>[r?.current,...(Array.isArray(r?.attempts)?r.attempts:[])].some(s=>s?.phase==='complete')).length;
   return {ok:true,data:{exists:true,count,readable:true,note:'舊版紀錄完整保留，沒有轉換成新版勝敗或點名。'}};
  }catch(_){return {ok:true,data:{exists:true,count:null,readable:false}};}
 }
}
Object.assign(TacticalStore,{KEY,FORMAT,VERSION,SCHEMA_REVISION,ENGINE_VERSION,CONTENT_VERSION,MAX_BYTES,MAX_ATTEMPTS,SETTINGS:Object.freeze(SETTINGS)});
return TacticalStore;
});
