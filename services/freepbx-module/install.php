<?php
defined('FREEPBX_IS_AUTH') or die('No direct script access allowed');

$database = \FreePBX::Database();

$sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS materialpbx_resources (
  resource_kind VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL,
  display_name VARCHAR(256) NOT NULL,
  configuration LONGTEXT NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (resource_kind, resource_id),
  CONSTRAINT materialpbx_configuration_json CHECK (JSON_VALID(configuration))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
$database->prepare($sql)->execute();
$database->prepare("CREATE TABLE IF NOT EXISTS materialpbx_compiled (resource_kind VARCHAR(64) NOT NULL, resource_id VARCHAR(128) NOT NULL, compiler VARCHAR(128) NOT NULL, artifact LONGTEXT NOT NULL, updated_at DATETIME(6) NOT NULL, PRIMARY KEY(resource_kind, resource_id), CONSTRAINT materialpbx_artifact_json CHECK (JSON_VALID(artifact))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")->execute();
$database->prepare("CREATE TABLE IF NOT EXISTS materialpbx_compiler_snapshots (snapshot_id CHAR(36) NOT NULL PRIMARY KEY, resource_kind VARCHAR(64) NOT NULL, resource_id VARCHAR(128) NOT NULL, prior_compiler VARCHAR(128) NULL, prior_artifact LONGTEXT NULL, created_at DATETIME(6) NOT NULL, restored_at DATETIME(6) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")->execute();
