<?php
class FreePBX_Helpers { public function __construct($freepbx = null) {} }
interface BMO {}
final class FreePBX {
    public static $conferenceApi;
    public static $facade;
    public static function Conferences() { return self::$conferenceApi; }
    public static function create() { return self::$facade; }
}

$GLOBALS['conferenceExtensionUsage'] = [];
$GLOBALS['conferenceRangeAllowed'] = true;
$GLOBALS['conferenceDestinationChanges'] = [];
$GLOBALS['conferenceDestinationFailure'] = false;
function checkRange($room): bool { return $GLOBALS['conferenceRangeAllowed']; }
function framework_check_extension_usage($room): array { return $GLOBALS['conferenceExtensionUsage'][(string)$room] ?? []; }
function conferences_getdest($room): array { return ['ext-meetme,' . (string)$room . ',1']; }
function framework_change_destination($from, $to) {
    $GLOBALS['conferenceDestinationChanges'][] = [(string)$from, (string)$to];
    if ($GLOBALS['conferenceDestinationFailure']) { $GLOBALS['conferenceDestinationFailure'] = false; return false; }
    return null;
}

require_once dirname(__DIR__) . '/NativeCompilerRegistry.php';
require_once dirname(__DIR__) . '/Materialpbx.class.php';

use FreePBXmodules\Materialpbx\NativeCompilerRegistry;
use FreePBX\modules\Materialpbx;

function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function expectFailure(callable $operation, string $message): Throwable {
    try { $operation(); } catch (Throwable $error) { return $error; }
    throw new RuntimeException($message);
}
function resource(array $configuration, string $id = 'conference-700', string $name = 'Team room', bool $enabled = true): array {
    return ['kind' => 'conferences', 'id' => $id, 'displayName' => $name, 'enabled' => $enabled, 'configuration' => $configuration];
}

$base = ['number' => '700', 'maxParticipants' => 20, 'recordConference' => false, 'announceJoinLeave' => false, 'startMuted' => false, 'musicOnHoldWhenEmpty' => false, 'quiet' => false];
$registry = new NativeCompilerRegistry();
$first = $registry->preview(resource($base));
$second = $registry->preview(resource($base));
check($first === $second, 'Conference compilation must be deterministic');
check($first['status'] === 'compiled' && $first['compiler'] === 'conference-freepbx-bmo-v1', 'Conference compiler dispatch is missing');
check($first['artifact']['route'] === 'FreePBX::Conferences', 'Compiler must declare the proven Conferences BMO route');
check($first['artifact']['options'] === 's', 'Default conference must enable only the standard user menu');
check($first['artifact']['users'] === 20, 'Participant cap must map to FreePBX users');
check(strlen($first['artifact']['description']) <= 50 && str_starts_with($first['artifact']['description'], $first['artifact']['ownership']['descriptionPrefix']), 'Description must retain the ownership prefix within 50 bytes');

foreach ([2, 200] as $bound) check($registry->preview(resource(array_merge($base, ['maxParticipants' => $bound])))['status'] === 'compiled', "Participant bound {$bound} must compile");
foreach ([1, 201, 2.5, '20'] as $invalid) check($registry->preview(resource(array_merge($base, ['maxParticipants' => $invalid])))['status'] === 'unsupported', 'Malformed participant limit must not compile');
foreach (['1', '1234567890123', '70A'] as $invalid) check($registry->preview(resource(array_merge($base, ['number' => $invalid])))['status'] === 'unsupported', 'Malformed room number must not compile');
check($registry->preview(resource(array_merge($base, ['recordConference' => 'yes'])))['status'] === 'unsupported', 'Wrong boolean type must not compile');
check($registry->preview(resource(array_merge($base, ['announceJoinLeave' => true, 'quiet' => true])))['status'] === 'unsupported', 'Quiet and recorded-name announcements must conflict');
$muted = $registry->preview(resource(array_merge($base, ['startMuted' => true])));
check(str_contains($muted['artifact']['options'], 'm') && str_contains($muted['artifact']['options'], 's'), 'Start muted must retain the *1 user-menu unmute route');
check($registry->preview(resource($base, 'conference-700', 'Team room', false))['status'] === 'remove', 'Disabled conference must compile to owned removal');
$cjk = $registry->preview(resource($base, 'conference-cjk', '香港電話會議室測試名稱'));
check($cjk['status'] === 'compiled' && strlen($cjk['artifact']['description']) <= 50 && preg_match('//u', $cjk['artifact']['description']) === 1, 'Traditional Chinese description must remain valid UTF-8 within 50 bytes');
check(str_starts_with($cjk['artifact']['description'], $cjk['artifact']['ownership']['descriptionPrefix']), 'CJK truncation must preserve the ownership prefix');

