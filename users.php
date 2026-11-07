<?php
require __DIR__.'/common.php';
require_admin();
$method=$_SERVER['REQUEST_METHOD'];
if($method==='GET') {
  $rows=$db->query("SELECT id,full_name,login_name,role,grade,field_name,branch,active,created_at FROM users WHERE role IN ('student','teacher') ORDER BY role,full_name")->fetchAll();
  foreach($rows as &$r){$r['id']=(int)$r['id'];$r['active']=(bool)$r['active'];$r['scopes']=$r['role']==='teacher'?teacher_scopes($db,$r['id']):[]; if($r['role']==='teacher') unset($r['login_name']);} unset($r); out(['users'=>$rows]);
}
if($method==='POST') {
  require_csrf(); $b=body(); $role=(string)($b['role']??''); $name=clean_name((string)($b['full_name']??'')); $pass=(string)($b['password']??'');
  if(!in_array($role,['student','teacher'],true)) out(['error'=>'نوع حساب نامعتبر است.'],422);
  // Bulk roster import creates a separate random initial password for every student.
  if($role==='student' && !empty($b['names']) && is_array($b['names'])) {
    $grade=trim((string)($b['grade']??'')); $field=trim((string)($b['field_name']??'')); $branch=trim((string)($b['branch']??''));
    if(!$grade||!$field||!$branch) out(['error'=>'پایه، رشته و شعبه را انتخاب کنید.'],422);
    $created=[]; try { $db->beginTransaction(); $q=$db->prepare("INSERT INTO users(full_name,login_name,role,grade,field_name,branch,password_hash,must_change_password) VALUES(?,?,'student',?,?,?,?,1)");
      foreach($b['names'] as $raw){$student=clean_name((string)$raw);if(mb_strlen($student)<3)continue;$pw=bin2hex(random_bytes(5));$q->execute([$student,$student,$grade,$field,$branch,password_hash($pw,PASSWORD_DEFAULT)]);$created[]=['full_name'=>$student,'username'=>$student,'initial_password'=>$pw];}
      if(!$created){$db->rollBack();out(['error'=>'نام دانش‌آموز معتبری وارد نشده است.'],422);} $db->commit();out(['ok'=>true,'created'=>$created]);
    } catch(PDOException $e){if($db->inTransaction())$db->rollBack();if($e->getCode()==='23000')out(['error'=>'حداقل یکی از نام‌ها قبلاً ثبت شده است؛ هیچ حسابی از این فهرست ساخته نشد.'],409);out(['error'=>'ساخت حساب‌های دانش‌آموزان انجام نشد.'],500);}
  }
  if(mb_strlen($name)<3||strlen($pass)<10) out(['error'=>'نام معتبر و رمز اولیه حداقل ۱۰ نویسه‌ای لازم است.'],422);
  $scopes=$b['scopes']??[];
  if($role==='student') { $grade=trim((string)($b['grade']??''));$field=trim((string)($b['field_name']??''));$branch=trim((string)($b['branch']??'')); if(!$grade||!$field||!$branch) out(['error'=>'پایه، رشته و شعبه دانش‌آموز را مشخص کنید.'],422); $scopes=[]; }
  else { if(!is_array($scopes)||!count($scopes)) out(['error'=>'حداقل یک محدودهٔ تدریس تعیین کنید.'],422); foreach($scopes as $s) if(empty($s['grade'])||empty($s['field_name'])||empty($s['branch'])||empty($s['subject_name'])) out(['error'=>'هر محدوده باید پایه، رشته، شعبه و درس داشته باشد.'],422); }
  $login=$name;
  try {
    $db->beginTransaction();
    $q=$db->prepare('INSERT INTO users(full_name,login_name,role,grade,field_name,branch,password_hash,must_change_password) VALUES(?,?,?,?,?,?,?,1)');
    $q->execute([$name,$login,$role,$role==='student'?$grade:null,$role==='student'?$field:null,$role==='student'?$branch:null,password_hash($pass,PASSWORD_DEFAULT)]); $id=(int)$db->lastInsertId();
    if($role==='teacher') { $q=$db->prepare('INSERT INTO teacher_scopes(user_id,grade,field_name,branch,subject_name) VALUES(?,?,?,?,?)'); foreach($scopes as $s)$q->execute([$id,trim($s['grade']),trim($s['field_name']),trim($s['branch']),trim($s['subject_name'])]); }
    $db->commit(); out(['ok'=>true,'id'=>$id,'full_name'=>$name,'username'=>$role==='student'?$login:null,'initial_password'=>$pass,'role'=>$role]);
  } catch(PDOException $e) { if($db->inTransaction())$db->rollBack(); if($e->getCode()==='23000')out(['error'=>'این نام کامل قبلاً ثبت شده است؛ نام ورود باید یکتا باشد.'],409); out(['error'=>'ساخت حساب انجام نشد.'],500); }
}
if($method==='PATCH') { require_csrf(); $b=body();$id=(int)($b['id']??0); if(!empty($b['reset_password'])){$pw=bin2hex(random_bytes(5));$q=$db->prepare("UPDATE users SET password_hash=?,must_change_password=1 WHERE id=? AND role IN ('student','teacher')");$q->execute([password_hash($pw,PASSWORD_DEFAULT),$id]);if(!$q->rowCount())out(['error'=>'حساب موردنظر پیدا نشد.'],404);out(['ok'=>true,'initial_password'=>$pw]);} $active=!empty($b['active'])?1:0;$q=$db->prepare("UPDATE users SET active=? WHERE id=? AND role IN ('student','teacher')");$q->execute([$active,$id]);out(['ok'=>true]); }
if($method==='DELETE') { require_csrf();$b=body();$id=(int)($b['id']??0);$q=$db->prepare("DELETE FROM users WHERE id=? AND role IN ('student','teacher')");$q->execute([$id]);out(['ok'=>true]); }
out(['error'=>'روش درخواست پشتیبانی نمی‌شود.'],405);
