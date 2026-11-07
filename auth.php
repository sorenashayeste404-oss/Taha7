<?php
require __DIR__.'/common.php';
$action=$_GET['action']??'';
if($action==='login' && $_SERVER['REQUEST_METHOD']==='POST') {
  $b=body(); $login=clean_name((string)($b['login']??'')); $pass=(string)($b['password']??'');
  if($login===''||$pass==='') out(['error'=>'نام ورود و رمز عبور را وارد کنید.'],422);
  $q=$db->prepare('SELECT id,full_name,login_name,role,grade,field_name,branch,password_hash,must_change_password,active FROM users WHERE login_name=? LIMIT 1'); $q->execute([$login]); $u=$q->fetch();
  if(!$u||!(int)$u['active']||!password_verify($pass,$u['password_hash'])) out(['error'=>'نام ورود یا رمز عبور اشتباه است.'],401);
  session_regenerate_id(true); unset($u['password_hash'],$u['active']); $u['id']=(int)$u['id']; $u['must_change_password']=(bool)$u['must_change_password'];
  if($u['role']==='teacher') $u['scopes']=teacher_scopes($db,$u['id']);
  $_SESSION['user']=$u; $_SESSION['csrf']=bin2hex(random_bytes(32));
  out(['user'=>$u,'csrf'=>$_SESSION['csrf']]);
}
if($action==='me' && $_SERVER['REQUEST_METHOD']==='GET') { $u=require_login(); if($u['role']==='teacher') $u['scopes']=teacher_scopes($db,(int)$u['id']); out(['user'=>$u,'csrf'=>$_SESSION['csrf']??'']); }
if($action==='logout' && $_SERVER['REQUEST_METHOD']==='POST') { require_csrf(); $_SESSION=[]; if(ini_get('session.use_cookies')) { $p=session_get_cookie_params(); setcookie(session_name(),'',time()-42000,$p['path'],$p['domain']??'',$p['secure'],$p['httponly']); } session_destroy(); out(['ok'=>true]); }
if($action==='change-password' && $_SERVER['REQUEST_METHOD']==='POST') {
  $u=require_login(); require_csrf(); $b=body(); $old=(string)($b['old_password']??''); $new=(string)($b['new_password']??'');
  if(strlen($new)<10) out(['error'=>'رمز جدید باید حداقل ۱۰ نویسه باشد.'],422);
  $q=$db->prepare('SELECT password_hash FROM users WHERE id=?'); $q->execute([$u['id']]); $hash=$q->fetchColumn();
  if(!$hash||!password_verify($old,$hash)) out(['error'=>'رمز فعلی درست نیست.'],401);
  $q=$db->prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?'); $q->execute([password_hash($new,PASSWORD_DEFAULT),$u['id']]); $_SESSION['user']['must_change_password']=false; out(['ok'=>true]);
}
out(['error'=>'مسیر درخواست معتبر نیست.'],404);
