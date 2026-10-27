const endpoint=process.env.UPSTASH_REDIS_REST_URL;
const secret=process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(...args){
  const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const j=await r.json();if(!r.ok||j.error)throw Error('Redis: '+(j.error||r.status));return j.result;
}
const key=id=>'rc:online:'+id;
const queue=id=>'rc:queue:'+id;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Только POST'});
 if(!endpoint||!secret)return res.status(503).json({error:'Настройте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN'});
 const {action,id,token,to,type,payload}=req.body||{};
 if(!/^\d{9}$/.test(id||'')||!(/^[0-9a-f]{48}$/.test(token||'')))return res.status(400).json({error:'Неверный ID или токен'});
 try{
  if(action==='register'){
   const ok=await redis('SET',key(id),token,'EX','45','NX');
   if(!ok)return res.status(409).json({error:'ID уже занят. Обновите страницу.'});
   return res.json({ok:true});
  }
  if(await redis('GET',key(id))!==token)return res.status(403).json({error:'Сессия истекла. Обновите страницу.'});
  if(action==='heartbeat'){await redis('EXPIRE',key(id),'45');return res.json({ok:true})}
  if(action==='poll'){
   const raw=await redis('LPOP',queue(id));
   return res.json({message:raw?JSON.parse(raw):null});
  }
  if(action==='send'){
   if(!/^\d{9}$/.test(to||'')||to===id)return res.status(400).json({error:'Неверный ID получателя'});
   if(!['request','decline','accept','offer','answer','ice','stop'].includes(type))return res.status(400).json({error:'Неверный тип'});
   if(!await redis('EXISTS',key(to)))return res.status(404).json({error:'Друг не в сети или ID неверен'});
   const message=JSON.stringify({from:id,type,payload:payload||{}});
   if(message.length>18000)return res.status(413).json({error:'Сообщение слишком большое'});
   await redis('RPUSH',queue(to),message);await redis('EXPIRE',queue(to),'120');
   return res.json({ok:true});
  }
  return res.status(400).json({error:'Неизвестное действие'});
 }catch(e){return res.status(500).json({error:'Ошибка сервера сигнализации'})}
}