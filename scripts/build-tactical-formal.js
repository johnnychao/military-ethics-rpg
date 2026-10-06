'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),Preview=require('./build-tactical-preview');
const LEGACY_FILES=require('./tactical-legacy-files.json');
const LEGACY_NOTICE='<aside id="classroom-auto-sync" class="classroom-receipt" aria-label="舊版同步說明"><h2>舊版紀錄與原當堂收件</h2><p>此備援頁保留舊版遊戲、原有本機紀錄與當堂手動收件。為避免舊版多分頁綁定風險，本頁不再啟動全班自動同步；已收件歷史與帳號權限不變。</p><p><a href="../">前往國醫軍事倫理冒險新版，登入並同意班級同步</a>。當堂出席仍依老師指定流程核實，不以戰術勝敗自動判定。</p><button type="button" id="legacy-queue-export">下載舊待同步備份</button><p id="legacy-queue-export-status" role="status">僅下載此裝置的原始待同步文字，不登入、不傳送、不改動資料，也不代表已收件。</p></aside>';
function legacyEntryFor(html){return html.replace(/<script(?:\s+defer)?\s+src="js\/classroom_sync_(?:config|client|boot)\.js"\s*>\s*<\/script>/g,'').replace('  <script defer src="js/data/rpg_chapters.js">','  <script>window.RPGRuntimeConfig=Object.freeze({mode:\'formal\'});</script>\n  <script defer src="js/data/course_schedule.js"></script>\n  <script defer src="js/data/rpg_chapters.js">').replace('<body>','<body>\n'+LEGACY_NOTICE).replace('</body>','<script src="js/legacy_queue_export.js" defer></script>\n</body>');}
const MODULES=['js/data/course_schedule.js','js/tactical/tactical_classroom_config.js','js/tactical/tactical_classroom_client.js'];
const safeFile=rel=>{if(rel.includes('..')||path.isAbsolute(rel))throw new Error('Unsafe public input');const file=path.join(root,rel);if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw new Error('Invalid public input');return fs.readFileSync(file,'utf8');};
function legacyPublicFiles(){return [...LEGACY_FILES.map(p=>'legacy-v1/'+p),'legacy-v1/js/legacy_queue_export.js','legacy-v1/js/data/course_schedule.js'];}
function formalPublicFiles(){return [...Preview.assetFiles(),...MODULES];}
function build(){
 const preview=Preview.build();let html=safeFile(preview.prefix+'/index.html');
 // The preview artifact is never modified. Production has its own save and queue.
 const runtime="window.TacticalRuntimeConfig=Object.freeze({mode:'formal',legacyUrl:'./legacy-v1/',attendanceUrl:'./legacy-v1/#classroom-receipt'});if(['#classroom-receipt','#classroom-auto-sync'].includes(location.hash)){location.replace('./legacy-v1/'+location.hash);}";
 const scripts=MODULES.map(p=>'<script>'+safeFile(p).replace(/<\/script/gi,'<\\/script')+'</script>').join('\n');
 const bootstrap='<script>'+runtime+'</script>\n'+scripts+'\n';
 html=html.replace('<body>','<body>\n'+bootstrap).replaceAll('href="../../privacy.html"','href="./privacy.html"').replaceAll('href="../../favicon.svg"','href="./favicon.svg"');
 html=html.replaceAll('href="../../#classroom-receipt"','href="./legacy-v1/#classroom-receipt"').replaceAll('href="../../"','href="./legacy-v1/"');
 if(!html.includes("mode:'formal'")||!html.includes('tactical-classroom-bridge-v2'))throw new Error('Formal integration missing');
 for(const p of legacyPublicFiles())safeFile(p);
 fs.writeFileSync(path.join(root,'index.html'),html);
 return {bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex'),legacyFiles:legacyPublicFiles().length,publicFiles:formalPublicFiles()};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={legacyEntryFor,LEGACY_NOTICE,build,formalPublicFiles,legacyPublicFiles,LEGACY_FILES,MODULES};
