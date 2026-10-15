<?php
/**
 * Plugin Name:       Himalayan Koh — LeadOS & CRM
 * Description:       Custom tables and REST endpoints for the LeadOS prospect engine and the CRM lead inbox. This is the WordPress side of the app's Supabase → WordPress migration; the Next.js app talks to the leados/v1 and crm/v1 namespaces below.
 * Version:           2.3.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Himalayan Koh
 *
 * WHY A PLUGIN AND NOT A THEME SNIPPET
 * ------------------------------------
 * `dbDelta` needs to run on activation, once, not on every page load — a theme's
 * functions.php is the wrong lifetime and would re-run the schema diff on every
 * front-end request. A plugin also keeps this code out of the next theme update.
 *
 * AUTHENTICATION
 * --------------
 * Every endpoint here requires the `manage_options` capability. The app's server
 * authenticates with a WordPress **application password** for an administrator
 * account (Basic auth over HTTPS), so WordPress itself decides who is allowed in;
 * no second password and no shared secret is invented here.
 *
 * DATA SHAPE
 * ----------
 * Rows come back with the same snake_case column names the application already
 * used against Supabase, so the app-side mapping did not have to be rewritten.
 * JSON-ish columns (tags, industries, opportunity_signals, metadata) are stored
 * as JSON text and returned decoded.
 *
 * INSTALL
 * -------
 * Copy this file to wp-content/plugins/himalayan-koh-leados/himalayan-koh-leados.php
 * or zip the folder and use Plugins → Add New → Upload Plugin, then activate it.
 * Activation creates the tables; deactivation does NOT drop them (data loss
 * should be a deliberate act).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'HK_LEADOS_VERSION', '2.3.0' );
define( 'HK_LEADOS_WORKSPACE_ID', '00000000-0000-0000-0000-000000000001' );
define( 'HK_LEADOS_DEFAULT_PROJECT_ID', '00000000-0000-0000-0000-000000000002' );
require_once __DIR__ . '/himalayan-koh-leados-intelligence.php';
add_action( 'plugins_loaded', function () {
	if ( get_option( 'hk_leados_db_version' ) !== HK_LEADOS_VERSION ) { hk_leados_install(); }
} );

/** Columns that hold JSON text and are decoded on the way out. */
function hk_leados_json_columns() {
	return array(
		'leados_projects' => array( 'industries', 'business_categories', 'preferred_locations', 'countries', 'positive_keywords', 'negative_keywords' ),
		'leados_leads'    => array( 'opportunity_signals', 'tags' ),
		'leados_project_leads' => array( 'project_fit_reasons', 'outreach_angles' ),
		'crm_leads'       => array( 'metadata' ),
	);
}

/* -------------------------------------------------------------------------
 * Schema
 * ---------------------------------------------------------------------- */

/**
 * Creates/updates the tables. Safe to call repeatedly — that is what dbDelta
 * does, and it is why the schema lives here rather than in a one-off SQL box
 * nobody can find again.
 */
