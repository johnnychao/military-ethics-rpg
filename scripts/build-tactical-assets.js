'use strict';
/* Only approved game assets are referenced. Source sheets, manifests, audit
 * files, and unverified recordings never become browser dependencies. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
function build(){
 const data={version:1,sprites:{},portraits:{},voices:{},backgrounds:{},variants:{},props:{},effects:{},keyArt:null,voiceDisclosure:'AI合成角色旁白，未模仿真人。'};
 const exists=p=>fs.existsSync(path.join(root,p))&&!fs.lstatSync(path.join(root,p)).isSymbolicLink();
 const url=p=>'../'+p;
 for(const role of ['guardian','scout','medic']){
  const poses={};for(const pose of ['idle','move','attack','hit','heal','rescue']){const p=`assets/tactical/${role}-${pose}.png`;if(exists(p))poses[pose]=url(p);}
  if(Object.keys(poses).length)data.sprites[role]=poses;
  const alternate={sprites:{},portrait:null,voiceKey:role+'-alt'};for(const pose of ['idle','move','attack','hit','heal','rescue']){const p=`assets/tactical/${role}-alt-${pose}.png`;if(exists(p))alternate.sprites[pose]=url(p);}const portrait=`assets/tactical/portrait-${role}-alt.png`;if(exists(portrait))alternate.portrait=url(portrait);if(alternate.sprites.idle&&alternate.portrait)data.variants[role]={alternate};
  for(const ext of ['png','webp']){const p=`assets/tactical/portrait-${role}.${ext}`;if(exists(p)){data.portraits[role]=url(p);break;}}
 }
 for(const role of ['training-drone','civilian']){const poses={};for(const pose of ['idle','move','attack','hit','heal','rescue']){const p=`assets/tactical/${role}-${pose}.png`;if(exists(p))poses[pose]=url(p);}const p=`assets/tactical/${role}.png`;if(!poses.idle&&exists(p))poses.idle=url(p);if(poses.idle)data.sprites[role]=poses;}
 for(const kind of ['crate','barrier','tree','supply','beacon','stretcher']){const p=`assets/tactical/prop-${kind}.png`;if(exists(p))data.props[kind]=url(p);}
 for(const kind of ['strike','scan','heal','hit']){const p=`assets/tactical/fx-${kind}.png`;if(exists(p))data.effects[kind]=url(p);}
 if(exists('assets/tactical/key-art.webp'))data.keyArt=url('assets/tactical/key-art.webp');
 for(let i=1;i<=13;i++){const p=`assets/tactical/mission-${String(i).padStart(2,'0')}.webp`;if(exists(p))data.backgrounds['u'+String(i).padStart(2,'0')]=url(p);}
 // Audio can be added after the voice worker has verified the recording and set
 // its entry's qaPassed=true in the build-time verification manifest.
 const voiceManifest=path.join(root,'assets/tactical/voice/verified-manifest.json');
 if(fs.existsSync(voiceManifest)){
  const verified=JSON.parse(fs.readFileSync(voiceManifest,'utf8'));
  for(const entry of verified.files||[]){if(entry.qaPassed!==true||!['guardian','scout','medic'].includes(entry.role)||!['primary','alt'].includes(entry.variant||'primary')||!['select','attack','skill','rescue'].includes(entry.cue))continue;const voiceKey=entry.role+(entry.variant==='alt'?'-alt':'');const p=`assets/tactical/voice/${voiceKey}-${entry.cue}.mp3`;if(exists(p)){data.voices[voiceKey]||={};data.voices[voiceKey][entry.cue]={src:url(p),text:entry.text,durationSeconds:entry.durationSeconds};}}
 }
 const source='/* Original approved artwork and machine-verified synthetic character voices. */\n(function(root){\'use strict\';root.TacticalAssets=Object.freeze('+JSON.stringify(data,null,2)+');})(typeof globalThis!==\'undefined\'?globalThis:this);\n';
 fs.writeFileSync(path.join(root,'js/tactical/tactical_assets.js'),source);return data;
}
if(require.main===module)console.log(JSON.stringify(build(),null,2));
module.exports={build};