final class FakeAstman {
    public function __construct(private FakeConferencesApi $api) {}
    public function database_show($family) {
        $room = substr((string)$family, strlen('CONFERENCE/'));
        if ($this->api->failure === 'astdb-read') throw new RuntimeException('injected AstDB read failure');
        $values = $this->api->astdb[$room] ?? [];
        $result = [];
        foreach ($values as $key => $value) $result['/CONFERENCE/' . $room . '/' . $key] = (string)$value;
        return $result;
    }
    public function database_put($family, $key, $value) {
        $room = substr((string)$family, strlen('CONFERENCE/'));
        $this->api->astdb[$room][(string)$key] = (string)$value;
        return true;
    }
    public function database_deltree($family) {
        $room = substr((string)$family, strlen('CONFERENCE/'));
        unset($this->api->astdb[$room]);
        return true;
    }
}

final class FakeRecordings {
    public array $files = [9 => 'custom/join-message'];
    public function getFilenameById($id) { return $this->files[(int)$id] ?? ''; }
}

final class FakeModules {
    public function __construct(public bool $sangomaInstalled = false) {}
    public function checkStatus($module) { return $module === 'sangomartapi' && $this->sangomaInstalled; }
}

final class FakeConferencesApi {
    public array $rows = [];
    public array $astdb = [];
    public ?string $failure = null;
    public int $deleteCalls = 0;
    public int $addCalls = 0;
    public function getConference($room, $processAstDb = true) { throw new RuntimeException('getConference must never be used for absence detection'); }
    public function getAllConferences() {
        if ($this->failure === 'list-false') return false;
        return array_values($this->rows);
    }
    private function runtime($options, $userpin, $adminpin, $music, $users, $language, $timeout, $joinmsg_id): array {
        return ['language'=>(string)$language,'userpin'=>(string)$userpin,'adminpin'=>(string)$adminpin,'options'=>(string)$options,'music'=>(string)$music,'users'=>(string)(!empty($users)?$users:0),'joinmsg'=>$joinmsg_id === 9 ? 'custom/join-message' : '','timeout'=>(string)(!empty($timeout)?$timeout:21600)];
    }
    public function addConference($room, $name, $userpin, $adminpin, $options, $joinmsg_id = null, $music = '', $users = 0, $language = '', $timeout = 21600) {
        $this->addCalls++;
        $this->rows[(string)$room] = ['exten'=>(string)$room,'description'=>$name,'userpin'=>(string)$userpin,'adminpin'=>(string)$adminpin,'options'=>$options,'joinmsg_id'=>$joinmsg_id,'music'=>$music,'users'=>$users,'language'=>$language,'timeout'=>$timeout];
        $this->astdb[(string)$room] = $this->runtime($options,$userpin,$adminpin,$music,$users,$language,$timeout,$joinmsg_id);
        unset($this->astdb[(string)$room]['timeout']); // Matches upstream addConference(): timeout is SQL-only until MaterialPBX writes it.
        if ($this->failure === 'add-after-insert') { $this->failure = null; throw new RuntimeException('injected add failure'); }
        if ($this->failure === 'add-external-winner') {
            $this->failure = null;
            $this->rows[(string)$room] = ['exten'=>(string)$room,'description'=>'External winner','userpin'=>'42','adminpin'=>'99','options'=>'q','joinmsg_id'=>9,'music'=>'classical','users'=>55,'language'=>'fr','timeout'=>3600];
            throw new RuntimeException('injected duplicate-key race after candidate AstDB writes');
        }
        return true;
    }
    public function updateConferenceSettingById($room, $key, $value) {
        if (!isset($this->rows[(string)$room])) return false;
        $this->rows[(string)$room][$key] = $value;
        if ($key !== 'description' && $key !== 'joinmsg_id') $this->astdb[(string)$room][$key] = (string)($value ?? '');
        if ($key === 'joinmsg_id') $this->astdb[(string)$room]['joinmsg'] = $value === 9 ? 'custom/join-message' : '';
        if ($this->failure === 'update-after-option' && $key === 'options') { $this->failure = null; throw new RuntimeException('injected update failure'); }
        return null;
    }
    public function deleteConference($room) {
        $this->deleteCalls++;
        if ($this->failure === 'delete-refuse') { $this->failure = null; return false; }
        unset($this->rows[(string)$room]);
        unset($this->astdb[(string)$room]);
        return true;
    }
}