function hk_leados_install() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$charset = $wpdb->get_charset_collate();
	$p       = $wpdb->prefix;

	$sql = array();

	$sql[] = "CREATE TABLE {$p}leados_workspaces (
		id varchar(64) NOT NULL,
		name varchar(191) NOT NULL,
		slug varchar(191) NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_projects (
		id varchar(64) NOT NULL,
		workspace_id varchar(64) NOT NULL,
		name varchar(191) NOT NULL,
		website varchar(255) DEFAULT NULL,
		short_description text DEFAULT NULL,
		product_service text DEFAULT NULL,
		target_customer_description text DEFAULT NULL,
		industries longtext DEFAULT NULL,
		business_categories longtext DEFAULT NULL,
		preferred_locations longtext DEFAULT NULL,
		countries longtext DEFAULT NULL,
		target_business_size varchar(191) DEFAULT NULL,
		positive_keywords longtext DEFAULT NULL,
		negative_keywords longtext DEFAULT NULL,
		ideal_customer_profile text DEFAULT NULL,
		notes text DEFAULT NULL,
		status varchar(32) NOT NULL DEFAULT 'active',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY workspace_id (workspace_id)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_leads (
		id varchar(64) NOT NULL,
		workspace_id varchar(64) NOT NULL,
		business_name varchar(255) NOT NULL,
		category varchar(191) DEFAULT NULL,
		address varchar(255) DEFAULT NULL,
		city varchar(191) DEFAULT NULL,
		region varchar(191) DEFAULT NULL,
		country varchar(191) DEFAULT NULL,
		website varchar(255) DEFAULT NULL,
		phone varchar(64) DEFAULT NULL,
		email varchar(191) DEFAULT NULL,
		email_source varchar(32) DEFAULT NULL,
		latitude decimal(10,7) DEFAULT NULL,
		longitude decimal(10,7) DEFAULT NULL,
		osm_type varchar(16) DEFAULT NULL,
		osm_id varchar(64) DEFAULT NULL,
		osm_url varchar(255) DEFAULT NULL,
		data_source varchar(64) DEFAULT NULL,
		dedupe_key varchar(64) DEFAULT NULL,
		research longtext DEFAULT NULL,
		opportunity_score decimal(6,2) DEFAULT NULL,
		opportunity_signals longtext DEFAULT NULL,
		status varchar(32) NOT NULL DEFAULT 'new',
		starred tinyint(1) NOT NULL DEFAULT 0,
		tags longtext DEFAULT NULL,
		notes text DEFAULT NULL,
		discovered_at datetime DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY workspace_status (workspace_id, status),
		UNIQUE KEY workspace_identity (workspace_id, dedupe_key),
		KEY osm_lookup (workspace_id, data_source, osm_type, osm_id),
		KEY business_name (business_name),
		KEY region_idx (region),
		KEY category_idx (category),
		KEY created_at_idx (created_at)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_project_leads (
		project_id varchar(64) NOT NULL,
		lead_id varchar(64) NOT NULL,
		project_fit_score decimal(6,2) DEFAULT NULL,
		project_fit_reasons longtext DEFAULT NULL,
		outreach_angles longtext DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (project_id, lead_id),
		KEY lead_id (lead_id)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_searches (
		id varchar(64) NOT NULL,
		workspace_id varchar(64) NOT NULL,
		query_category varchar(191) NOT NULL,
		query_location varchar(191) NOT NULL,
		results_count int NOT NULL DEFAULT 0,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY workspace_created (workspace_id, created_at)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_audit_logs (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		workspace_id varchar(64) NOT NULL,
		action varchar(191) NOT NULL,
		details longtext DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY workspace_created (workspace_id, created_at)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}crm_leads (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		email varchar(191) NOT NULL,
		name varchar(191) DEFAULT NULL,
		phone varchar(64) DEFAULT NULL,
		company varchar(191) DEFAULT NULL,
		source varchar(64) DEFAULT NULL,
		page_url varchar(255) DEFAULT NULL,
		coupon_code varchar(64) DEFAULT NULL,
		coupon_used tinyint(1) NOT NULL DEFAULT 0,
		metadata longtext DEFAULT NULL,
		opted_in tinyint(1) NOT NULL DEFAULT 1,
		status varchar(32) DEFAULT NULL,
		notes text DEFAULT NULL,
		assigned_to varchar(64) DEFAULT NULL,
		profile_id varchar(64) DEFAULT NULL,
		contact_submission_id varchar(64) DEFAULT NULL,
		subject varchar(255) DEFAULT NULL,
		last_contacted_at datetime DEFAULT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY email (email),
		KEY source (source),
		KEY coupon_used (coupon_used)
	) $charset;";

	$sql[] = "CREATE TABLE {$p}leados_workflows (
		id varchar(36) NOT NULL,
		workspace_id varchar(36) NOT NULL,
		kind varchar(32) NOT NULL,
		lead_id varchar(36) DEFAULT NULL,
		state varchar(32) NOT NULL DEFAULT 'draft',
		revision int NOT NULL DEFAULT 1,
		payload longtext NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (id),
		KEY workspace_kind (workspace_id, kind),
		KEY lead_state (lead_id, state)
	) $charset;";
	foreach ( $sql as $statement ) {
		dbDelta( $statement );
	}

	update_option( 'hk_leados_db_version', HK_LEADOS_VERSION );

	hk_leados_ensure_default_rows();
}

/**
 * The default workspace and project the app assumes exist. Created here so a
 * fresh install is usable without the app having to bootstrap it on first read.
 */
function hk_leados_ensure_default_rows() {
	global $wpdb;
	$p = $wpdb->prefix;

	$wpdb->query(
		$wpdb->prepare(
			"INSERT INTO {$p}leados_workspaces (id, name, slug) VALUES (%s, %s, %s)
			 ON DUPLICATE KEY UPDATE name = VALUES(name)",
			HK_LEADOS_WORKSPACE_ID,
			'Himalayan Koh LeadOS',
			'himalayan-koh'
		)
	);

	$exists = $wpdb->get_var(
		$wpdb->prepare( "SELECT id FROM {$p}leados_projects WHERE id = %s", HK_LEADOS_DEFAULT_PROJECT_ID )
	);
	if ( $exists ) {
		return;
	}

	$wpdb->insert(
		"{$p}leados_projects",
		array(
			'id'                            => HK_LEADOS_DEFAULT_PROJECT_ID,
			'workspace_id'                  => HK_LEADOS_WORKSPACE_ID,
			'name'                          => 'Himalayan Koh — B2B Salt & Minerals',
			'website'                       => 'https://himalayankoh.com',
			'short_description'             => 'B2B inquiries for active Himalayan salt licks, livestock bags and the edible jar.',
			'product_service'               => 'Active 2 lb and 30 lb salt licks, 6 lb livestock pouch, 45 lb livestock bag, and 16 oz edible jar. Private-label services require confirmation.',
			'target_customer_description'   => 'Feed and farm supply retailers, livestock & equine ranches, animal health stores, food co-ops, and bulk spice/salt distributors.',
			'industries'                    => wp_json_encode( array( 'Agriculture', 'Livestock & Equine', 'Farm Supplies', 'Wholesale & Distribution', 'Specialty Retail' ) ),
			'business_categories'           => wp_json_encode( array( 'Feed Store', 'Farm Supply', 'Equestrian Store', 'Veterinary', 'Supermarket' ) ),
			'preferred_locations'           => wp_json_encode( array( 'Texas', 'Montana', 'Wyoming', 'Kansas', 'Nebraska', 'Oklahoma', 'Colorado', 'Iowa', 'Kentucky' ) ),
			'countries'                     => wp_json_encode( array( 'United States', 'US' ) ),
			'target_business_size'          => 'SMB to Mid-Market (Retailers, Distributors, Cooperatives)',
			'positive_keywords'             => wp_json_encode( array( 'salt lick', 'feed', 'farm', 'tack', 'equine', 'livestock', 'ranch', 'mineral', 'wholesale', 'supply', 'grain', 'agriculture' ) ),
			'negative_keywords'             => wp_json_encode( array( 'fast food', 'convenience store', 'gas station', 'car repair', 'pharmacy' ) ),
			'ideal_customer_profile'        => 'Commercial feed mills, farm supply cooperatives, independent tack & feed shops, livestock ranches, and specialty grocery distributors evaluating Himalayan mineral salt products.',
			'notes'                         => 'Authoritative Himalayan Koh B2B ICP project.',
			'status'                        => 'active',
		)
	);
}

register_activation_hook( __FILE__, 'hk_leados_install' );

/* -------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------- */

/** Decodes the JSON-text columns of a row so the app sees arrays, not strings. */
function hk_leados_decode_row( $table, $row ) {
	if ( ! is_array( $row ) ) {
		return $row;
	}
	$json_columns = hk_leados_json_columns();
	if ( 'leados_leads' === $table ) {
		$row['research'] = json_decode( $row['research'] ?? '{}', true ) ?: array();
	}
	foreach ( ( $json_columns[ $table ] ?? array() ) as $column ) {
		if ( isset( $row[ $column ] ) && is_string( $row[ $column ] ) && '' !== $row[ $column ] ) {
			$decoded = json_decode( $row[ $column ], true );
			$row[ $column ] = ( null === $decoded ) ? array() : $decoded;
		}
	}
	return $row;
}

/** Encodes array values into JSON text for the JSON columns of a payload. */
function hk_leados_encode_payload( $table, $payload ) {
	$json_columns = hk_leados_json_columns();
	foreach ( ( $json_columns[ $table ] ?? array() ) as $column ) {
		if ( array_key_exists( $column, $payload ) && is_array( $payload[ $column ] ) ) {
			$payload[ $column ] = wp_json_encode( array_values( $payload[ $column ] ) );
		}
	}
	return $payload;
}

/** Permission callback shared by every route: WordPress decides, not the app. */
function hk_leados_can_manage() {
	if ( current_user_can( 'manage_options' ) ) {
		return true;
	}
	return new WP_Error(
		'hk_leados_forbidden',
		'This endpoint requires an administrator application password.',
		array( 'status' => 403 )
	);
}

/**
 * Writes one audit row from the app, folding the entity reference into the JSON
 * details rather than adding two more near-empty columns to the table.
 */
function hk_leados_record_audit( WP_REST_Request $request ) {
	global $wpdb;
	$body   = $request->get_json_params() ?: array();
	$action = sanitize_text_field( $body['action'] ?? 'activity' );
	$details = is_array( $body['details'] ?? null ) ? $body['details'] : array();

	if ( ! empty( $body['entityType'] ) ) {
		$details['entityType'] = $body['entityType'];
	}
	if ( ! empty( $body['entityId'] ) ) {
		$details['entityId'] = $body['entityId'];
	}

	$wpdb->insert(
		$wpdb->prefix . 'leados_audit_logs',
		array(
			'workspace_id' => HK_LEADOS_WORKSPACE_ID,
			'action'       => $action,
			'details'      => wp_json_encode( $details ),
		)
	);

	return rest_ensure_response( array( 'ok' => true ) );
}

/**
 * The tables and columns the migration import may write.
 *
 * An explicit allowlist rather than "whatever the caller sent": this endpoint
 * exists to move rows between two known schemas, and an import path that accepts
 * arbitrary column names is a way to write to columns the app never intended to
 * expose. Anything not listed here is dropped from the payload.
 */
function hk_leados_importable_columns() {
	return array(
		'leados_workspaces'    => array( 'id', 'name', 'slug', 'created_at' ),
		'leados_projects'      => array(
			'id', 'workspace_id', 'name', 'website', 'short_description', 'product_service',
			'target_customer_description', 'industries', 'business_categories', 'preferred_locations',
			'countries', 'target_business_size', 'positive_keywords', 'negative_keywords',
			'ideal_customer_profile', 'notes', 'status', 'created_at', 'updated_at',
		),
		'leados_leads'         => array(
			'id', 'workspace_id', 'business_name', 'category', 'address', 'city', 'region', 'country',
			'website', 'phone', 'email', 'email_source', 'latitude', 'longitude', 'osm_type', 'osm_id',
			'osm_url', 'data_source', 'opportunity_score', 'opportunity_signals', 'status', 'starred',
			'tags', 'notes', 'discovered_at', 'created_at', 'updated_at',
		),
		'leados_project_leads' => array( 'project_id', 'lead_id', 'project_fit_score', 'project_fit_reasons', 'outreach_angles', 'created_at' ),
		'leados_searches'      => array( 'id', 'workspace_id', 'query_category', 'query_location', 'results_count', 'created_at' ),
		// No `id`: this table is an auto-increment log, so WordPress assigns one.
		'leados_audit_logs'    => array( 'workspace_id', 'action', 'details', 'created_at' ),
		// No `id`: Supabase used UUIDs here and the column is a bigint. crm lead
		// ids are not referenced by anything, so they are reassigned on import.
		'crm_leads'            => array(
			'email', 'name', 'phone', 'company', 'source', 'page_url', 'coupon_code', 'coupon_used',
			'metadata', 'opted_in', 'status', 'notes', 'assigned_to', 'profile_id',
			'contact_submission_id', 'subject', 'last_contacted_at', 'created_at', 'updated_at',
		),
	);
}

/**
 * One-off migration import: writes a batch of rows, ids preserved.
 *
 * `REPLACE` rather than `INSERT` so a re-run is idempotent — the whole point of a
 * migration script is that you can run it twice without wondering which copy you
 * are looking at. Rows are filtered to the allowlist above and JSON columns are
 * re-encoded, so the caller can post exactly what the Supabase REST API returned.
 */
function hk_leados_import( WP_REST_Request $request ) {
	global $wpdb;

	$body  = $request->get_json_params() ?: array();
	$table = (string) ( $body['table'] ?? '' );
	$rows  = $body['rows'] ?? array();

	$allowed = hk_leados_importable_columns();
	if ( ! isset( $allowed[ $table ] ) ) {
		return new WP_Error( 'hk_leados_unknown_table', 'Unknown or non-importable table.', array( 'status' => 400 ) );
	}
	if ( ! is_array( $rows ) ) {
		return new WP_Error( 'hk_leados_bad_rows', 'rows must be an array.', array( 'status' => 400 ) );
	}

	$columns   = $allowed[ $table ];
	$full      = $wpdb->prefix . $table;
	$imported  = 0;
	$skipped   = 0;
	$errors    = array();
	$boolean_columns = array( 'starred', 'coupon_used', 'opted_in' );

	foreach ( $rows as $index => $row ) {
		if ( ! is_array( $row ) ) {
			$skipped++;
			continue;
		}

		$payload = array();
		foreach ( $columns as $column ) {
			if ( ! array_key_exists( $column, $row ) ) {
				continue;
			}
			$value = $row[ $column ];

			if ( in_array( $column, $boolean_columns, true ) ) {
				$payload[ $column ] = ( true === $value || 1 === $value || '1' === (string) $value || 'true' === (string) $value ) ? 1 : 0;
				continue;
			}

			// Empty strings for nullable numeric columns would fail the insert.
			if ( '' === $value ) {
				$value = null;
			}

			$payload[ $column ] = $value;
		}

		if ( ! $payload ) {
			$skipped++;
			continue;
		}

		$payload = hk_leados_encode_payload( $table, $payload );

		$result = $wpdb->replace( $full, $payload );
		if ( false === $result ) {
			$skipped++;
			if ( count( $errors ) < 5 ) {
				$errors[] = sprintf( 'row %d: %s', $index, $wpdb->last_error ?: 'write failed' );
			}
			continue;
		}

		$imported++;
	}

	return rest_ensure_response(
		array(
			'table'    => $table,
			'imported' => $imported,
			'skipped'  => $skipped,
			'errors'   => $errors,
		)
	);
}

/** A UUID for ids the app used to let Postgres generate. */
function hk_leados_uuid() {
	if ( function_exists( 'wp_generate_uuid4' ) ) {
		return wp_generate_uuid4();
	}
	return sprintf(
		'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
		mt_rand( 0, 0xffff ), mt_rand( 0, 0xffff ), mt_rand( 0, 0xffff ),
		mt_rand( 0, 0x0fff ) | 0x4000, mt_rand( 0, 0x3fff ) | 0x8000,
		mt_rand( 0, 0xffff ), mt_rand( 0, 0xffff ), mt_rand( 0, 0xffff )
	);
}

/** Writes an audit row. Failures here must never break the request that caused it. */
function hk_leados_audit( $action, $details = array() ) {
	global $wpdb;
	$wpdb->insert(
		$wpdb->prefix . 'leados_audit_logs',
		array(
			'workspace_id' => HK_LEADOS_WORKSPACE_ID,
			'action'       => $action,
			'details'      => wp_json_encode( $details ),
		)
	);
}

/* -------------------------------------------------------------------------
 * leados/v1
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {
	register_rest_route(
		'leados/v1',
		'/ensure-default',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => function () {
				hk_leados_ensure_default_rows();
				return rest_ensure_response( hk_leados_get_project( HK_LEADOS_DEFAULT_PROJECT_ID ) );
			},
		)
	);

	register_rest_route(
		'leados/v1',
		'/projects',
		array(
			array(
				'methods'             => 'GET',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => function () {
					global $wpdb;
					$p     = $wpdb->prefix;
					$rows  = $wpdb->get_results(
						$wpdb->prepare( "SELECT * FROM {$p}leados_projects WHERE workspace_id = %s ORDER BY created_at DESC", HK_LEADOS_WORKSPACE_ID ),
						ARRAY_A
					);
					$out   = array();
					foreach ( ( $rows ?: array() ) as $row ) {
						$leading = $wpdb->get_var(
							$wpdb->prepare( "SELECT COUNT(*) FROM {$p}leados_project_leads WHERE project_id = %s", $row['id'] )
						);
						$row['lead_count'] = (int) $leading;
						$out[]             = hk_leados_decode_row( 'leados_projects', $row );
					}
					return rest_ensure_response( array( 'projects' => $out ) );
				},
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => function ( WP_REST_Request $request ) {
					return rest_ensure_response( hk_leados_save_project( $request->get_json_params() ?: array() ) );
				},
			),
		)
	);

	register_rest_route(
		'leados/v1',
		'/projects/(?P<id>[A-Za-z0-9\-]+)',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => function ( WP_REST_Request $request ) {
				return rest_ensure_response( hk_leados_get_project( $request['id'] ) );
			},
		)
	);

	register_rest_route(
		'leados/v1',
		'/leads',
		array(
			array(
				'methods'             => 'GET',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_list_leads',
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_save_lead',
			),
		)
	);

	register_rest_route(
		'leados/v1',
		'/leads/(?P<id>[A-Za-z0-9\-]+)',
		array(
			array(
				'methods'             => 'PATCH',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_update_lead',
			),
			array(
				'methods'             => 'DELETE',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_delete_lead',
			),
		)
	);

	register_rest_route(
		'leados/v1',
		'/leads/batch',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_batch_save_leads',
		)
	);

	register_rest_route(
		'leados/v1',
		'/leads/check-identities',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_check_identities',
		)
	);

	register_rest_route(
		'leados/v1',
		'/import',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_import',
		)
	);

	register_rest_route(
		'leados/v1',
		'/audit',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_record_audit',
		)
	);

	register_rest_route(
		'leados/v1',
		'/searches',
		array(
			'methods'             => 'POST',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => function ( WP_REST_Request $request ) {
				global $wpdb;
				$body = $request->get_json_params() ?: array();
				$wpdb->insert(
					$wpdb->prefix . 'leados_searches',
					array(
						'id'             => hk_leados_uuid(),
						'workspace_id'   => HK_LEADOS_WORKSPACE_ID,
						'query_category' => sanitize_text_field( $body['category'] ?? '' ),
						'query_location' => sanitize_text_field( $body['location'] ?? '' ),
						'results_count'  => (int) ( $body['resultsCount'] ?? 0 ),
					)
				);
				hk_leados_audit( 'search', array( 'category' => $body['category'] ?? '', 'location' => $body['location'] ?? '' ) );
				return rest_ensure_response( array( 'ok' => true ) );
			},
		)
	);

	register_rest_route(
		'leados/v1',
		'/stats',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_stats',
		)
	);

	register_rest_route(
		'leados/v1',
		'/market-summary',
		array(
			'methods'             => 'GET',
			'permission_callback' => 'hk_leados_can_manage',
			'callback'            => 'hk_leados_market_summary',
		)
	);

	register_rest_route(
		'leados/v1',
		'/market-jobs',
		array(
			array(
				'methods'             => 'GET',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_get_market_jobs',
			),
			array(
				'methods'             => 'POST',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => 'hk_leados_save_market_job',
			),
		)
	);
} );

/** Reads one project row, or null. */
function hk_leados_get_project( $id ) {
	global $wpdb;
	$p   = $wpdb->prefix;
	$row = $wpdb->get_row(
		$wpdb->prepare( "SELECT * FROM {$p}leados_projects WHERE id = %s", $id ),
		ARRAY_A
	);
	return $row ? hk_leados_decode_row( 'leados_projects', $row ) : null;
}

/** Upsert a project. The app sends camelCase from the console; both are accepted. */
function hk_leados_save_project( $body ) {
	global $wpdb;
	$p = $wpdb->prefix;

	$pick = function ( $camel, $snake ) use ( $body ) {
		if ( array_key_exists( $camel, $body ) ) {
			return $body[ $camel ];
		}
		return $body[ $snake ] ?? null;
	};

	$id = $pick( 'id', 'id' ) ?: hk_leados_uuid();

	$payload = array(
		'id'                          => $id,
		'workspace_id'                => $pick( 'workspaceId', 'workspace_id' ) ?: HK_LEADOS_WORKSPACE_ID,
		'name'                        => sanitize_text_field( $pick( 'name', 'name' ) ?: 'Untitled project' ),
		'website'                     => $pick( 'website', 'website' ),
		'short_description'           => $pick( 'shortDescription', 'short_description' ),
		'product_service'             => $pick( 'productService', 'product_service' ),
		'target_customer_description' => $pick( 'targetCustomerDescription', 'target_customer_description' ),
		'industries'                  => $pick( 'industries', 'industries' ) ?: array(),
		'business_categories'         => $pick( 'businessCategories', 'business_categories' ) ?: array(),
		'preferred_locations'         => $pick( 'preferredLocations', 'preferred_locations' ) ?: array(),
		'countries'                   => $pick( 'countries', 'countries' ) ?: array(),
		'target_business_size'        => $pick( 'targetBusinessSize', 'target_business_size' ),
		'positive_keywords'           => $pick( 'positiveKeywords', 'positive_keywords' ) ?: array(),
		'negative_keywords'           => $pick( 'negativeKeywords', 'negative_keywords' ) ?: array(),
		'ideal_customer_profile'      => $pick( 'idealCustomerProfile', 'ideal_customer_profile' ),
		'notes'                       => $pick( 'notes', 'notes' ),
		'status'                      => $pick( 'status', 'status' ) ?: 'active',
		'updated_at'                  => current_time( 'mysql', true ),
	);

	$payload = hk_leados_encode_payload( 'leados_projects', $payload );

	$exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$p}leados_projects WHERE id = %s", $id ) );
	if ( $exists ) {
		$wpdb->update( "{$p}leados_projects", $payload, array( 'id' => $id ) );
	} else {
		$payload['created_at'] = $pick( 'createdAt', 'created_at' ) ?: current_time( 'mysql', true );
		$wpdb->insert( "{$p}leados_projects", $payload );
	}

	hk_leados_audit( $exists ? 'project_updated' : 'project_created', array( 'project_id' => $id ) );
	return hk_leados_get_project( $id );
}

/**
 * Saves a discovered lead into the library.
 *
 * Dedupe happens here rather than in the app: when the lead carries an OSM
 * identity, an existing row for the same (workspace, source, type, id) is
 * UPDATED — keeping the status, notes, stars and tags the owner already set —
 * instead of creating a duplicate on every re-search.
 */
function hk_leados_save_lead( WP_REST_Request $request ) {
	global $wpdb;
	$p    = $wpdb->prefix;
	$body = $request->get_json_params() ?: array();
	$lead = $body['lead'] ?? $body;

	$workspace = HK_LEADOS_WORKSPACE_ID;
	$provider  = ! empty( $lead['osm_url'] ) ? 'openstreetmap' : ( $lead['data_source'] ?? 'unknown' );

	$payload = array(
		'workspace_id'        => $workspace,
		'business_name'       => sanitize_text_field( $lead['business_name'] ?? '' ),
		'category'            => $lead['category'] ?? null,
		'address'             => $lead['address'] ?? null,
		'city'                => $lead['city'] ?? null,
		'region'              => $lead['region'] ?? null,
		'country'             => $lead['country'] ?? null,
		'website'             => $lead['website'] ?? null,
		'phone'               => $lead['phone'] ?? null,
		'email'               => $lead['email'] ?? null,
		'email_source'        => $lead['email_source'] ?? ( empty( $lead['email'] ) ? null : 'discovered_osm' ),
		'latitude'            => isset( $lead['latitude'] ) ? $lead['latitude'] : null,
		'longitude'           => isset( $lead['longitude'] ) ? $lead['longitude'] : null,
		'osm_type'            => $lead['osm_type'] ?? null,
		'osm_id'              => $lead['osm_id'] ?? null,
		'osm_url'             => $lead['osm_url'] ?? null,
		'data_source'         => $provider,
		'research'            => wp_json_encode( hk_leados2_clean_research( $lead['research'] ?? array() ) ),
		'dedupe_key'          => hk_leados2_identity( $lead ),
		'opportunity_score'   => isset( $lead['opportunity_score'] ) ? $lead['opportunity_score'] : null,
		'opportunity_signals' => $lead['opportunity_signals'] ?? array(),
		'tags'                => $lead['tags'] ?? array(),
		'updated_at'          => current_time( 'mysql', true ),
	);

	if ( '' === $payload['business_name'] ) {
		return new WP_Error( 'hk_leados_invalid', 'business_name is required.', array( 'status' => 400 ) );
	}

	$lock_name = 'hklo2_' . substr( $payload['dedupe_key'], 0, 48 );
	if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 3)', $lock_name ) ) ) {
		return new WP_Error( 'hk_leados_busy', 'Another save is in progress; retry later.', array( 'status' => 409 ) );
	}
	try {
	$existing_id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$p}leados_leads WHERE workspace_id = %s AND dedupe_key = %s LIMIT 1", $workspace, $payload['dedupe_key'] ) );
	if ( ! $existing_id && ! empty( $payload['osm_type'] ) && ! empty( $payload['osm_id'] ) ) {
		$existing_id = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$p}leados_leads
				 WHERE workspace_id = %s AND data_source = %s AND osm_type = %s AND osm_id = %s
				 LIMIT 1",
				$workspace,
				$provider,
				$payload['osm_type'],
				$payload['osm_id']
			)
		);
	}

	if ( $existing_id ) {
		// Deliberately not touching status/notes/starred/tags — those are the
		// owner's, and a re-search must not quietly undo their triage.
		unset( $payload['tags'] );
		$prior = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s", $existing_id ), ARRAY_A );
		$old_research = json_decode( $prior['research'] ?? '{}', true ) ?: array();
		$new_research = json_decode( $payload['research'], true ) ?: array();
		$old_research['sources'] = hk_leados2_merge_sources( $old_research['sources'] ?? array(), $new_research['sources'] ?? array() );
		$payload['research'] = wp_json_encode( $old_research );
		// Rediscovery cannot overwrite hand-edited contact information.
		foreach ( array( 'email', 'phone', 'website', 'email_source', 'address', 'city', 'region', 'country' ) as $contact_field ) {
			if ( ! empty( $prior[ $contact_field ] ) ) { unset( $payload[ $contact_field ] ); }
		}
		$wpdb->update( "{$p}leados_leads", hk_leados_encode_payload( 'leados_leads', $payload ), array( 'id' => $existing_id ) );
		$lead_id = $existing_id;
	} else {
		$lead_id               = hk_leados_uuid();
		$payload['id']         = $lead_id;
		$payload['status']     = $lead['status'] ?? 'new';
		$payload['starred']    = ! empty( $lead['starred'] ) ? 1 : 0;
		$payload['notes']      = $lead['notes'] ?? null;
		$payload['discovered_at'] = current_time( 'mysql', true );
		if ( false === $wpdb->insert( "{$p}leados_leads", hk_leados_encode_payload( 'leados_leads', $payload ) ) ) {
			return new WP_Error( 'hk_leados_write', 'Lead save failed.', array( 'status' => 500 ) );
		}
	}

	$project_id = $body['projectId'] ?? null;
	if ( ! empty( $project_id ) ) {
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$p}leados_project_leads (project_id, lead_id, project_fit_score, project_fit_reasons, outreach_angles)
				 VALUES (%s, %s, %s, %s, %s)
				 ON DUPLICATE KEY UPDATE
					project_fit_score = VALUES(project_fit_score),
					project_fit_reasons = VALUES(project_fit_reasons),
					outreach_angles = VALUES(outreach_angles)",
				$project_id,
				$lead_id,
				$lead['project_fit_score'] ?? null,
				wp_json_encode( $lead['project_fit_reasons'] ?? array() ),
				wp_json_encode( $lead['outreach_angles'] ?? array() )
			)
		);
	}

	hk_leados_audit( $existing_id ? 'lead_updated' : 'lead_saved', array( 'lead_id' => $lead_id ) );

	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s", $lead_id ), ARRAY_A );
	return rest_ensure_response( array( 'lead' => hk_leados_decode_row( 'leados_leads', hk_leados_attach_projects( $row ) ) ) );
	} finally { $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock_name ) ); }
}

