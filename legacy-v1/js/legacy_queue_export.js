/* Read-only recovery for the retired v1 sync queue. No login, upload or storage writes. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.LegacyQueueBackup=api;if(root.document){const boot=()=>api.mount(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}}})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const KEY='ndmu-ethics-classroom:queue:v1',MAX_PARSE_CHARS=6400000,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v),exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
 function inspect(raw){
  if(raw===null)return {status:'empty',version:null,events:0,message:'此瀏覽器沒有舊待同步佇列；舊遊戲進度仍可由原遊戲選單下載。'};
  if(typeof raw!=='string')throw new Error('READ_INVALID');
  if(raw.length>MAX_PARSE_CHARS)return {status:'unverified',version:null,events:null,message:'舊佇列較大，為避免卡住而略過解析；備援保留完整原文，未傳送或改動紀錄。'};
  try{
   const q=JSON.parse(raw);if(!plain(q)||q.format!=='ndmu-ethics-classroom-queue'||![1,2].includes(q.version)||!Array.isArray(q.entries)||q.entries.length>2000)throw Error();
   const keys=q.version===2||Object.prototype.hasOwnProperty.call(q,'owners')?['format','version','owners','entries']:['format','version','entries'];if(!exact(q,keys)||keys.includes('owners')&&!Array.isArray(q.owners))throw Error();
   for(const o of q.owners||[])if(!exact(o,['profile','queueScope'])||typeof o.profile!=='string'||typeof o.queueScope!=='string')throw Error();
   const seen=new Set();for(const e of q.entries){
    if(!exact(e,['eventId','classId','queueScope','lineage','raw','status','receipt','tries','nextTryAt','error'])||!UUID.test(e.eventId)||seen.has(e.eventId)||typeof e.classId!=='string'||typeof e.queueScope!=='string'||typeof e.lineage!=='string'||typeof e.raw!=='string'||!['pending','synced'].includes(e.status)||!Number.isSafeInteger(e.tries)||e.tries<0||!Number.isFinite(e.nextTryAt)||typeof e.error!=='string')throw Error();
    const p=JSON.parse(e.raw);if(!exact(p,['format','version','eventId','classId','attempt','bonus'])||p.format!=='ndmu-ethics-class-attempt'||p.version!==1||p.eventId!==e.eventId||p.classId!==e.classId||!plain(p.attempt))throw Error();
    if(e.status==='pending'&&e.receipt!==null||e.status==='synced'&&(!plain(e.receipt)||e.receipt.ok!==true||e.receipt.eventId!==e.eventId))throw Error();seen.add(e.eventId);
   }
   return {status:'structure-checked',version:q.version,events:q.entries.length,message:'已核對 '+q.entries.length+' 筆舊佇列的基本結構。備援仍保留原文；這不是戰局重播驗證或已收件證明。'};
  }catch(_){return {status:'unverified',version:null,events:null,message:'舊佇列格式無法核對；備援將保留完整原文供復原，不會修補、覆寫或傳送。'};}
 }
 function backup(raw,at){const validation=inspect(raw);if(validation.status==='empty')return {validation,fileName:null,text:null};const date=at||new Date().toISOString();if(typeof date!=='string'||!/^\d{4}-\d\d-\d\dT/.test(date))throw Error('DATE_INVALID');return{validation,fileName:'國醫軍事倫理冒險-舊待同步備援-'+date.slice(0,10).replaceAll('-','')+'.json',text:JSON.stringify({format:'ndmu-ethics-legacy-queue-backup',version:1,exportedAt:date,clockSource:'device-untrusted',storageKey:KEY,validation,raw},null,2)};}
 function mount(document,host){const button=document.getElementById('legacy-queue-export'),status=document.getElementById('legacy-queue-export-status');if(!button||!status)return null;button.addEventListener('click',()=>{let raw;try{raw=host.localStorage.getItem(KEY);}catch(_){status.textContent='瀏覽器無法讀取舊待同步佇列，沒有變更任何內容。請保留此裝置並請老師協助。';return;}try{const result=backup(raw);status.textContent=result.validation.message;if(result.text===null)return;const blob=new host.Blob([result.text],{type:'application/json;charset=utf-8'}),url=host.URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=result.fileName;document.body.append(a);try{a.click();status.textContent+=' 已產生本機下載；請保管檔案，不要公開張貼。';}finally{a.remove();host.setTimeout(()=>host.URL.revokeObjectURL(url),1000);}}catch(_){status.textContent='這次無法準備下載；原佇列沒有改變，也沒有送到外部。請保留此裝置並稍後重試。';}});return {readOnly:true};}
 return Object.freeze({KEY,MAX_PARSE_CHARS,inspect,backup,mount});
});