function useConferenceApi(FakeConferencesApi $api, bool $sangomaInstalled = false): void {
    FreePBX::$conferenceApi = $api;
    FreePBX::$facade = (object)['astman' => new FakeAstman($api), 'Recordings' => new FakeRecordings(), 'Modules' => new FakeModules($sangomaInstalled)];
    $GLOBALS['conferenceExtensionUsage'] = [];
    $GLOBALS['conferenceRangeAllowed'] = true;
    $GLOBALS['conferenceDestinationChanges'] = [];
    $GLOBALS['conferenceDestinationFailure'] = false;
}

$provisionLockDirectory = new ReflectionMethod(Materialpbx::class, 'ensureConferenceLockDirectory');
$provisionLockDirectory->setAccessible(true);
$lockDirectoryPath = $provisionLockDirectory->invoke(null, true);
check($lockDirectoryPath === '/var/lib/materialpbx/locks', 'Conference serialization must use persistent module data rather than volatile /run state');

$transition = new ReflectionMethod(Materialpbx::class, 'transitionConferenceArtifacts');
$transition->setAccessible(true);
$compensate = new ReflectionMethod(Materialpbx::class, 'compensateConferenceArtifacts');
$compensate->setAccessible(true);
$module = new Materialpbx();
$old = $first['artifact'];
$updated = $registry->preview(resource(array_merge($base, ['recordConference' => true]), 'conference-700', 'Updated room'))['artifact'];
$moved = $registry->preview(resource(array_merge($base, ['number' => '701']), 'conference-700', 'Moved room'))['artifact'];

