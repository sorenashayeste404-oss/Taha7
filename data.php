<?php
require __DIR__.'/common.php';
$u=require_login(); $method=$_SERVER['REQUEST_METHOD']; $kind=$_GET['kind']??'';
function allowed_groups(PDO $db,array $u): array {
 if($u['role']==='admin') { $out=[]; foreach(['دهم','یازدهم','دوازدهم'] as $g) foreach(['تجربی','ریاضی','انسانی'] as $f) foreach(['1','2'] as $b)$out[]="$g $f شعبه $b"; return $out; }
 if($u['role']==='student') return [group_name($u)];
 $out=[]; foreach(teacher_scopes($db,(int)$u['id']) as $s)$out[]=group_name($s); return array_values(array_unique($out));
}
function can_group(PDO $db,array $u,string $group): bool { return in_array($group,allowed_groups($db,$u),true); }
function fetch_all_data(PDO $db,array $u): array {
 $groups=allowed_groups($db,$u); if(!$groups)return ['lessons'=>[],'tasks'=>[],'groups'=>[]];
 $ph=implode(',',array_fill(0,count($groups),'?'));
 $q=$db->prepare("SELECT id,`group`,day,dayOrder,`time`,timeOrder,name,teacher FROM lessons WHERE `group` IN ($ph) ORDER BY dayOrder,timeOrder");$q->execute($groups);$lessons=$q->fetchAll();
 if($u['role']==='teacher') { $sc=teacher_scopes($db,(int)$u['id']); $lessons=array_values(array_filter($lessons,function($l)use($sc){foreach($sc as $s)if($l['group']===group_name($s)&&$l['name']===$s['subject_name'])return true;return false;})); }
 $q=$db->prepare("SELECT id,`group`,day,dayOrder,title,`desc` FROM tasks WHERE `group` IN ($ph) ORDER BY dayOrder");$q->execute($groups);
 return ['lessons'=>$lessons,'tasks'=>$q->fetchAll(),'groups'=>$groups];
}
if($method==='GET') { out(fetch_all_data($db,$u)); }
if($method==='POST'||$method==='PUT'||$method==='DELETE') {
 if($u['role']==='student') out(['error'=>'حساب دانش‌آموز فقط اجازه مشاهده دارد.'],403);
 require_csrf(); $b=body(); $id=(int)($b['id']??0);
 if($method==='DELETE') {
  $table=$kind==='lessons'?'lessons':($kind==='tasks'?'tasks':null); if(!$table)out(['error'=>'نوع داده نامعتبر است.'],422);
  $q=$db->prepare("SELECT `group`,name FROM `$table` WHERE id=?");$q->execute([$id]);$old=$q->fetch(); if(!$old)out(['error'=>'مورد پیدا نشد.'],404);
  if(!can_access_group($db,$u,$old['group'],$kind==='lessons'?$old['name']:null))out(['error'=>'به این کلاس یا درس دسترسی ندارید.'],403);
  $q=$db->prepare("DELETE FROM `$table` WHERE id=?");$q->execute([$id]);out(['ok'=>true]);
 }
 $group=trim((string)($b['group']??'')); $day=trim((string)($b['day']??''));$dayOrder=(int)($b['dayOrder']??0);
 if(!can_group($db,$u,$group))out(['error'=>'این کلاس در محدوده دسترسی حساب شما نیست.'],403);
 if(!in_array($day,['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه'],true))out(['error'=>'روز انتخاب‌شده معتبر نیست.'],422);
 if($kind==='lessons') {
  $time=trim((string)($b['time']??''));$name=trim((string)($b['name']??''));$teacher=trim((string)($b['teacher']??''));$timeOrder=(int)($b['timeOrder']??0);
  if($time===''||$name==='')out(['error'=>'ساعت و نام درس الزامی است.'],422);
  if($u['role']==='teacher') { $ok=false;foreach(teacher_scopes($db,(int)$u['id']) as $s)if($group===group_name($s)&&$name===$s['subject_name'])$ok=true;if(!$ok)out(['error'=>'معلم فقط مجاز به مدیریت درس اختصاص‌یافته به خودش است.'],403); }
  if($method==='PUT') { $q=$db->prepare('SELECT `group`,name FROM lessons WHERE id=?');$q->execute([$id]);$old=$q->fetch();if(!$old||!can_access_group($db,$u,$old['group'],$u['role']==='teacher'?$old['name']:null))out(['error'=>'اجازه ویرایش این درس را ندارید.'],403);$q=$db->prepare('UPDATE lessons SET `group`=?,day=?,dayOrder=?,`time`=?,timeOrder=?,name=?,teacher=? WHERE id=?');$q->execute([$group,$day,$dayOrder,$time,$timeOrder,$name,$teacher,$id]); }
  else { $q=$db->prepare('INSERT INTO lessons(`group`,day,dayOrder,`time`,timeOrder,name,teacher) VALUES(?,?,?,?,?,?,?)');$q->execute([$group,$day,$dayOrder,$time,$timeOrder,$name,$teacher]);$id=(int)$db->lastInsertId(); }
 } elseif($kind==='tasks') {
  $title=trim((string)($b['title']??''));$desc=trim((string)($b['desc']??''));if($title==='')out(['error'=>'عنوان کار الزامی است.'],422);
  if($method==='PUT') { $q=$db->prepare('SELECT `group` FROM tasks WHERE id=?');$q->execute([$id]);$old=$q->fetch();if(!$old||!can_group($db,$u,$old['group']))out(['error'=>'اجازه ویرایش این کار را ندارید.'],403);$q=$db->prepare('UPDATE tasks SET `group`=?,day=?,dayOrder=?,title=?,`desc`=? WHERE id=?');$q->execute([$group,$day,$dayOrder,$title,$desc,$id]); }
  else { $q=$db->prepare('INSERT INTO tasks(`group`,day,dayOrder,title,`desc`) VALUES(?,?,?,?,?)');$q->execute([$group,$day,$dayOrder,$title,$desc]);$id=(int)$db->lastInsertId(); }
 } else out(['error'=>'نوع داده نامعتبر است.'],422);
 out(['ok'=>true,'id'=>$id]);
}
out(['error'=>'روش درخواست پشتیبانی نمی‌شود.'],405);
