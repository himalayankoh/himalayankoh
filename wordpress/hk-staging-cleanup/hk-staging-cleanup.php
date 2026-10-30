<?php
/**
 * Plugin Name:       Himalayan Koh — Staging QA Cleanup
 * Description:       Staging-only tool that deletes rows the QA passes wrote into the HK WordPress tables (newsletter, contact, site events, Hermes evidence, leados projects, CRM leads). Not a product feature: it exists because those tables are append-only behind an administrator application password and no delete endpoint covers them, and the alternative — leaving fake subscribers and fake contact messages next to real ones — is worse. Restricted by construction: it refuses to run unless the site is the staging install, requires an explicit confirm token, and deletes only rows whose values match a hardcoded marker list. It accepts no ids from the caller.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Himalayan Koh
 *
 * WHY THIS IS A SEPARATE, REMOVABLE PLUGIN
 * ----------------------------------------
 * The same reason `hk-store-api-compat` is: it is a one-off operational tool, not
 * application code. Keeping it out of `himalayan-koh-storefront` and
 * `himalayan-koh-leados` means the two permanent plugins carry no deletion path at
 * all, and this one can be deactivated and deleted from staging the moment the
 * cleanup is done — which is exactly what happened after the first run.
 *
 * SAFETY, IN ORDER OF WHAT STOPS A MISTAKE
 * ----------------------------------------
 *   1. Staging only. `hk_staging_cleanup_is_staging()` requires the site URL to be
 *      the staging install (path `/staging`, or a `preview.` host). A production
 *      install answers 403 and deletes nothing, so shipping this file to production
 *      by accident is inert.
 *   2. `manage_options` only — the same administrator application password every
 *      other HK endpoint demands.
 *   3. A required `confirm` token, so a stray GET cannot delete anything.
 *   4. The markers are constants in this file. The caller cannot pass an id, a
 *      table, a column, or a pattern; the most a caller can do is ask for the
 *      allowlisted markers to be removed, or for a dry run.
 *   5. `dry_run=1` reports the same counts without deleting, which is how the
 *      before/after numbers in the migration record were measured.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The token a caller must send. Guards against an accidental call, not an attacker. */
const HK_STAGING_CLEANUP_CONFIRM = 'cleanup-staging-test-data';

/**
 * True only on the staging install.
 *
 * Deliberately narrow: the path must contain `/staging` (this site is
 * `himalayankoh.com/staging`) or the host must start with `preview.` (the staging
 * Worker's origin). Production is `himalayankoh.com` at the root and matches
 * neither.
 */
function hk_staging_cleanup_is_staging() {
	$url  = (string) get_site_url();
	$path = (string) wp_parse_url( $url, PHP_URL_PATH );
	$host = (string) wp_parse_url( $url, PHP_URL_HOST );

	if ( false !== strpos( $path, '/staging' ) ) {
		return true;
	}

	return 0 === strpos( $host, 'preview.' );
}

/**
 * What "QA test data" means, as data rather than as an argument.
 *
 * Each entry is `table suffix => list of [ column, LIKE pattern ]`. Prefix patterns
 * where the value is an identifier or address (`cutover-verify-%`, `qa-staging-%`),
 * and one substring pattern for the events `path`, which carries a leading slash.
 * Adding a table means editing this constant — there is no caller-supplied input.
 */
function hk_staging_cleanup_targets() {
	return array(
		'hk_newsletter_subscribers' => array(
			array( 'email', 'cutover-verify-%' ),
			array( 'email', 'qa-staging-%' ),
			array( 'email', 'probe-%' ),
			array( 'source', 'cutover-verify-%' ),
			array( 'source', 'probe-%' ),
		),
		'hk_contact_submissions'    => array(
			array( 'email', 'cutover-verify-%' ),
			array( 'email', 'qa-staging-%' ),
			array( 'name', 'cutover-verify-%' ),
			array( 'subject', 'cutover-verify-%' ),
		),
		'hk_site_events'            => array(
			array( 'event', 'cutover-verify-%' ),
			array( 'path', '/cutover-verify%' ),
			array( 'visitor_id', 'cutover-verify-%' ),
			array( 'session_id', 'cutover-verify-%' ),
		),
		'hk_hermes_evidence'        => array(
			array( 'dedupe_key', 'cutover-verify-%' ),
			array( 'source', 'cutover-verify-%' ),
			array( 'type', 'cutover-verify-%' ),
			array( 'title', 'cutover-verify-%' ),
		),
		'crm_leads'                 => array(
			array( 'email', 'qa-staging-%' ),
			array( 'email', 'cutover-verify-%' ),
			array( 'name', 'cutover-verify-%' ),
		),
		'leados_projects'           => array(
			array( 'id', 'qa-%' ),
			array( 'name', 'QA-STAGING-%' ),
		),
	);
}