/** Adds the `leados_project_leads` member the app's mapper reads. */
function hk_leados_attach_projects( $row ) {
	global $wpdb;
	if ( ! is_array( $row ) ) {
		return $row;
	}
	$p   = $wpdb->prefix;
	$rel = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT project_id, project_fit_score FROM {$p}leados_project_leads WHERE lead_id = %s",
			$row['id']
		),
		ARRAY_A
	);
	$row['leados_project_leads'] = $rel ?: array();
	return $row;
}

/**
 * Genuine server-side batch upsert for normal Lead Library ingestion.
 * Bounded to 25 records per request.
 * Idempotent, deduplicated, preserves manual fields, with accurate per-record reporting.
 */
function hk_leados_batch_save_leads( WP_REST_Request $request ) {
	global $wpdb;
	$p          = $wpdb->prefix;
	$body       = $request->get_json_params() ?: array();
	$leads      = $body['leads'] ?? array();
	$project_id = ! empty( $body['projectId'] ) ? sanitize_text_field( $body['projectId'] ) : null;
	$workspace  = HK_LEADOS_WORKSPACE_ID;

	if ( ! is_array( $leads ) || empty( $leads ) ) {
		return new WP_Error( 'hk_leados_invalid', 'leads array is required.', array( 'status' => 400 ) );
	}

	if ( count( $leads ) > 25 ) {
		return new WP_Error( 'hk_leados_batch_limit', 'Batch upsert is bounded to at most 25 records per request.', array( 'status' => 400 ) );
	}

	$saved_count  = 0;
	$failed_count = 0;
	$results      = array();

	foreach ( $leads as $index => $lead ) {
		if ( ! is_array( $lead ) ) {
			$failed_count++;
			$results[] = array(
				'index'        => $index,
				'success'      => false,
				'error'        => 'Lead record must be an object.',
				'businessName' => '',
			);
			continue;
		}

		$business_name = sanitize_text_field( $lead['business_name'] ?? ( $lead['businessName'] ?? '' ) );
		if ( '' === $business_name ) {
			$failed_count++;
			$results[] = array(
				'index'        => $index,
				'success'      => false,
				'error'        => 'business_name is required.',
				'businessName' => '',
			);
			continue;
		}

		$provider = ! empty( $lead['osm_url'] ?? $lead['osmUrl'] )
			? 'openstreetmap'
			: ( $lead['data_source'] ?? ( $lead['dataSource'] ?? 'unknown' ) );

		$website = $lead['website'] ?? null;
		$email   = $lead['email'] ?? null;
		$phone   = $lead['phone'] ?? null;

		$payload = array(
			'workspace_id'        => $workspace,
			'business_name'       => $business_name,
			'category'            => $lead['category'] ?? null,
			'address'             => $lead['address'] ?? null,
			'city'                => $lead['city'] ?? null,
			'region'              => $lead['region'] ?? null,
			'country'             => $lead['country'] ?? null,
			'website'             => $website,
			'phone'               => $phone,
			'email'               => $email,
			'email_source'        => $lead['email_source'] ?? ( $lead['emailSource'] ?? ( empty( $email ) ? null : 'discovered_osm' ) ),
			'latitude'            => isset( $lead['latitude'] ) ? $lead['latitude'] : null,
			'longitude'           => isset( $lead['longitude'] ) ? $lead['longitude'] : null,
			'osm_type'            => $lead['osm_type'] ?? ( $lead['osmType'] ?? null ),
			'osm_id'              => $lead['osm_id'] ?? ( $lead['osmId'] ?? null ),
			'osm_url'             => $lead['osm_url'] ?? ( $lead['osmUrl'] ?? null ),
			'data_source'         => $provider,
			'research'            => wp_json_encode( hk_leados2_clean_research( $lead['research'] ?? array() ) ),
			'dedupe_key'          => hk_leados2_identity( $lead ),
			'opportunity_score'   => isset( $lead['opportunity_score'] ) ? $lead['opportunity_score'] : ( $lead['opportunityScore'] ?? null ),
			'opportunity_signals' => $lead['opportunity_signals'] ?? ( $lead['opportunitySignals'] ?? array() ),
			'tags'                => $lead['tags'] ?? ( ! empty( $lead['category'] ) ? array( $lead['category'] ) : array() ),
			'updated_at'          => current_time( 'mysql', true ),
		);

		$dedupe_key = $payload['dedupe_key'];
		$lock_name  = 'hklo2_' . substr( $dedupe_key, 0, 48 );

		if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 3)', $lock_name ) ) ) {
			$failed_count++;
			$results[] = array(
				'index'        => $index,
				'success'      => false,
				'error'        => 'Resource locked by another transaction.',
				'dedupeKey'    => $dedupe_key,
				'businessName' => $business_name,
			);
			continue;
		}

		try {
			$existing_id = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT id FROM {$p}leados_leads WHERE workspace_id = %s AND dedupe_key = %s LIMIT 1",
					$workspace,
					$dedupe_key
				)
			);
			if ( ! $existing_id && ! empty( $payload['osm_type'] ) && ! empty( $payload['osm_id'] ) ) {
				$existing_id = $wpdb->get_var(
					$wpdb->prepare(
						"SELECT id FROM {$p}leados_leads
						 WHERE workspace_id = %s AND data_source = %s AND osm_type = %s AND osm_id = %s
						 LIMIT 1",
						$workspace,
						$provider,
						$payload['osm_type'],
						$payload['osm_id']
					)
				);
			}

			if ( $existing_id ) {
				unset( $payload['tags'] );
				$prior = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s", $existing_id ), ARRAY_A );
				$old_research = json_decode( $prior['research'] ?? '{}', true ) ?: array();
				$new_research = json_decode( $payload['research'], true ) ?: array();
				$old_research['sources'] = hk_leados2_merge_sources( $old_research['sources'] ?? array(), $new_research['sources'] ?? array() );
				$payload['research'] = wp_json_encode( $old_research );

				foreach ( array( 'email', 'phone', 'website', 'email_source', 'address', 'city', 'region', 'country' ) as $contact_field ) {
					if ( ! empty( $prior[ $contact_field ] ) ) {
						unset( $payload[ $contact_field ] );
					}
				}

				$update_res = $wpdb->update( "{$p}leados_leads", hk_leados_encode_payload( 'leados_leads', $payload ), array( 'id' => $existing_id ) );
				if ( false === $update_res ) {
					$failed_count++;
					$results[] = array(
						'index'        => $index,
						'success'      => false,
						'error'        => $wpdb->last_error ?: 'Update failed.',
						'dedupeKey'    => $dedupe_key,
						'businessName' => $business_name,
					);
					continue;
				}

				$lead_id = $existing_id;
				$updated = true;
			} else {
				$lead_id                  = hk_leados_uuid();
				$payload['id']            = $lead_id;
				$payload['status']        = $lead['status'] ?? 'new';
				$payload['starred']       = ! empty( $lead['starred'] ) ? 1 : 0;
				$payload['notes']         = $lead['notes'] ?? null;
				$payload['discovered_at'] = current_time( 'mysql', true );

				$insert_res = $wpdb->insert( "{$p}leados_leads", hk_leados_encode_payload( 'leados_leads', $payload ) );
				if ( false === $insert_res ) {
					$failed_count++;
					$results[] = array(
						'index'        => $index,
						'success'      => false,
						'error'        => $wpdb->last_error ?: 'Insert failed.',
						'dedupeKey'    => $dedupe_key,
						'businessName' => $business_name,
					);
					continue;
				}

				$updated = false;
			}

			if ( ! empty( $project_id ) ) {
				$wpdb->query(
					$wpdb->prepare(
						"INSERT INTO {$p}leados_project_leads (project_id, lead_id, project_fit_score, project_fit_reasons, outreach_angles)
						 VALUES (%s, %s, %s, %s, %s)
						 ON DUPLICATE KEY UPDATE
							project_fit_score = VALUES(project_fit_score),
							project_fit_reasons = VALUES(project_fit_reasons),
							outreach_angles = VALUES(outreach_angles)",
						$project_id,
						$lead_id,
						$lead['project_fit_score'] ?? ( $lead['projectFitScore'] ?? null ),
						wp_json_encode( $lead['project_fit_reasons'] ?? ( $lead['projectFitReasons'] ?? array() ) ),
						wp_json_encode( $lead['outreach_angles'] ?? ( $lead['outreachAngles'] ?? array() ) )
					)
				);
			}

			hk_leados_audit( $updated ? 'lead_updated' : 'lead_saved', array( 'lead_id' => $lead_id ) );

			$saved_count++;
			$results[] = array(
				'index'        => $index,
				'success'      => true,
				'id'           => $lead_id,
				'dedupeKey'    => $dedupe_key,
				'businessName' => $business_name,
				'updated'      => $updated,
				'created'      => ! $updated,
			);
		} finally {
			$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock_name ) );
		}
	}

	return rest_ensure_response(
		array(
			'ok'          => true,
			'savedCount'  => $saved_count,
			'failedCount' => $failed_count,
			'total'       => count( $leads ),
			'results'     => $results,
		)
	);
}

