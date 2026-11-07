// Shared school display constants. Authentication and data are handled by the PHP API.
export const DAYS = [
 {name:"شنبه",order:1},{name:"یکشنبه",order:2},{name:"دوشنبه",order:3},
 {name:"سه‌شنبه",order:4},{name:"چهارشنبه",order:5},{name:"پنجشنبه",order:6}
];
export const DAY_ORDER_MAP = Object.fromEntries(DAYS.map(d=>[d.name,d.order]));
