/* Original cosmetic avatar. Independent of identity, progress, tactics and attendance. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RPGAvatar=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='ndmu-ethics-rpg:avatar:v1';
const catalog={
 build:[{id:'regular',name:'標準身形'},{id:'slim',name:'輕巧身形'},{id:'broad',name:'寬肩身形'}],
 skin:[{id:'porcelain',name:'瓷米',color:'#f5d5bb'},{id:'peach',name:'暖杏',color:'#edbd94'},{id:'sand',name:'蜜沙',color:'#c9956b'},{id:'amber',name:'琥珀',color:'#ad744e'},{id:'umber',name:'深棕',color:'#82543e'},{id:'ebony',name:'可可',color:'#573b32'}],
 hair:[{id:'crop',name:'俐落短髮'},{id:'bob',name:'短鮑伯'},{id:'pony',name:'高馬尾'},{id:'long',name:'長髮'},{id:'curl',name:'蓬鬆捲髮'}],
 hairColor:[{id:'ink',name:'墨黑',color:'#26353e'},{id:'chestnut',name:'栗棕',color:'#805442'},{id:'copper',name:'赤銅',color:'#b57145'},{id:'silver',name:'銀灰',color:'#bac6c6'},{id:'plum',name:'深紫',color:'#665574'}],
 top:[{id:'field',name:'立領外套'},{id:'shirt',name:'短袖襯衫'},{id:'jacket',name:'拉鍊夾克'},{id:'vest',name:'口袋背心'}],
 topColor:[{id:'teal',name:'湖綠',color:'#4b8983'},{id:'navy',name:'深藍',color:'#4f688b'},{id:'olive',name:'橄欖',color:'#7c8856'},{id:'clay',name:'赤陶',color:'#ad7056'},{id:'plum',name:'莓紫',color:'#927293'},{id:'cream',name:'米白',color:'#dfd9bc'}],
 bottom:[{id:'straight',name:'直筒長褲'},{id:'cargo',name:'工裝長褲'},{id:'tapered',name:'束口長褲'}],
 bottomColor:[{id:'slate',name:'岩灰',color:'#485963'},{id:'navy',name:'午夜藍',color:'#344d67'},{id:'olive',name:'苔綠',color:'#626e49'},{id:'sand',name:'卡其',color:'#bca478'},{id:'brown',name:'咖啡',color:'#786252'}],
 accessory:[{id:'none',name:'不戴配件'},{id:'glasses',name:'細框眼鏡'},{id:'scarf',name:'金色領巾'},{id:'cap',name:'勤務帽'}],
 gear:[{id:'none',name:'輕裝'},{id:'pack',name:'雙肩背包'},{id:'satchel',name:'隨行側袋'},{id:'notebook',name:'查證筆記本'}]
};
for(const list of Object.values(catalog)){for(const choice of list)Object.freeze(choice);Object.freeze(list);}Object.freeze(catalog);
const defaults=Object.freeze({version:1,build:'regular',skin:'peach',hair:'crop',hairColor:'ink',top:'field',topColor:'teal',bottom:'straight',bottomColor:'slate',accessory:'none',gear:'none'});
const presets=Object.freeze([
 {id:'trail',name:'晨光先鋒',note:'短髮 · 立領外套',value:{...defaults}},
 {id:'breeze',name:'晴風學員',note:'馬尾 · 拉鍊夾克',value:{...defaults,build:'slim',skin:'sand',hair:'pony',hairColor:'chestnut',top:'jacket',topColor:'plum',bottom:'cargo',bottomColor:'navy',gear:'satchel'}},
 {id:'leaf',name:'林間夥伴',note:'鮑伯 · 短袖襯衫',value:{...defaults,hair:'bob',hairColor:'copper',skin:'porcelain',top:'shirt',topColor:'olive',bottom:'tapered',bottomColor:'sand',accessory:'glasses',gear:'notebook'}},
 {id:'stone',name:'山岳行者',note:'捲髮 · 口袋背心',value:{...defaults,build:'broad',skin:'umber',hair:'curl',top:'vest',topColor:'clay',bottom:'cargo',bottomColor:'olive',gear:'pack'}}
].map(p=>Object.freeze({...p,value:Object.freeze(p.value)})));
function normalize(value){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};const result={version:1};for(const [key,choices]of Object.entries(catalog))result[key]=choices.some(c=>c.id===source[key])?source[key]:defaults[key];return result;}
function describe(value){const v=normalize(value);return Object.entries(catalog).map(([key,choices])=>choices.find(c=>c.id===v[key]).name).join('、');}
class Store{
 constructor(storage){this.storage=storage;this.value={...defaults};this.persisted=false;this.load();}
 load(){try{const raw=this.storage?.getItem(KEY);if(raw){this.value=normalize(JSON.parse(raw));this.persisted=true;}}catch(_){this.persisted=false;}return {...this.value};}
 save(value){this.value=normalize(value);try{if(!this.storage)throw new Error('unavailable');this.storage.setItem(KEY,JSON.stringify(this.value));this.persisted=true;}catch(_){this.persisted=false;}return this.persisted;}
}
const shade=(hex,delta)=>'#'+hex.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+delta)).toString(16).padStart(2,'0')).join('');
function draw(ctx,x,y,value,scale=3,facing='down',walk=0,selected=false){
 const v=normalize(value),color=key=>catalog[key].find(c=>c.id===v[key]).color;
 const skin=color('skin'),hair=color('hairColor'),shirt=color('topColor'),pants=color('bottomColor'),ink='#20383e',gold='#f3cd83';
 const bob=walk?Math.round(Math.sin(walk)):0,wide=v.build==='broad'?1:v.build==='slim'?-1:0;
 const r=(px,py,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x+px*scale),Math.round(y+(py+bob)*scale),w*scale,h*scale);};
 const leg=(px,py,w,h,c,side)=>r(px,py+(walk?Math.round(Math.sin(walk)*side):0),w,h,c);
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#173f3a40';ctx.fillRect(Math.round(x-13*scale),Math.round(y-scale),26*scale,4*scale);
 if(selected){r(-12,2,24,1,'#ffe4a2');r(-8,3,16,1,'#f7cb74');}
 if(v.gear==='pack'){r(-11-wide,-16,22+wide*2,12,ink);r(-10-wide,-15,20+wide*2,10,'#a28b57');r(-10-wide,-13,3,7,'#d4b577');}
 if(v.hair==='long'){r(-9,-26,18,15,ink);r(-8,-26,16,14,hair);r(-7,-21,2,8,shade(hair,23));}
 if(v.hair==='pony'){r(facing==='left'?-13:7,-26,6,13,ink);r(facing==='left'?-12:8,-25,4,11,hair);r(facing==='left'?-12:8,-24,4,2,gold);}
 // Feet and trousers are independent from tops.
 const width=v.bottom==='cargo'?6:v.bottom==='tapered'?4:5;
 leg(-6,-7,width,7,ink,1);leg(1,-7,width,7,ink,-1);leg(-5,-7,width-1,6,pants,1);leg(2,-7,width-1,6,pants,-1);
 leg(-6,0,6,2,ink,1);leg(1,0,6,2,ink,-1);leg(-5,0,4,1,'#54645d',1);leg(2,0,4,1,'#54645d',-1);
 if(v.bottom==='cargo'){r(-6,-6,3,3,shade(pants,25));r(4,-6,3,3,shade(pants,25));}
 const torso=8+wide;
 r(-torso,-17,torso*2,11,ink);r(-torso+1,-16,torso*2-2,9,shirt);r(-torso+2,-15,3,7,shade(shirt,25));
 r(-torso-2,-16,3,8,ink);r(torso-1,-16,3,8,ink);r(-torso-1,-15,2,5,shirt);r(torso,-15,2,5,shirt);
 r(-torso-1,-10,2,3,skin);r(torso,-10,2,3,skin);
 if(v.top==='shirt'){r(-torso-1,-12,2,4,skin);r(torso,-12,2,4,skin);r(-2,-16,4,2,'#e9e2c6');r(0,-13,1,6,shade(shirt,-25));}
 else if(v.top==='jacket'){r(-1,-16,2,9,'#e0d7b4');r(-6,-10,3,2,shade(shirt,-26));r(3,-10,3,2,shade(shirt,-26));}
 else if(v.top==='vest'){r(-torso-1,-15,2,5,'#e3e3c9');r(torso,-15,2,5,'#e3e3c9');r(-6,-13,4,4,shade(shirt,-25));r(2,-13,4,4,shade(shirt,-25));r(-5,-13,2,1,gold);r(3,-13,2,1,gold);}
 else{r(-3,-17,6,2,shade(shirt,-22));r(-2,-16,1,3,gold);r(1,-16,1,3,gold);r(4,-13,2,2,'#c9e2cc');}
 r(-7,-7,14,1,'#a28858');r(-1,-7,2,1,gold);
 // Head silhouette and expression. Styles are available to everyone.
 r(-6,-29,12,2,ink);r(-8,-27,16,8,ink);r(-7,-19,14,2,ink);r(-5,-17,10,1,ink);r(-6,-27,12,1,skin);r(-7,-26,14,7,skin);r(-6,-19,12,2,skin);r(-4,-17,8,1,skin);r(-2,-17,4,2,shade(skin,-12));r(-9,-23,2,3,skin);r(7,-23,2,3,skin);r(-7,-24,1,5,shade(skin,-13));r(6,-23,1,4,shade(skin,-24));r(-5,-26,8,1,shade(skin,12));
 if(facing==='up'){r(-7,-26,14,10,hair);r(-6,-27,12,3,shade(hair,22));}
 else{r(-5,-23,3,2,'#fff3d1');r(3,-23,3,2,'#fff3d1');r(facing==='left'?-5:-4,-23,2,3,ink);r(facing==='right'?5:4,-23,2,3,ink);r(-1,-20,1,1,shade(skin,-22));r(-1,-18,3,1,shade(skin,-48));r(2,-19,1,1,shade(skin,-40));r(-6,-19,2,1,shade(skin,-10));r(-5,-25,3,1,shade(hair,5));r(3,-25,3,1,shade(hair,5));}
 if(v.hair==='crop'){r(-6,-30,11,1,ink);r(-8,-29,15,2,ink);r(-9,-27,17,2,ink);r(-7,-29,12,2,hair);r(-8,-27,9,2,hair);r(-7,-25,4,1,hair);r(3,-28,4,4,hair);r(-4,-28,6,1,shade(hair,25));r(-5,-29,3,1,shade(hair,15));}
 else if(v.hair==='curl'){for(const [a,b]of[[-8,-29],[-3,-30],[2,-30],[5,-28],[-9,-26],[5,-25]]){r(a,b,5,4,ink);r(a+1,b,3,3,hair);r(a+1,b,2,1,shade(hair,24));}}
 else{r(-6,-30,12,1,ink);r(-8,-29,16,2,ink);r(-9,-27,18,2,ink);r(-7,-29,14,2,hair);r(-8,-27,10,2,hair);r(-8,-25,6,1,hair);r(-5,-28,9,1,shade(hair,28));r(5,-27,3,v.hair==='bob'?11:7,hair);r(-8,-26,3,v.hair==='bob'?10:7,hair);if(v.hair==='bob')r(-7,-18,2,2,shade(hair,22));}
 if(v.accessory==='glasses'&&facing!=='up'){r(-7,-24,6,1,ink);r(1,-24,6,1,ink);r(-7,-21,6,1,ink);r(1,-21,6,1,ink);for(const a of[-7,-2,1,6])r(a,-23,1,2,ink);r(-1,-23,2,1,ink);}
 if(v.accessory==='scarf'){r(-5,-16,10,2,gold);r(3,-14,3,5,'#dab563');r(4,-13,1,3,'#ffe9ac');}
 if(v.accessory==='cap'){r(-9,-29,18,4,ink);r(-8,-29,16,3,shirt);r(-10,-26,20,2,shade(shirt,-28));r(-1,-28,2,2,gold);}
 if(v.gear==='satchel'){r(4,-15,2,10,'#d7c195');r(6,-10,6,7,ink);r(7,-9,4,5,'#bb9e66');r(8,-8,2,1,gold);}
 if(v.gear==='notebook'){r(-12-wide,-12,5,7,ink);r(-11-wide,-11,4,5,'#ede4ba');r(-10-wide,-10,2,1,'#617c79');r(-10-wide,-8,2,1,'#617c79');}
 ctx.restore();
}
function portrait(canvas,value){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);draw(ctx,canvas.width/2,canvas.height-16,value,Math.max(1,Math.floor(Math.min(canvas.width/34,(canvas.height-22)/34))));}
return Object.freeze({KEY,catalog,defaults,presets,normalize,describe,Store,draw,portrait});
});
