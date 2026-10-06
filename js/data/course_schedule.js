/* D84 115-1 course schedule; opens at class start and never closes.
 * Dates: verified D84 115-1 semester reading schedule.
 * Start time: teacher-confirmed Tuesday 13:30, Asia/Taipei. Client UI is not a trusted clock.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CourseSchedule=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const dates=['09-22','09-29','10-06','10-13','10-20','10-27','11-10','11-17','11-24','12-01','12-08','12-15','12-22'];
const entries=Object.freeze(Object.fromEntries(dates.map((date,i)=>{const id='u'+String(i+1).padStart(2,'0');return [id,Object.freeze({id,opensAt:'2026-'+date+'T13:30:00+08:00',timeZone:'Asia/Taipei'})];})));
function get(id){return Object.prototype.hasOwnProperty.call(entries,id)?entries[id]:null;}
function isOpen(id,now=Date.now()){const e=get(id),time=now instanceof Date?now.getTime():typeof now==='string'?Date.parse(now):now;return !!e&&Number.isFinite(time)&&time>=Date.parse(e.opensAt);}
function label(id){const e=get(id);return e?e.opensAt.slice(0,10).replace(/-/g,'/')+' 13:30（台北時間）':'開放時間待確認';}
return Object.freeze({entries,get,isOpen,label,timeZone:'Asia/Taipei',version:'d84-115-1-20261006'});
});
