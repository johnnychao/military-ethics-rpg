'use strict';
/* Build an isolated, auditable preview. Nothing in this file changes production
 * entry points, authentication configuration, classroom data, or legacy saves. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),PREFIX='preview/tactical-v2';
const CORE=[
 'js/data/rpg_chapters.js','js/data/rpg_bonus_content.js','js/engine/rpg_bonus.js',
 'js/engine/rpg_avatar.js','js/data/rpg_music.js','js/engine/rpg_audio.js',
 'js/tactical/tactical_missions.js','js/tactical/tactical_engine.js',
 'js/tactical/tactical_store.js','js/tactical/tactical_assets.js',
 'js/tactical/tactical_renderer.js','js/tactical/tactical_app.js'
];
const STYLES=['css/tactical.css'];
const ROLES=['guardian','scout','medic'];
const ASSET_CANDIDATES=[
 ...ROLES.flatMap(role=>['idle','move','attack','hit','heal','rescue'].flatMap(pose=>[`assets/tactical/${role}-${pose}.png`,`assets/tactical/${role}-alt-${pose}.png`])),
 ...['training-drone','civilian'].flatMap(role=>['idle','move','attack','hit','heal','rescue'].map(pose=>`assets/tactical/${role}-${pose}.png`)),
 ...ROLES.map(role=>`assets/tactical/${role}.png`),
 ...ROLES.flatMap(role=>[`assets/tactical/portrait-${role}.png`,`assets/tactical/portrait-${role}-alt.png`]),
 ...ROLES.map(role=>`assets/tactical/portrait-${role}.webp`),
 'assets/tactical/training-drone.png','assets/tactical/civilian.png',
 ...Array.from({length:13},(_,i)=>`assets/tactical/mission-${String(i+1).padStart(2,'0')}.webp`),
 ...ROLES.flatMap(role=>['select','attack','skill','rescue'].flatMap(cue=>[`assets/tactical/voice/${role}-${cue}.mp3`,`assets/tactical/voice/${role}-alt-${cue}.mp3`])),
 'assets/audio/menu.mp3','assets/audio/confirm.mp3','assets/audio/clue.mp3'
];
function assetFiles(){return ASSET_CANDIDATES.filter(p=>fs.existsSync(path.join(root,p)));}
function publicFiles(){return [`${PREFIX}/index.html`,...assetFiles().map(p=>`${PREFIX}/${p}`)];}
function safeInput(rel,allowed){if(!allowed.includes(rel)||rel.includes('..')||path.isAbsolute(rel))throw new Error('Unapproved tactical dependency: '+rel);const p=path.join(root,rel);if(fs.lstatSync(p).isSymbolicLink()||!fs.statSync(p).isFile())throw new Error('Invalid tactical input '+rel);return fs.readFileSync(p,'utf8');}
function build(){
 let html=fs.readFileSync(path.join(root,'tactical/index.html'),'utf8');
 const used=[];
 html=html.replace(/<link\s+rel="stylesheet"\s+href="\.\.\/([^"]+)"\s*\/?\s*>/g,(_,rel)=>{used.push(rel);return '<style>'+safeInput(rel,STYLES).replaceAll('</style','<\\/style')+'</style>';});
 html=html.replace(/<script(?:\s+defer)?\s+src="\.\.\/([^"]+)"\s*>\s*<\/script>/g,(_,rel)=>{used.push(rel);const script=safeInput(rel,CORE).replaceAll('../assets/','./assets/');return '<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>';});
 if(/<(?:script|link)\b[^>]+(?:src|href)="[^"#]+\.(?:js|css)"/i.test(html))throw new Error('Preview still has unbundled script or style');
 for(const required of ['js/tactical/tactical_engine.js','js/tactical/tactical_missions.js','js/tactical/tactical_store.js','js/tactical/tactical_app.js'])if(!used.includes(required))throw new Error('Missing core tactical module '+required);
 html=html.replaceAll('../assets/','./assets/').replaceAll('href="../privacy.html"','href="../../privacy.html"').replaceAll('href="../"','href="../../"').replaceAll('href="../#','href="../../#').replaceAll('href="../favicon.svg"','href="../../favicon.svg"');
 const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 html=html.replace('<head>',`<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
 if(/AKfy[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[a-zA-Z0-9]{20,}|BEGIN .*PRIVATE KEY/.test(html))throw new Error('Routing credential or secret-like content in preview');
 if(/classroom_sync_boot|classroom_sync_client|receipt_client\.js|ClassroomSyncConfig\s*=\s*\{\s*enabled\s*:\s*true/.test(html))throw new Error('Classroom integration prohibited in tactical preview');
 const out=path.join(root,PREFIX);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),html);
 const hashes={'index.html':crypto.createHash('sha256').update(html).digest('hex')};
 for(const rel of assetFiles()){
  const from=path.join(root,rel),to=path.join(out,rel);if(fs.lstatSync(from).isSymbolicLink()||!fs.statSync(from).isFile())throw new Error('Invalid tactical asset '+rel);
  const data=fs.readFileSync(from);if(data.length>15*1024*1024)throw new Error('Oversized tactical asset '+rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,data);hashes[rel]=crypto.createHash('sha256').update(data).digest('hex');
 }
 return {prefix:PREFIX,publicFiles:publicFiles(),bytes:Buffer.byteLength(html),hashes};
}
if(require.main===module)console.log(JSON.stringify(build(),null,2));
module.exports={build,publicFiles,assetFiles,CORE,STYLES,ASSET_CANDIDATES,PREFIX};