$api = new FakeConferencesApi(); useConferenceApi($api);
$transition->invoke($module, null, $old);
check($api->astdb['700'] === ['language'=>'','userpin'=>'','adminpin'=>'','options'=>$old['options'],'music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600'], 'Create must explicitly write all eight runtime keys, including timeout omitted by upstream addConference');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->failure = 'add-after-insert';
$error = expectFailure(fn() => $transition->invoke($module, null, $old), 'Partial create must fail');
check(str_contains($error->getMessage(), 'compensation restored'), 'Partial create must report successful compensation');
check($api->rows === [] && $api->astdb === [], 'Partial create compensation must remove the inserted room and every AstDB key');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->failure = 'add-external-winner';
$beforeDeletes = $api->deleteCalls;
$error = expectFailure(fn() => $transition->invoke($module, null, $old), 'Duplicate room race must fail');
check(str_contains($error->getMessage(), 'compensation restored'), 'Duplicate room race must report bounded compensation');
check($api->deleteCalls === $beforeDeletes && $api->rows['700']['description'] === 'External winner', 'Duplicate room race must not delete or adopt the external winner');
check($api->astdb['700'] === ['language'=>'fr','userpin'=>'42','adminpin'=>'99','options'=>'q','music'=>'classical','users'=>'55','joinmsg'=>'custom/join-message','timeout'=>'3600'], 'Partial add compensation must restore every external winner AstDB key from its SQL row');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->failure = 'update-after-option';
$error = expectFailure(fn() => $transition->invoke($module, $old, $updated), 'Partial update must fail');
check(str_contains($error->getMessage(), 'compensation restored'), 'Partial update must report successful compensation');
check($api->rows['700'] === ['exten'=>'700','description'=>$old['description'],'userpin'=>'','adminpin'=>'','options'=>$old['options'],'joinmsg_id'=>null,'music'=>'','users'=>$old['users'],'language'=>'','timeout'=>21600], 'Partial update compensation must restore every SQL setting');
check($api->astdb['700'] === ['language'=>'','userpin'=>'','adminpin'=>'','options'=>$old['options'],'music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600'], 'Partial update compensation must restore every AstDB setting');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->failure = 'delete-refuse';
$error = expectFailure(fn() => $transition->invoke($module, $old, $moved), 'Partial room-number change after destination rewrite must fail');
check(str_contains($error->getMessage(), 'compensation restored'), 'Room-number compensation must be reported');
check(isset($api->rows['700']) && !isset($api->rows['701']), 'Room-number compensation must restore the old room and remove the replacement');
check($GLOBALS['conferenceDestinationChanges'] === [['ext-meetme,700,1','ext-meetme,701,1'],['ext-meetme,701,1','ext-meetme,700,1']], 'Room-number compensation must explicitly reverse the destination rewrite');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600';
$transition->invoke($module, $old, $moved);
check(!isset($api->rows['700']) && isset($api->rows['701']), 'Successful room-number change must move the owned row');
check($GLOBALS['conferenceDestinationChanges'] === [['ext-meetme,700,1','ext-meetme,701,1']], 'Successful room-number change must rewrite existing destinations exactly once');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->failure = 'delete-refuse';
$error = expectFailure(fn() => $transition->invoke($module, $old, null), 'Delete refusal must fail');
check(str_contains($error->getMessage(), 'compensation restored') && isset($api->rows['700']), 'Delete refusal with intact source must be treated as restored');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->rows['700']['options'] = 'qs';
$before = $api->rows;
expectFailure(fn() => $transition->invoke($module, $old, $old), 'Unchanged reapply must detect native drift');
check($api->rows === $before, 'Drift detection must fail closed without repairing or overwriting the external change');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->rows['700'] = ['exten'=>'700','description'=>'External room','userpin'=>'','adminpin'=>'','options'=>'s','joinmsg_id'=>null,'music'=>'','users'=>20,'language'=>'','timeout'=>21600]; $api->astdb['700']=['language'=>'','userpin'=>'','adminpin'=>'','options'=>'s','music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600'];
$beforeDeletes = $api->deleteCalls;
expectFailure(fn() => $transition->invoke($module, $old, null), 'Non-owned deletion must fail');
check($api->deleteCalls === $beforeDeletes && isset($api->rows['700']), 'Non-owned conference must never be deleted');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->astdb['700'] = ['language'=>'','userpin'=>'','adminpin'=>'','options'=>$old['options'],'music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600'];
$compensate->invoke($module, $old, null);
check(!isset($api->astdb['700']), 'Compensation must clear AstDB even when PDO rollback already removed the SQL row');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->astdb['700'] = ['language'=>'en','userpin'=>'7','adminpin'=>'8','options'=>$updated['options'],'music'=>'jazz','users'=>'99','joinmsg'=>'wrong','timeout'=>'1'];
$compensate->invoke($module, $updated, $old);
check($api->astdb['700'] === ['language'=>'','userpin'=>'','adminpin'=>'','options'=>$old['options'],'music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600'], 'Compensation must restore every AstDB key when PDO rollback already restored the old SQL row');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $api->astdb = ['701'=>['language'=>'','userpin'=>'','adminpin'=>'','options'=>$moved['options'],'music'=>'','users'=>'20','joinmsg'=>'','timeout'=>'21600']];
$compensate->invoke($module, $moved, $old);
check(!isset($api->astdb['701']) && isset($api->astdb['700']), 'Room-change compensation must remove replacement AstDB state and restore the old room state after PDO rollback');

