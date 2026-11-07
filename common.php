<?php
declare(strict_types=1);
// Shared secure API bootstrap. Requires PHP 8+ and PDO MySQL.
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_name('taha_session');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$isHttps,'httponly'=>true,'samesite'=>'Lax']);
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');
$configPath = __DIR__.'/config.php';
if (!is_file($configPath)) { http_response_code(503); echo json_encode(['error'=>'فایل api/config.php را از روی config.example.php بسازید و تنظیم کنید.'],JSON_UNESCAPED_UNICODE); exit; }
$config = require $configPath;
try {
  $db = new PDO('mysql:host='.$config['db']['host'].';dbname='.$config['db']['name'].';charset=utf8mb4',$config['db']['user'],$config['db']['pass'],[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES=>false
  ]);
} catch (Throwable $e) { http_response_code(503); echo json_encode(['error'=>'اتصال پایگاه داده برقرار نشد. تنظیمات دیتابیس را بررسی کنید.'],JSON_UNESCAPED_UNICODE); exit; }
function out(array $data,int $status=200): never { http_response_code($status); echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function body(): array { $v=json_decode(file_get_contents('php://input'),true); return is_array($v)?$v:$_POST; }
function clean_name(string $s): string { return trim(preg_replace('/\s+/u',' ',$s)??''); }
function current_user(): ?array { return $_SESSION['user']??null; }
function require_login(): array { global $db; $u=current_user(); if(!$u) out(['error'=>'برای ادامه وارد حساب شوید.'],401); $q=$db->prepare('SELECT active FROM users WHERE id=?'); $q->execute([(int)$u['id']]); $active=$q->fetchColumn(); if($active===false || !(int)$active){$_SESSION=[];session_destroy();out(['error'=>'این حساب غیرفعال شده است؛ دوباره وارد شوید.'],401);} return $u; }
function require_admin(): array { $u=require_login(); if($u['role']!=='admin') out(['error'=>'این عملیات فقط برای مدیر اصلی مجاز است.'],403); return $u; }
function require_csrf(): void { $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??($_POST['csrf']??'')); if(empty($_SESSION['csrf'])||!hash_equals($_SESSION['csrf'],$token)) out(['error'=>'درخواست منقضی یا نامعتبر است؛ صفحه را تازه کنید.'],403); }
function teacher_scopes(PDO $db,int $id): array { $q=$db->prepare('SELECT grade,field_name,branch,subject_name FROM teacher_scopes WHERE user_id=? ORDER BY grade,field_name,branch,subject_name'); $q->execute([$id]); return $q->fetchAll(); }
function group_name(array $x): string { return $x['grade'].' '.$x['field_name'].' شعبه '.$x['branch']; }
function can_access_group(PDO $db,array $u,string $group,?string $subject=null): bool {
  if($u['role']==='admin') return true;
  if($u['role']==='student') return $group===group_name($u);
  foreach(teacher_scopes($db,(int)$u['id']) as $s) if($group===group_name($s) && ($subject===null || $subject==='' || $subject===$s['subject_name'])) return true;
  return false;
}
// Create the first administrator once. Never place this password in frontend files.
$adminCount=(int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
if($adminCount===0 && !empty($config['bootstrap_admin_password']) && $config['bootstrap_admin_password']!=='CHANGE-THIS-STRONG-PASSWORD') {
  $q=$db->prepare("INSERT INTO users(full_name,login_name,role,password_hash,must_change_password) VALUES(?,?,'admin',?,0)");
  $q->execute([$config['bootstrap_admin_name']??'مدیر اصلی',$config['bootstrap_admin_login']??'admin',password_hash($config['bootstrap_admin_password'],PASSWORD_DEFAULT)]);
}
