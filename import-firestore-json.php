<?php
// CLI-only importer for a normalized JSON export from the previous Firestore app.
// Input format: {"lessons":[{group,day,dayOrder,time,timeOrder,name,teacher}],"tasks":[{group,day,dayOrder,title,desc}]}
if (PHP_SAPI !== 'cli') { http_response_code(404); exit("Not found\n"); }
require __DIR__.'/../api/common.php';
$file=$argv[1]??'';
if(!$file||!is_file($file)){fwrite(STDERR,"Usage: php import-firestore-json.php /path/to/export.json\n");exit(2);}
$data=json_decode(file_get_contents($file),true);
if(!is_array($data)){fwrite(STDERR,"Invalid JSON file\n");exit(2);}
$db->beginTransaction();
try{
 $lq=$db->prepare('INSERT INTO lessons(`group`,day,dayOrder,`time`,timeOrder,name,teacher) VALUES(?,?,?,?,?,?,?)');
 foreach(($data['lessons']??[]) as $x){$lq->execute([(string)($x['group']??''),(string)($x['day']??''),(int)($x['dayOrder']??0),(string)($x['time']??''),(int)($x['timeOrder']??0),(string)($x['name']??''),(string)($x['teacher']??'')]);}
 $tq=$db->prepare('INSERT INTO tasks(`group`,day,dayOrder,title,`desc`) VALUES(?,?,?,?,?)');
 foreach(($data['tasks']??[]) as $x){$tq->execute([(string)($x['group']??''),(string)($x['day']??''),(int)($x['dayOrder']??0),(string)($x['title']??''),(string)($x['desc']??'')]);}
 $db->commit(); echo "Imported ".count($data['lessons']??[])." lessons and ".count($data['tasks']??[])." tasks.\n";
}catch(Throwable $e){$db->rollBack();fwrite(STDERR,"Import failed: ".$e->getMessage()."\n");exit(1);}