$api = new FakeConferencesApi(); useConferenceApi($api); $GLOBALS['conferenceExtensionUsage']['700'] = [['description'=>'Existing feature']];
expectFailure(fn() => $transition->invoke($module, null, $old), 'Extension usage conflict must block conference creation');
check($api->addCalls === 0 && $api->rows === [], 'Extension conflict must fail before any conference mutation');

$api = new FakeConferencesApi(); useConferenceApi($api); $GLOBALS['conferenceRangeAllowed'] = false;
expectFailure(fn() => $transition->invoke($module, null, $old), 'FreePBX range refusal must block conference creation');
check($api->addCalls === 0 && $api->rows === [], 'Range refusal must fail before any conference mutation');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $GLOBALS['conferenceRangeAllowed'] = false;
expectFailure(fn() => $transition->invoke($module, $old, $updated), 'FreePBX range refusal must block same-room updates');
check($api->rows['700']['options'] === $old['options'] && $api->deleteCalls === 0, 'Source range refusal must fail before an update mutation');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600'; $GLOBALS['conferenceRangeAllowed'] = false;
expectFailure(fn() => $transition->invoke($module, $old, null), 'FreePBX range refusal must block conference deletion');
check(isset($api->rows['700']) && $api->deleteCalls === 0, 'Source range refusal must fail before a delete mutation');

$api = new FakeConferencesApi(); useConferenceApi($api, true); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600';
expectFailure(fn() => $transition->invoke($module, $old, null), 'Sangoma REST integration must disable uncompensated deletion');
check($api->deleteCalls === 0 && isset($api->rows['700']), 'Sangoma REST integration refusal must happen before deletion');

$api = new FakeConferencesApi(); useConferenceApi($api, true); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); $api->astdb['700']['timeout'] = '21600';
expectFailure(fn() => $transition->invoke($module, $old, $moved), 'Sangoma REST integration must disable uncompensated room moves');
check($api->addCalls === 1 && $api->deleteCalls === 0 && $GLOBALS['conferenceDestinationChanges'] === [], 'Sangoma REST integration refusal must happen before move mutation');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->failure = 'list-false';
expectFailure(fn() => $transition->invoke($module, null, $old), 'Invalid conference table read must fail closed');
check($api->addCalls === 0, 'A failed SQL existence read must never be treated as absence');

$api = new FakeConferencesApi(); useConferenceApi($api); $api->addConference($old['room'], $old['description'], '', '', $old['options'], null, '', $old['users']); unset($api->astdb['700']['timeout']);
expectFailure(fn() => $transition->invoke($module, $old, $old), 'Unchanged reapply must detect a missing AstDB key');

$lock = new ReflectionMethod(Materialpbx::class, 'withConferenceLocks'); $lock->setAccessible(true);
$lockObserved = $lock->invoke(null, ['700'], function (): bool {
    $path = '/var/lib/materialpbx/locks/conference-' . hash('sha256', '700') . '.lock';
    $probe = fopen($path, 'c+b');
    $blocked = flock($probe, LOCK_EX | LOCK_NB) === false;
    fclose($probe);
    return $blocked;
});
check($lockObserved, 'Conference serialization lock must exclude a duplicate room writer');
$lockDirectory = lstat('/var/lib/materialpbx/locks');
check($lockDirectory !== false && (int)$lockDirectory['uid'] === 0 && (((int)$lockDirectory['mode'] & 0007) === 0), 'Conference serialization must use a root-owned runtime directory with no access for other users');

echo "ConfBridge focused checks passed: deterministic compilation and the exercised native safety cases completed without an assertion failure.\n";