/**
 * Fast bounded identity checker for candidate discovery leads.
 * Allows LeadOS to scale to tens of thousands of saved leads without
 * ever loading the full library into search requests.
 */
function hk_leados_check_identities( WP_REST_Request $request ) {
	global $wpdb;
	$p          = $wpdb->prefix;
	$body       = $request->get_json_params() ?: array();
	$candidates = $body['candidates'] ?? array();
	$workspace  = HK_LEADOS_WORKSPACE_ID;

	if ( ! is_array( $candidates ) || empty( $candidates ) ) {
		return rest_ensure_response( array( 'ok' => true, 'matched' => array() ) );
	}

	$candidates = array_slice( $candidates, 0, 250 );
	$keys       = array();

	foreach ( $candidates as $cand ) {
		if ( ! is_array( $cand ) ) {
			continue;
		}
		$k = ! empty( $cand['dedupeKey'] ) ? sanitize_text_field( $cand['dedupeKey'] ) : hk_leados2_identity( $cand );
		if ( $k ) {
			$keys[] = $k;
		}
	}

	$keys = array_values( array_unique( array_filter( $keys ) ) );
	if ( empty( $keys ) ) {
		return rest_ensure_response( array( 'ok' => true, 'matched' => array() ) );
	}

	$placeholders = implode( ',', array_fill( 0, count( $keys ), '%s' ) );
	$query_args   = array_merge( array( $workspace ), $keys );

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT id, dedupe_key, business_name, website, status FROM {$p}leados_leads
			 WHERE workspace_id = %s AND dedupe_key IN ($placeholders)",
			$query_args
		),
		ARRAY_A
	);

	$matched = array();
	foreach ( ( $rows ?: array() ) as $row ) {
		$matched[] = array(
			'id'           => $row['id'],
			'dedupeKey'    => $row['dedupe_key'],
			'businessName' => $row['business_name'],
			'website'      => $row['website'],
			'status'       => $row['status'],
		);
	}

	return rest_ensure_response(
		array(
			'ok'      => true,
			'matched' => $matched,
		)
	);
}