/** Whether one of the plugin's own tables exists (it may not, on a partial install). */
function hk_staging_cleanup_table_exists( $table ) {
	global $wpdb;

	$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
	return $found === $table;
}

/** The WHERE clause for one table: an OR of the allowlisted markers, prepared. */
function hk_staging_cleanup_where( array $markers ) {
	global $wpdb;

	$clauses = array();
	$params  = array();

	foreach ( $markers as $marker ) {
		list( $column, $pattern ) = $marker;
		// The column name is from the constant above, never from the request.
		$clauses[] = "`{$column}` LIKE %s";
		$params[]  = $pattern;
	}

	return array( implode( ' OR ', $clauses ), $params );
}

/** Count and (unless a dry run) delete the marker rows in every known table. */
function hk_staging_cleanup_run( $dry_run ) {
	global $wpdb;

	$prefix  = $wpdb->prefix;
	$results = array();

	foreach ( hk_staging_cleanup_targets() as $suffix => $markers ) {
		$table = $prefix . $suffix;

		if ( ! hk_staging_cleanup_table_exists( $table ) ) {
			$results[ $suffix ] = array( 'table' => $table, 'present' => false, 'matched' => 0, 'deleted' => 0 );
			continue;
		}

		list( $where, $params ) = hk_staging_cleanup_where( $markers );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table is $wpdb->prefix + a constant.
		$matched_sql = "SELECT COUNT(*) FROM `{$table}` WHERE {$where}";
		$matched     = (int) $wpdb->get_var( $wpdb->prepare( $matched_sql, $params ) );

		$deleted = 0;
		if ( ! $dry_run && $matched > 0 ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- see above.
			$delete_sql = "DELETE FROM `{$table}` WHERE {$where}";
			$deleted    = $wpdb->query( $wpdb->prepare( $delete_sql, $params ) );
			$deleted    = is_int( $deleted ) ? $deleted : 0;
		}

		$results[ $suffix ] = array(
			'table'   => $table,
			'present' => true,
			'matched' => $matched,
			'deleted' => $deleted,
		);
	}

	$total_matched = 0;
	$total_deleted = 0;
	foreach ( $results as $row ) {
		$total_matched += $row['matched'];
		$total_deleted += $row['deleted'];
	}

	return array(
		'dryRun'       => (bool) $dry_run,
		'siteUrl'      => get_site_url(),
		// Echoed back so the caller can prove what was matched without guessing.
		'markers'      => hk_staging_cleanup_targets(),
		'tables'       => $results,
		'totalMatched' => $total_matched,
		'totalDeleted' => $total_deleted,
	);
}

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'hk-staging-cleanup/v1',
			'/marker-rows',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
				'callback'            => function ( WP_REST_Request $request ) {
					if ( ! hk_staging_cleanup_is_staging() ) {
						return new WP_Error(
							'hk_staging_cleanup_not_staging',
							'This tool only runs on the staging install.',
							array( 'status' => 403 )
						);
					}

					$confirm = (string) $request->get_param( 'confirm' );
					if ( HK_STAGING_CLEANUP_CONFIRM !== $confirm ) {
						return new WP_Error(
							'hk_staging_cleanup_confirm_required',
							'A confirm token is required.',
							array( 'status' => 400 )
						);
					}

					$dry_run = '1' === (string) $request->get_param( 'dry_run' );

					return rest_ensure_response( hk_staging_cleanup_run( $dry_run ) );
				},
			)
		);
	}
);
