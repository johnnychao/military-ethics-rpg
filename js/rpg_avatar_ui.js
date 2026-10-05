/* Native, keyboard-accessible cosmetic editor. Draft changes are not saved until confirmed. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine/rpg_avatar'));else root.RPGAvatarUI=factory(root.RPGAvatar);})(typeof globalThis!=='undefined'?globalThis:this,function(Avatar){
'use strict';
class RPGAvatarUI{
 constructor({document:doc=globalThis.document,value=Avatar.defaults}={}){
  this.document=doc;this.value=Avatar.normalize(value);this.controls={};this.presetButtons=[];
  const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  this.element=el('section',undefined,'avatar-studio');this.element.setAttribute('aria-label','角色外觀設定');
  const stage=el('div',undefined,'avatar-stage');stage.append(el('span','YOUR CHARACTER','eyebrow'),el('h3','你的冒險，由你選樣貌'));
  this.canvas=el('canvas');this.canvas.width=240;this.canvas.height=260;this.canvas.setAttribute('role','img');stage.append(this.canvas);
  this.summary=el('p',undefined,'avatar-summary');this.summary.setAttribute('aria-live','polite');stage.append(this.summary,el('p','每一種風格，都能成為小隊的一員。','avatar-stage-note'));
  const controls=el('div',undefined,'avatar-controls'),presets=el('div',undefined,'avatar-presets');
  presets.setAttribute('aria-label','快速選擇角色');
  for(const preset of Avatar.presets){const b=el('button',undefined,'avatar-preset');b.type='button';b.dataset.avatarPreset=preset.id;b.setAttribute('aria-pressed','false');const thumb=el('canvas');thumb.width=72;thumb.height=84;thumb.setAttribute('aria-hidden','true');Avatar.portrait(thumb,preset.value);b.append(thumb,el('strong',preset.name),el('small',preset.note));b.addEventListener('click',()=>{this.value=Avatar.normalize(preset.value);this.refresh();});this.presetButtons.push([preset,b]);presets.append(b);}
  controls.append(el('h3','先選一位，再自由搭配'),presets,el('p','包含女性與男性風格；所有外觀都可自由搭配，不必填寫性別。','avatar-help'));
  const groups=[['樣貌與色彩',[['build','身形'],['skin','膚色'],['hair','髮型'],['hairColor','髮色']]],['服裝搭配',[['top','上衣款式'],['topColor','上衣顏色'],['bottom','褲子款式'],['bottomColor','褲子顏色']]],['隨行配件',[['accessory','穿戴配件'],['gear','隨行裝備']]]];
  for(const [title,fields]of groups){const fieldset=el('fieldset',undefined,'avatar-fields');fieldset.append(el('legend',title));const grid=el('div',undefined,'avatar-fields-grid');for(const [key,title]of fields){const cell=el('div',undefined,'avatar-field'),label=el('label',title),select=el('select');select.id='avatar-'+key;select.name='avatar-'+key;label.htmlFor=select.id;for(const choice of Avatar.catalog[key]){const option=el('option',choice.name);option.value=choice.id;select.append(option);}select.addEventListener('change',()=>{this.value=Avatar.normalize({...this.value,[key]:select.value});this.refresh();});this.controls[key]=select;cell.append(label,select);grid.append(cell);}fieldset.append(grid);controls.append(fieldset);}
  const reset=el('button','重設外觀','avatar-reset');reset.type='button';reset.addEventListener('click',()=>{this.value={...Avatar.defaults};this.refresh();});controls.append(reset,el('p','外觀與裝備只改變造型，不影響能力、分數、任務條件或出席。外觀只存於此瀏覽器，與學習 JSON 分開。','avatar-help'));
  this.element.append(stage,controls);this.refresh();
 }
 refresh(){for(const[key,select]of Object.entries(this.controls))select.value=this.value[key];const description=Avatar.describe(this.value);this.canvas.setAttribute('aria-label','角色預覽：'+description);this.summary.textContent=description;Avatar.portrait(this.canvas,this.value);for(const[preset,b]of this.presetButtons)b.setAttribute('aria-pressed',String(Object.keys(Avatar.catalog).every(k=>preset.value[k]===this.value[k])));}
 getValue(){return Avatar.normalize(this.value);}
}
return RPGAvatarUI;
});