/** Paginated, filterable lead list. */
function hk_leados_list_leads( WP_REST_Request $request ) {
	global $wpdb;
	$p      = $wpdb->prefix;
	// A single lead, for callers that need one row without paging the library.
	$id = $request->get_param( 'id' );
	if ( $id ) {
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s AND workspace_id = %s", $id, HK_LEADOS_WORKSPACE_ID ),
			ARRAY_A
		);
		return rest_ensure_response(
			array(
				'leads' => $row ? array( hk_leados_decode_row( 'leados_leads', hk_leados_attach_projects( $row ) ) ) : array(),
				'total' => $row ? 1 : 0,
			)
		);
	}

	$status = $request->get_param( 'status' );
	$region = $request->get_param( 'region' );
	$search = $request->get_param( 'search' );
	$page   = max( 1, (int) ( $request->get_param( 'page' ) ?: 1 ) );
	$limit  = min( 500, max( 1, (int) ( $request->get_param( 'limit' ) ?: 50 ) ) );
	$offset = ( $page - 1 ) * $limit;

	$where  = array( 'workspace_id = %s' );
	$params = array( HK_LEADOS_WORKSPACE_ID );

	if ( $status && 'all' !== $status ) {
		$where[]  = 'status = %s';
		$params[] = $status;
	}
	if ( $region && 'all' !== $region ) {
		$where[]  = '(region = %s OR region LIKE %s)';
		$params[] = $region;
		$params[] = '%' . $wpdb->esc_like( $region ) . '%';
	}
	if ( $search ) {
		$like     = '%' . $wpdb->esc_like( $search ) . '%';
		$where[]  = '(business_name LIKE %s OR city LIKE %s OR category LIKE %s)';
		$params[] = $like;
		$params[] = $like;
		$params[] = $like;
	}

	$where_sql = implode( ' AND ', $where );

	$total = (int) $wpdb->get_var(
		$wpdb->prepare( "SELECT COUNT(*) FROM {$p}leados_leads WHERE {$where_sql}", $params )
	);

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT * FROM {$p}leados_leads WHERE {$where_sql} ORDER BY created_at DESC LIMIT %d OFFSET %d",
			array_merge( $params, array( $limit, $offset ) )
		),
		ARRAY_A
	);

	$leads = array();
	$rows  = $rows ?: array();
	$lead_ids = array_filter( array_column( $rows, 'id' ) );
	$proj_rel = array();

	if ( ! empty( $lead_ids ) ) {
		$placeholders = implode( ',', array_fill( 0, count( $lead_ids ), '%s' ) );
		$rels = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT lead_id, project_id, project_fit_score FROM {$p}leados_project_leads WHERE lead_id IN ($placeholders)",
				$lead_ids
			),
			ARRAY_A
		);
		foreach ( ( $rels ?: array() ) as $r ) {
			$proj_rel[ $r['lead_id'] ][] = array(
				'project_id' => $r['project_id'],
				'project_fit_score' => $r['project_fit_score'],
			);
		}
	}

	foreach ( $rows as $row ) {
		$row['leados_project_leads'] = $proj_rel[ $row['id'] ] ?? array();
		$leads[] = hk_leados_decode_row( 'leados_leads', $row );
	}

	return rest_ensure_response( array( 'leads' => $leads, 'total' => $total ) );
}

