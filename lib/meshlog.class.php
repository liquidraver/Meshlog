<?php

require_once 'utils.php';
require_once 'meshlog.entity.class.php';
require_once 'meshlog.advertisement.class.php';
require_once 'meshlog.contact.class.php';
require_once 'meshlog.direct_message.class.php';
require_once 'meshlog.channel_message.class.php';
require_once 'meshlog.channel.class.php';
require_once 'meshlog.reporter.class.php';

define("MAX_COUNT", 5000);
define("DEFAULT_COUNT", 500);

class MeshLog {

   public $pdo;

    function __construct($pdo) {
        $this->pdo = $pdo;
    }

    function __destruct() {
        $this->pdo = null;
    }

    function authorize($data) {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) return false;
        if (!isset($data['reporter'])) return false;

        $count = 1;
        $pubkey = $data['reporter'];
        $token = $_SERVER['HTTP_AUTHORIZATION'];
        $token = str_replace("Bearer ", "", $token, $count);

        $query = $this->pdo->prepare('SELECT * FROM reporters WHERE public_key = :pubkey AND auth = :auth AND authorized = 1');
        $query->bindParam(':pubkey',$pubkey, PDO::PARAM_STR);
        $query->bindParam(':auth',  $token,  PDO::PARAM_STR);
        $query->execute();

        $result = $query->fetch(PDO::FETCH_ASSOC);

        if (!$result) return false;

        return MeshLogReporter::fromDb($result, $this);
    }

    function insert($data) {
        $reporter = $this->authorize($data);
        if (!$reporter) return false;

        if (!isset($data['type'])) return $this->repError('invalid type');

        $type = $data['type'];

        switch ($type) {
            case 'ADV':
                return $this->insertAdvertisement($data, $reporter);
                break;
            case 'MSG':
                return $this->insertDirectMessage($data, $reporter);
                break;
            case 'PUB':
                return $this->insertGroupMessage($data, $reporter);
                break;
            case 'SYS':
                return $this->insertSelfReport($data, $reporter);
                break;
            case 'RAW':
                return;
                break;
        }

        error_log("Unknowwn type: $type");
    }

    private function insertAdvertisement($data, $reporter) {
        if (!$reporter) return $this->repError('no reporter');

        $pubkey = $data['contact']['pubkey'] ?? null;
        if (!$pubkey) return $this->repError('no key');

        $encname = $data['contact']['name'];
        $data['contact']['name'] = $encname;

        $contact = MeshLogContact::findBy("public_key", $pubkey, $this);

        if ($contact) {
            $contact->name = $data['contact']['name'];
        } else {
            $contact = MeshLogContact::fromJson($data, $this);
            $contact->name = $data['contact']['name'];
        }
        if (!$contact->save($this)) return $this->repError('failed to save contact');

        $adv = MeshLogAdvertisement::fromJson($data, $this);
        $adv->reporter_ref = $reporter;
        $adv->contact_ref = $contact;

        return $adv->save($this);
    }

    private function insertDirectMessage($data, $reporter) {
        if (!$reporter) return $this->repError('no reporter');

        $pubkey = $data['contact']['pubkey'] ?? null;
        if (!$pubkey) return $this->repError('no key');

        $contact = MeshLogContact::findBy("public_key", $pubkey, $this);
        if (!$contact) {
            $contact = MeshLogContact::fromJson($data, $this);
            if (!$contact->save($this)) return $this->repError('failed to save contact');
        }

        $dm = MeshLogDirectMessage::fromJson($data, $this);
        $dm->reporter_ref = $reporter;
        $dm->contact_ref = $contact;

        return $dm->save($this);
    }

    private function insertGroupMessage($data, $reporter) {
        if (!$reporter) return $this->repError('no reporter');

        $hash = $data['channel']['hash'] ?? '11';
        $text = $data['message']['text'] ?? null;
        
        if (!$text) return $this->repError('no message');
        $name = explode(':', $text, 2)[0];

        $channel = MeshLogChannel::findBy("hash", $hash, $this);

        if (!$channel) {
            // Channel doesn't exist, create it
            $channel = MeshLogChannel::fromJson($data, $this);
            if (!$channel->save($this)) return $this->repError('failed to save channel');
        } else {
            // Channel exists - only update name if current name is "unknown" and JSON has a better one
            if (($channel->name === 'unknown' || $channel->name === null || $channel->name === '')) {
                $json_name = $data['channel']['name'] ?? null;
                if ($json_name && $json_name !== 'unknown') {
                    $channel->name = $json_name;
                    $channel->save($this);
                }
            }
        }

        $advertisement = MeshLogAdvertisement::findBy("name", $name, $this);
        $contact = null;
        if ($advertisement) $contact = MeshLogContact::findById($advertisement->contact_ref->getId(), $this);

        $grpmsg = MeshLogChannelMessage::fromJson($data, $this);
        $grpmsg->reporter_ref = $reporter;
        $grpmsg->contact_ref = $contact;
        $grpmsg->channel_ref = $channel;

        return $grpmsg->save($this);
    }

    // TODO
    private function insertSelfReport($data, $reporter) {
        if (!$reporter) return null;
        $lat = $data['contact']['lat'] ?? null;
        $lon = $data['contact']['lon'] ?? null;
        $reporter->updateLocation($this, $lat, $lon);
	return null;
    }

    private function repError($msg) {
        return array('error' => $msg);
    }

    // getters
    public function getReporters($params) {
        $params['where'] = array(
            'authorized = 1'
        );
        return MeshLogReporter::getAll($this, $params);
    }

    public function getContacts($params, $adv=FALSE) {
        $params['where'] = array(
            'enabled = 1'
        );

        $results = MeshLogContact::getAll($this, $params);

        if ($params['advertisements']) {
            foreach ($results['objects'] as $k => $c) {
                $id = $c['id'];
                $ad = MeshLogAdvertisement::findBy("contact_id", $id, $this);
                if ($ad) {
                    $results['objects'][$k]['advertisement'] = $ad->asArray();
                } else {
                    $results['objects'][$k]['advertisement'] = $ad;
                }
            }
        }

        return $results;
    }

    public function getAdvertisements($params) {
        $params['where'] = array();
        return MeshLogAdvertisement::getAll($this, $params);
    }

    public function getChannels($params) {
        $params['where'] = array();
        return MeshLogChannel::getAll($this, $params);
    }

    public function getChannelMessages($params) {
        $params['where'] = array();
        if (isset($params['id'])) {
            $params['where'] = array('channel_id = :channel_id', array(
                array(':channel_id', intval($params['id']), PDO::PARAM_INT)
            ));
        }

        return MeshLogChannelMessage::getAll($this, $params);
    }

    public function getDirectMessages($params) {
        $params['where'] = array();
        if (isset($params['id'])) {
            $params['where'] = array('contact_id = :contact_id', array(
                array(':contact_id', intval($params['id']), PDO::PARAM_INT)
            ));
        }

        return MeshLogDirectMessage::getAll($this, $params);
    }
};

?>
