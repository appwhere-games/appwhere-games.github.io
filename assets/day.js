const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const currentDay=(now=new Date())=>dateFormat.format(now);
export function untilNextDay(now=new Date()) {
  const time=Object.fromEntries(timeFormat.formatToParts(now).map(part=>[part.type,part.value]));
  return (86400-(Number(time.hour)*3600+Number(time.minute)*60+Number(time.second)))*1000-now.getMilliseconds()+100;
}