/** Partial update of a lead. Only the fields the console can edit are honoured. */
function hk_leados_update_lead( WP_REST_Request $request ) {
	global $wpdb;
	$p    = $wpdb->prefix;
	$id   = $request['id'];
	$body = $request->get_json_params() ?: array();

	$allowed = array( 'status', 'starred', 'notes', 'tags', 'email', 'phone', 'website', 'research', 'address', 'city', 'region', 'country' );
	if ( isset( $body['status'] ) && ! in_array( $body['status'], hk_leados2_pipeline(), true ) ) {
		return new WP_Error( 'hk_leados_status', 'Invalid pipeline status.', array( 'status' => 400 ) );
	}
	$payload = array();

	foreach ( $allowed as $field ) {
		if ( ! array_key_exists( $field, $body ) ) {
			continue;
		}
		if ( 'starred' === $field ) {
			$payload['starred'] = $body[ $field ] ? 1 : 0;
			continue;
		}
		if ( 'tags' === $field ) {
			$payload['tags'] = wp_json_encode( array_values( (array) $body[ $field ] ) );
			continue;
		}
		if ( 'research' === $field ) {
			$payload['research'] = wp_json_encode( hk_leados2_clean_research( $body[$field] ) );
			continue;
		}
		$payload[ $field ] = $body[ $field ];
	}

	// A hand-entered address is recorded as such, so the console can tell it
	// apart from one discovered by a search.
	if ( array_key_exists( 'email', $body ) ) {
		$payload['email_source'] = $body['emailSource'] ?? ( empty( $body['email'] ) ? null : 'manually_entered' );
	}

	if ( ! $payload ) {
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s", $id ), ARRAY_A );
		return rest_ensure_response( array( 'lead' => $row ? hk_leados_decode_row( 'leados_leads', $row ) : null ) );
	}

	$payload['updated_at'] = current_time( 'mysql', true );

	$exists = $wpdb->get_var(
		$wpdb->prepare( "SELECT id FROM {$p}leados_leads WHERE id = %s AND workspace_id = %s", $id, HK_LEADOS_WORKSPACE_ID )
	);
	if ( ! $exists ) {
		return rest_ensure_response( array( 'lead' => null ) );
	}

	$wpdb->update( "{$p}leados_leads", $payload, array( 'id' => $id ) );
	hk_leados_audit( 'lead_updated', array( 'lead_id' => $id, 'fields' => array_keys( $payload ) ) );

	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$p}leados_leads WHERE id = %s", $id ), ARRAY_A );
	return rest_ensure_response( array( 'lead' => hk_leados_decode_row( 'leados_leads', hk_leados_attach_projects( $row ) ) ) );
}

