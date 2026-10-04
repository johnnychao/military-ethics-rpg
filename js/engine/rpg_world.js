/* 國醫倫理冒險：原創像素場景。圖像全由本機Canvas繪製，不載入遠端素材。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPGWorld = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const W = 384, H = 480, T = 24;
  const P = { ink:'#183831', grass:'#62895b', light:'#89aa6d', dark:'#466b48', path:'#c7bc88', edge:'#ad9c6d', water:'#689b9e', roof:'#ac6551', cream:'#f0e5bd', gold:'#edc675', navy:'#405d67', red:'#ad514a' };
  const sprite = [
    '     HHHHH     ','    HHHHHHH    ','    HSSSSSH    ','    SXSXSXS    ','     SSSSS     ','      SSS      ','    CCCCCCC    ','   CCCACCCCC   ','   SCCCCCCCS   ','   SCCACCCCS   ','    CCCCCCC    ','    PPPPPPP    ','    PP   PP    ','    PP   PP    ','   BBB   BBB   '
  ];
  function portrait(canvas, color, skin, hair) {
    const ctx=canvas.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,canvas.width,canvas.height);
    const colors={H:hair||'#35443b',S:skin||'#d9b38b',X:'#24382d',C:color,A:'#f2deb2',P:'#405452',B:'#213d37'};
    const scale=Math.max(1,Math.floor(Math.min(canvas.width/15,canvas.height/17)));
    sprite.forEach((row,y)=>[...row].forEach((s,x)=>{if(colors[s]) {ctx.fillStyle=colors[s]; ctx.fillRect(Math.floor((canvas.width-15*scale)/2)+x*scale,Math.floor((canvas.height-15*scale)/2)+y*scale,scale,scale);}}));
  }
  class RPGWorld {
    constructor(canvas, options={}) { this.canvas=canvas; canvas.width=W; canvas.height=H; this.ctx=canvas.getContext('2d'); this.party=options.party||[]; this.state=null; this.chapter=null; this.selected=null; this.tiles=[]; this.tick=0; this.reducedMotion=false; this.handle=0; this.running=false; }
    start() { if(this.running)return; this.running=true; const loop=()=>{if(!this.running)return;this.tick++; if(this.state)this.draw();this.handle=requestAnimationFrame(loop);};this.handle=requestAnimationFrame(loop); }
    stop() {this.running=false;cancelAnimationFrame(this.handle);}
    set(state,chapter,selected=null,tiles=[]) { this.state=state; this.chapter=chapter; this.selected=selected; this.tiles=tiles; this.draw(); }
    rect(x,y,w,h,c) {this.ctx.fillStyle=c;this.ctx.fillRect(Math.round(x),Math.round(y),w,h);}
    text(str,x,y,c=P.ink,size=12,align='left') {this.ctx.fillStyle=c;this.ctx.font=`bold ${size}px "Microsoft JhengHei", sans-serif`;this.ctx.textAlign=align;this.ctx.fillText(str,x,y);this.ctx.textAlign='left';}
    tileAt(clientX,clientY) { const r=this.canvas.getBoundingClientRect(),x=(clientX-r.left)*W/r.width,y=(clientY-r.top)*H/r.height; if(this.state&&this.state.phase==='tactics')return {x:Math.floor((x-48)/48),y:Math.floor((y-48)/48)};return {x:Math.floor(x/T),y:Math.floor(y/T)}; }
    person(x,y,id,scale=1,facing='down',selected=false) {
      const party=this.party.find(p=>p.id===id)||{}, color=id==='cadet'&&this.awards>=3?'#bb9e5c':party.color||P.navy;
      const skin=id==='doctor'?'#dfb593':'#cfa781',hair=id==='liaison'?'#765a43':id==='doctor'?'#c0bbaa':'#35443b';
      this.rect(x-7*scale,y+6*scale,14*scale,4*scale,'#3b59474d');
      const sway=this.reducedMotion?0:Math.floor(this.tick/25)%2;
      const colors={H:hair,S:skin,X:'#24382d',C:color,A:'#f2deb2',P:'#405452',B:'#213d37'};
      sprite.forEach((row,ry)=>[...row].forEach((s,rx)=>{if(colors[s])this.rect(x+(rx-7)*scale,y+(ry-10)*scale+(ry>11?sway:0),scale,scale,colors[s]);}));
      if(facing==='up')this.rect(x-4*scale,y-6*scale,9*scale,3*scale,hair);
      if(id==='cadet'&&this.awards>=1)this.rect(x+3*scale,y-3*scale,2*scale,2*scale,P.gold);
      if(selected){this.ctx.strokeStyle=P.gold;this.ctx.lineWidth=2;this.ctx.strokeRect(x-6*scale-2,y-10*scale-2,13*scale+4,15*scale+4);}
    }
    tree(x,y,size=1) {this.rect(x+9*size,y+14*size,5*size,11*size,'#725a3d');this.rect(x+3*size,y+4*size,18*size,15*size,P.dark);this.rect(x,y+8*size,24*size,8*size,P.dark);this.rect(x+5*size,y+2*size,14*size,6*size,P.grass);this.rect(x+6*size,y+6*size,5*size,3*size,P.light);}
    building(wall) { const x=wall.x*T,y=wall.y*T,w=wall.w*T,h=wall.h*T;this.rect(x+4,y+6,w,h,'#334f4033');this.rect(x,y+8,w,h-8,P.cream);this.rect(x-2,y,w+4,12,P.roof);this.rect(x+2,y+3,w-4,2,'#cf8d69'); for(let wx=x+8;wx<x+w-8;wx+=20){this.rect(wx,y+18,10,11,P.navy);this.rect(wx+2,y+20,6,2,'#a4c1b7');}this.rect(x+w/2-5,y+h-15,10,15,P.ink);this.rect(x,y+h-3,w,3,'#ad9c6d');}
    ground() { const region=/救援/.test(this.chapter.region)?'rescue':/補給/.test(this.chapter.region)?'logistics':/營區/.test(this.chapter.region)?'camp':'academy';for(let y=0;y<20;y++)for(let x=0;x<16;x++){let color=((x*17+y*23)%11===0)?'#6e935f':P.grass;if(region==='camp')color=((x+y)%4===0)?'#657d58':'#58734c';if(region==='logistics')color=((x+y)%3===0)?'#899076':'#7a826b';if(region==='rescue')color=((x+y)%5===0)?'#9d9974':'#8b9375';this.rect(x*T,y*T,T,T,color);if((x*13+y*7)%9===0){this.rect(x*T+5,y*T+8,3,1,P.light);this.rect(x*T+16,y*T+18,2,2,P.dark);}}
      this.rect(7*T,0,3*T,H,P.path);this.rect(0,14*T,W,2*T,P.path);this.rect(1*T,7*T,14*T,2*T,P.path);for(let y=0;y<20;y++){this.rect(7*T,y*T,1,20,P.edge);this.rect(10*T-1,y*T,1,20,P.edge);}
      for(let x=1;x<16;x+=3){this.rect(x*T,15*T+6,8,2,'#d9cea2');}
      const walls=this.chapter.map.walls||[];for(const wall of walls){if(wall.type==='water'){this.rect(wall.x*T,wall.y*T,wall.w*T,wall.h*T,P.water);for(let j=0;j<wall.h;j++)this.rect(wall.x*T+5,(wall.y+j)*T+8,wall.w*T-10,2,'#a1c4b6');}else if(['tree','trees'].includes(wall.type)){for(let yy=0;yy<wall.h;yy++)for(let xx=0;xx<wall.w;xx++)this.tree((wall.x+xx)*T,(wall.y+yy)*T);}else if(wall.type==='crates'){for(let yy=0;yy<wall.h;yy++)for(let xx=0;xx<wall.w;xx++){const bx=(wall.x+xx)*T,by=(wall.y+yy)*T;this.rect(bx+1,by+3,21,20,'#98714c');this.rect(bx+3,by+5,17,16,'#b5925c');this.rect(bx+6,by+5,2,16,'#785a3b');this.rect(bx+3,by+10,17,2,'#785a3b');}}else this.building(wall);}
      // Decorative edge details do not change the engine's collision grid.
      for(let x=0;x<16;x+=2){this.rect(x*T,0,18,4,'#d5c792');this.rect(x*T,4,2,11,'#d5c792');}
      this.rect(6*T,17*T+9,6,3,P.gold);this.rect(10*T+14,17*T+9,6,3,P.gold);
      this.rect(64,10,256,29,'#183831e8');this.text(this.chapter.region,W/2,30,P.cream,16,'center');
    }
    marker(x,y,type,done,label) { const px=x*T+12,py=y*T+12;const pulse=this.reducedMotion?0:Math.floor(this.tick/30)%2;
      if(type==='person')this.person(px,py+4,'liaison',2);else if(type==='tool'){this.rect(px-11,py-8,22,18,'#9b7046');this.rect(px-12,py-8,24,5,P.gold);this.rect(px-2,py-4,4,11,P.cream);}else{this.rect(px-9,py-12,19,26,P.cream);this.rect(px-5,py-7,12,2,P.navy);this.rect(px-5,py-1,9,2,P.navy);this.rect(px-5,py+5,11,2,P.navy);}
      if(!done){this.rect(px-4,py-29-pulse,8,11,P.gold);this.rect(px-1,py-27-pulse,2,5,P.ink);this.rect(px-1,py-21-pulse,2,2,P.ink);}else{this.rect(px+10,py-14,10,10,'#d6e1af');this.text('✓',px+15,py-5,P.ink,11,'center');}
      if(label){const name=label.slice(0,7),width=name.length*14+10,left=Math.max(2,Math.min(W-width-2,px-width/2));this.rect(left,py+18,width,23,'#183831e8');this.text(name,left+width/2,py+35,P.cream,14,'center');}
    }
    exploration() {this.ground();const s=this.state,c=this.chapter;for(const clue of c.clues)this.marker(clue.x,clue.y,clue.type,s.clues.includes(clue.id),clue.name);if(c.sideQuest)this.marker(c.sideQuest.x??10,c.sideQuest.y??17,'tool',s.sideDone,'隊員支線');const g=c.map.gate;this.rect(g.x*T-14,g.y*T-8,52,40,P.ink);this.rect(g.x*T-10,g.y*T-4,44,32,'#678278');this.text('任務',g.x*T+12,g.y*T+19,P.gold,16,'center');this.person((s.player.x+.5)*T,(s.player.y+.5)*T+4,'cadet',2,s.player.facing,true);
      this.rect(10,H-35,W-20,27,'#183831dd');this.text(`線索 ${s.clues.length}/${c.clues.length} · 靠近標記後互動`,W/2,H-16,P.cream,14,'center');
    }
    tactics() {const s=this.state,c=this.chapter;this.rect(0,0,W,H,'#4f6d5b');this.rect(12,12,W-24,H-24,P.ink);this.text(s.phase==='tactics'?`策略區　/　回合 ${s.tactical.round} · 指令 ${s.tactical.commandsLeft}`:'任務後果　/　最後部署',W/2,32,P.cream,16,'center');for(let y=0;y<8;y++)for(let x=0;x<6;x++){const xx=48+x*48,yy=48+y*48;this.rect(xx,yy,47,47,(x+y)%2?'#8d9b78':'#9caa85');this.rect(xx+5,yy+37,14,2,'#bdc19c');}
      for(const t of this.tiles){if(t.x>=0&&t.y>=0&&t.x<6&&t.y<8)this.rect(49+t.x*48,49+t.y*48,45,45,'#c7e9ab35');}
      for(const target of c.scenario.targets){const x=48+(target.x+.5)*48,y=48+(target.y+.5)*48,finished=c.scenario.actions.some(a=>a.targetId===target.id&&s.tactical.flags.includes(a.flag));this.rect(x-12,y-13,24,19,P.cream);this.rect(x-14,y-15,28,4,finished?'#3c795b':P.navy);this.rect(x-4,y-8,8,8,P.gold);if(finished)this.text('✓',x,y+1,P.ink,12,'center');const name=target.name.slice(0,6),width=name.length*12+6,left=Math.max(16,Math.min(W-width-16,x-width/2));this.rect(left,y+9,width,19,'#d6dbbddd');this.text(name,left+width/2,y+23,P.ink,12,'center');}
      for(const u of s.tactical.units){const acted=s.tactical.used.includes(u.id);this.person(48+(u.x+.5)*48,48+(u.y+.5)*48+7,u.id,3,'down',false);if(this.selected?.unitId===u.id){this.ctx.strokeStyle=P.gold;this.ctx.lineWidth=3;this.ctx.strokeRect(50+u.x*48,50+u.y*48,44,44);}if(acted){this.rect(48+u.x*48+30,48+u.y*48+3,15,15,P.ink);this.text('✓',48+u.x*48+37,48+u.y*48+15,P.cream,12,'center');}}
      if(this.selected?.destination){const d=this.selected.destination;this.ctx.strokeStyle=P.gold;this.ctx.lineWidth=3;this.ctx.strokeRect(50+d.x*48,50+d.y*48,44,44);}
      this.text(s.phase==='tactics'?'選隊員 → 選位置 → 選技能':'行動留下後果 · 把理由寫進回顧',W/2,H-19,P.cream,15,'center');
    }
    draw() {if(!this.state||!this.chapter)return;const ctx=this.ctx;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,W,H);if(this.state.tactical)this.tactics();else this.exploration();}
  }
  RPGWorld.portrait=portrait;RPGWorld.WIDTH=W;RPGWorld.HEIGHT=H;return RPGWorld;
});