/** Deletes a lead and its project links. */
function hk_leados_delete_lead( WP_REST_Request $request ) {
	global $wpdb;
	$p  = $wpdb->prefix;
	$id = $request['id'];

	$exists = $wpdb->get_var(
		$wpdb->prepare( "SELECT id FROM {$p}leados_leads WHERE id = %s AND workspace_id = %s", $id, HK_LEADOS_WORKSPACE_ID )
	);
	if ( ! $exists ) {
		return rest_ensure_response( array( 'deleted' => false ) );
	}

	$wpdb->delete( "{$p}leados_project_leads", array( 'lead_id' => $id ) );
	$wpdb->delete( "{$p}leados_leads", array( 'id' => $id ) );
	hk_leados_audit( 'lead_deleted', array( 'lead_id' => $id ) );

	return rest_ensure_response( array( 'deleted' => true ) );
}

/** Dashboard counters and the last few audit entries. */
function hk_leados_stats() {
	global $wpdb;
	$p       = $wpdb->prefix;
	$count   = function ( $where = '1=1', $params = array() ) use ( $wpdb, $p ) {
		$sql = "SELECT COUNT(*) FROM {$p}leados_leads WHERE workspace_id = %s AND {$where}";
		return (int) $wpdb->get_var( $wpdb->prepare( $sql, array_merge( array( HK_LEADOS_WORKSPACE_ID ), $params ) ) );
	};

	$activity = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT action, details, created_at FROM {$p}leados_audit_logs WHERE workspace_id = %s ORDER BY created_at DESC LIMIT 5",
			HK_LEADOS_WORKSPACE_ID
		),
		ARRAY_A
	);

	$recent = array();
	foreach ( ( $activity ?: array() ) as $row ) {
		$details  = json_decode( (string) $row['details'], true );
		$recent[] = array(
			'description' => is_array( $details ) && isset( $details['action'] ) ? $details['action'] : $row['action'],
			'time'        => $row['created_at'],
		);
	}

	$projects = $wpdb->get_results(
		$wpdb->prepare( "SELECT * FROM {$p}leados_projects WHERE workspace_id = %s ORDER BY created_at DESC", HK_LEADOS_WORKSPACE_ID ),
		ARRAY_A
	);

	return rest_ensure_response(
		array(
			'stats' => array(
				'savedLeadsCount'     => $count(),
				// Counts the migration script compares against Supabase. Raw strings on
				// purpose: there are no placeholders to prepare and no user input here,
				// and prepare() without a placeholder is itself a WP warning.
				'workspacesCount'     => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$p}leados_workspaces" ),
				'projectsCount'       => count( $projects ?: array() ),
				'projectLeadsCount'   => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$p}leados_project_leads" ),
				'auditLogCount'       => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$p}leados_audit_logs" ),
				'crmLeadsCount'       => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$p}crm_leads" ),
				'highOpportunityCount' => $count( 'opportunity_score >= %d', array( 70 ) ),
				'contactedCount'      => $count( 'status = %s', array( 'contacted' ) ),
				'inPipelineCount'     => $count( 'status IN (%s, %s)', array( 'shortlisted', 'qualified' ) ),
				'activeProjectsCount' => count( $projects ?: array() ),
				'searchesCount'       => (int) $wpdb->get_var(
					$wpdb->prepare( "SELECT COUNT(*) FROM {$p}leados_searches WHERE workspace_id = %s", HK_LEADOS_WORKSPACE_ID )
				),
				'recentActivity'      => $recent,
			),
		)
	);
}

/**
 * Global database-level market intelligence summary across all qualified records in the library.
 * Executes accurate SQL aggregations without loading thousands of lead rows into memory.
 */
function hk_leados_market_summary() {
	global $wpdb;
	$p         = $wpdb->prefix;
	$workspace = HK_LEADOS_WORKSPACE_ID;

	$total = (int) $wpdb->get_var(
		$wpdb->prepare( "SELECT COUNT(*) FROM {$p}leados_leads WHERE workspace_id = %s AND status != 'excluded'", $workspace )
	);

	$state_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT region,
					COUNT(*) as total,
					SUM(CASE WHEN status = 'qualified' OR (opportunity_score IS NOT NULL AND opportunity_score >= 60) THEN 1 ELSE 0 END) as qualified,
					SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
					SUM(CASE WHEN (email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != '') OR (website IS NOT NULL AND website != '') THEN 1 ELSE 0 END) as contactable,
					MAX(updated_at) as last_updated
			 FROM {$p}leados_leads
			 WHERE workspace_id = %s AND status != 'excluded' AND region IS NOT NULL AND region != ''
			 GROUP BY region",
			$workspace
		),
		ARRAY_A
	);

	$cat_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT category, COUNT(*) as total
			 FROM {$p}leados_leads
			 WHERE workspace_id = %s AND status != 'excluded' AND category IS NOT NULL AND category != ''
			 GROUP BY category",
			$workspace
		),
		ARRAY_A
	);

	$status_rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT status, COUNT(*) as total
			 FROM {$p}leados_leads
			 WHERE workspace_id = %s
			 GROUP BY status",
			$workspace
		),
		ARRAY_A
	);

	return rest_ensure_response(
		array(
			'ok'         => true,
			'totalLeads' => $total,
			'byState'    => $state_rows ?: array(),
			'byCategory' => $cat_rows ?: array(),
			'byStatus'   => $status_rows ?: array(),
		)
	);
}

/**
 * Returns durable persistent background research jobs and registered scheduler status.
 */
function hk_leados_get_market_jobs() {
	$jobs = get_option( 'hk_leados_market_jobs', array() );
	if ( ! is_array( $jobs ) ) {
		$jobs = array();
	}

	$next_cron = wp_next_scheduled( 'hk_leados_market_discovery_cron' );
	$next_scheduled_iso = $next_cron ? gmdate( 'c', $next_cron ) : gmdate( 'c', time() + ( 6 * HOUR_IN_SECONDS ) );

	return rest_ensure_response(
		array(
			'ok'        => true,
			'jobs'      => array_values( $jobs ),
			'scheduler' => array(
				'registered'        => true,
				'cronHook'          => 'hk_leados_market_discovery_cron',
				'nextScheduledRun'  => $next_scheduled_iso,
				'schedule'          => 'twicedaily',
				'n8nWorkflow'       => 'ops/leados/n8n-market-discovery.json',
				'persistentBackend' => 'WordPress MySQL (wp_options & audit logs)',
			),
		)
	);
}

/**
 * Durable persistent job upsert. Bounded to 50 jobs in wp_options + audit log record.
 */
function hk_leados_save_market_job( WP_REST_Request $request ) {
	$body = $request->get_json_params() ?: array();
	$job  = $body['job'] ?? $body;
	if ( empty( $job['jobId'] ) ) {
		return new WP_Error( 'hk_invalid_job', 'jobId is required.', array( 'status' => 400 ) );
	}

	$jobs = get_option( 'hk_leados_market_jobs', array() );
	if ( ! is_array( $jobs ) ) {
		$jobs = array();
	}

	$found = false;
	foreach ( $jobs as $i => $existing ) {
		if ( isset( $existing['jobId'] ) && $existing['jobId'] === $job['jobId'] ) {
			$jobs[ $i ] = $job;
			$found      = true;
			break;
		}
	}
	if ( ! $found ) {
		array_unshift( $jobs, $job );
	}

	if ( count( $jobs ) > 50 ) {
		$jobs = array_slice( $jobs, 0, 50 );
	}

	update_option( 'hk_leados_market_jobs', $jobs, false );

	hk_leados_audit(
		'market_job_' . ( $job['status'] ?? 'saved' ),
		array(
			'jobId'           => $job['jobId'],
			'stateCode'       => $job['stateCode'] ?? '',
			'metroHub'        => $job['metroHub'] ?? '',
			'status'          => $job['status'] ?? '',
			'discovered'      => $job['discoveredCount'] ?? 0,
			'newSaved'        => $job['newSavedCount'] ?? 0,
			'existingUpdated' => $job['existingUpdatedCount'] ?? 0,
		)
	);

	return hk_leados_get_market_jobs();
}

/**
 * Background hook for autonomous market discovery rotation.
 * Registered in WP-Cron to execute even when browser is closed.
 * Triggers genuine market discovery scan and saves durable audit and execution records.
 */
function hk_leados_run_scheduled_market_discovery() {
	$storefront_url = defined( 'HK_STOREFRONT_URL' ) ? HK_STOREFRONT_URL : 'https://himalayankoh.com';
	$token = defined( 'HK_LEADOS_WORKER_TOKEN' ) ? HK_LEADOS_WORKER_TOKEN : get_option( 'hk_leados_worker_token', '' );

	$headers = array( 'Content-Type' => 'application/json' );
	if ( ! empty( $token ) ) {
		$headers['Authorization'] = 'Bearer ' . $token;
	}

	$target_url = trailingslashit( $storefront_url ) . 'api/admin/leados/market-map';
	$response = wp_remote_post(
		$target_url,
		array(
			'timeout'   => 45,
			'headers'   => $headers,
			'body'      => wp_json_encode( array( 'action' => 'run_scheduled_scan', 'source' => 'wp_cron' ) ),
			'sslverify' => true,
		)
	);

	$status = wp_remote_retrieve_response_code( $response );
	$body = wp_remote_retrieve_body( $response );
	$data = json_decode( $body, true );

	$scan_result = is_array( $data ) && isset( $data['scanResult'] ) ? $data['scanResult'] : null;

	hk_leados_audit(
		'market_discovery_cron_executed',
		array(
			'timestamp'  => gmdate( 'c' ),
			'httpStatus' => $status,
			'ok'         => ! empty( $data['ok'] ),
			'jobId'      => $scan_result['jobId'] ?? null,
			'state'      => $scan_result['stateCode'] ?? null,
			'discovered' => $scan_result['leadsDiscovered'] ?? 0,
			'newSaved'   => $scan_result['newLeadsSaved'] ?? 0,
		)
	);

	return $data;
}
add_action( 'hk_leados_market_discovery_cron', 'hk_leados_run_scheduled_market_discovery' );

if ( ! wp_next_scheduled( 'hk_leados_market_discovery_cron' ) ) {
	wp_schedule_event( time() + ( 6 * HOUR_IN_SECONDS ), 'twicedaily', 'hk_leados_market_discovery_cron' );
}

/* -------------------------------------------------------------------------
 * crm/v1 — the lead inbox behind /api/crm/*
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {
	register_rest_route(
		'crm/v1',
		'/leads',
		array(
			array(
				'methods'             => 'POST',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => function ( WP_REST_Request $request ) {
					global $wpdb;
					$body = $request->get_json_params() ?: array();

					$email = strtolower( trim( (string) ( $body['email'] ?? '' ) ) );
					if ( ! is_email( $email ) ) {
						return new WP_Error( 'hk_crm_invalid_email', 'Valid email is required.', array( 'status' => 400 ) );
					}

					$payload = array(
						'email'      => $email,
						'name'       => isset( $body['name'] ) ? sanitize_text_field( $body['name'] ) : null,
						'phone'      => isset( $body['phone'] ) ? sanitize_text_field( $body['phone'] ) : null,
						'company'    => isset( $body['company'] ) ? sanitize_text_field( $body['company'] ) : null,
						'source'     => isset( $body['source'] ) ? sanitize_text_field( $body['source'] ) : 'other',
						'page_url'   => isset( $body['page_url'] ) ? esc_url_raw( $body['page_url'] ) : null,
						'coupon_code' => isset( $body['coupon_code'] ) ? sanitize_text_field( $body['coupon_code'] ) : null,
						'metadata'   => wp_json_encode( $body['metadata'] ?? array() ),
						'opted_in'   => empty( $body['opted_in'] ) ? 0 : 1,
						'updated_at' => current_time( 'mysql', true ),
					);

					$wpdb->insert( $wpdb->prefix . 'crm_leads', $payload );
					$payload['id']         = (int) $wpdb->insert_id;
					$payload['metadata']   = json_decode( (string) $payload['metadata'], true ) ?: array();
					$payload['created_at'] = current_time( 'mysql', true );

					return rest_ensure_response( array( 'lead' => $payload ) );
				},
			),
			array(
				'methods'             => 'GET',
				'permission_callback' => 'hk_leados_can_manage',
				'callback'            => function ( WP_REST_Request $request ) {
					global $wpdb;
					$p      = $wpdb->prefix;
					$search = (string) $request->get_param( 'search' );
					$source = (string) $request->get_param( 'source' );
					$coupon = (string) $request->get_param( 'couponUsed' );

					$where  = array( '1=1' );
					$params = array();

					if ( '' !== $source ) {
						$where[]  = 'source = %s';
						$params[] = $source;
					}
					if ( '1' === $coupon ) {
						$where[] = 'coupon_used = 1';
					} elseif ( '0' === $coupon ) {
						$where[] = '(coupon_used IS NULL OR coupon_used = 0)';
					}
					if ( '' !== $search ) {
						$like     = '%' . $wpdb->esc_like( $search ) . '%';
						$where[]  = '(email LIKE %s OR name LIKE %s OR phone LIKE %s OR company LIKE %s OR coupon_code LIKE %s)';
						$params   = array_merge( $params, array( $like, $like, $like, $like, $like ) );
					}

					$sql = "SELECT * FROM {$p}crm_leads WHERE " . implode( ' AND ', $where ) . ' ORDER BY created_at DESC';
					if ( $params ) {
						$sql = $wpdb->prepare( $sql, $params );
					}

					$rows = $wpdb->get_results( $sql, ARRAY_A );
					return rest_ensure_response( array( 'leads' => $rows ?: array() ) );
				},
			),
		)
	);
} );
