<?php
/**
 * Plugin Name:       Himalayan Koh — Storefront Account State
 * Description:       Custom tables and REST endpoints for the state WordPress does not already own: per-account storefront state (wishlist, saved addresses, cart binding), the customer operations WooCommerce exposes no REST route for (sign-in, account creation, password reset), and the app's site-content bridge (settings, category-hub overrides, first-party events, newsletter/contact submissions, HK blog fields). This is the WordPress side of the app's Supabase → WordPress migration; the Next.js app talks to the hk-storefront/v1 namespace below.
 * Version:           1.3.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Himalayan Koh
 *
 * WHY THIS EXISTS SEPARATELY FROM WOOCOMMERCE
 * -------------------------------------------
 * The cart became WooCommerce's, because WooCommerce already owns carts, stock
 * reservation and checkout (`wc/store/v1`). A wishlist it does not own — there is
 * no wishlist in core, in the Store API, or in the REST v3 namespace. So the one
 * piece of account state WooCommerce cannot store lives here rather than being
 * either (a) reimplemented as a fake product category or (b) left in Supabase.
 *
 * WHY A SEPARATE PLUGIN FROM himalayan-koh-leados
 * ----------------------------------------------
 * One concern each, so an operator can deactivate the lead engine without taking
 * the storefront's wishlist with it — and so a change to CRM tables cannot
 * rewrite a customer's saved products.
 *
 * AUTHENTICATION
 * --------------
 * Every endpoint requires `manage_options`, exactly as the LeadOS plugin does: the
 * app's server authenticates with a WordPress **administrator application
 * password** over HTTPS.
 *
 * That means the *endpoint* is administrator-only, which is deliberate: the
 * endpoint is not the thing that authorises a shopper. The Next.js route in front
 * of it verifies the shopper's own session and passes an `owner` that it derived
 * from that session. A browser can never reach this namespace directly, so `owner`
 * cannot be spoofed from the client — see docs/STOREFRONT-WORDPRESS-CONTRACT.md.
 *
 * `owner` is now the **WooCommerce customer id** (1.1.0). It was the application's
 * Supabase user id while customer accounts lived there; a WooCommerce registered
 * customer *is* a WordPress user, so the customer id is the user id and this was a
 * data change rather than a schema change — which is why the column was a
 * free-form string and not a foreign key.
 *
 * CUSTOMER ACCOUNTS (1.1.0)
 * -------------------------
 * WordPress owns customer credentials, and WooCommerce customers are WordPress
 * users, so the shopper's account *is* the customer record. `/customer/login` and
 * `/customer/register` exist because WooCommerce exposes no way to check a
 * customer's password over REST — the Store API has no sign-in and REST v3 is
 * credential-based — so the check has to happen here, in WordPress, where the
 * password hash already lives.
 *
 * These two endpoints verify a credential; they do not mint a session. The app
 * signs its own customer session with a key that lives only in the deployment, so
 * WordPress is never able to issue one.
 *
 * `/cart-session` is the other half of "the cart follows the account": the Store
 * API identifies a cart by an opaque `Cart-Token`, which is per-browser. Storing
 * that token against the customer id is what lets a second device adopt the same
 * cart instead of starting an empty one.
 *
 * INSTALL
 * -------
 * Copy this file to wp-content/plugins/himalayan-koh-storefront/himalayan-koh-storefront.php
 * or zip the folder and use Plugins → Add New → Upload Plugin, then activate it.
 * Activation creates the table; deactivation does NOT drop it (data loss should be
 * a deliberate act).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'HK_STOREFRONT_VERSION', '1.2.0' );

/** The installed schema version, so an update can add tables without re-activation. */
const HK_STOREFRONT_DB_VERSION_OPTION = 'hk_storefront_db_version';

/* * The wishlist table's name. One owner so nothing spells it twice.
 */
function hk_storefront_wishlist_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_wishlists';
}

/** The saved-address table's name. */
function hk_storefront_address_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_addresses';
}

/**
 * Creates/updates the table. Safe to call repeatedly — that is what dbDelta does.
 *
 * The UNIQUE key on (owner, product_id) is the dedupe rule itself rather than a
 * convention the application has to remember: saving the same product twice is a
 * no-op in the database, so two tabs racing cannot produce a duplicate row. This
 * replaces the old Postgres unique constraint on the Supabase table 1:1.
 *
 * `owner` is varchar(191) because that is the longest string a utf8mb4 column can
 * carry inside a composite index on MySQL 5.7 / MariaDB 10.x. A longer owner would
 * silently fail to index on some hosts.
 */
function hk_storefront_install() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$charset = $wpdb->get_charset_collate();
	$table   = hk_storefront_wishlist_table();

	$sql = "CREATE TABLE {$table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		owner varchar(191) NOT NULL,
		product_id bigint(20) unsigned NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		UNIQUE KEY owner_product (owner, product_id),
		KEY owner_created (owner, created_at)
	) $charset;";

	dbDelta( $sql );

	// The account's cart token. One row per customer, keyed by the customer id, so
	// a second device can adopt the same WooCommerce cart. `cart_token` is
	// varchar(191) for the same utf8mb4 index reason as `owner` above.
	$cart_table = hk_storefront_cart_table();

	$cart_sql = "CREATE TABLE {$cart_table} (
		customer_id bigint(20) unsigned NOT NULL,
		cart_token varchar(191) NOT NULL,
		nonce varchar(191) NOT NULL DEFAULT '',
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (customer_id),
		KEY updated_at (updated_at)
	) $charset;";

	dbDelta( $cart_sql );

	// Saved addresses, owned by the WooCommerce customer.
	//
	// WooCommerce does hold customer addresses, but only as the two slots that
	// *ship an order* (billing + shipping on the customer record) — there is no
	// list of "addresses I can pick from", which is what the account portal has
	// always shown. A row here is that saved entry, and `customer_id` is the
	// WooCommerce customer id, the same identity the wishlist's `owner` and the
	// cart binding use, so one shopper is one customer everywhere.
	//
	// No UNIQUE key: two saved addresses may legitimately be identical (a
	// household with two contacts at one address), so a duplicate is the
	// customer's choice rather than an error to prevent.
	$address_table = hk_storefront_address_table();

	$address_sql = "CREATE TABLE {$address_table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		customer_id bigint(20) unsigned NOT NULL,
		label varchar(191) NOT NULL DEFAULT '',
		full_name varchar(191) NOT NULL DEFAULT '',
		phone varchar(64) NOT NULL DEFAULT '',
		address_line1 varchar(191) NOT NULL DEFAULT '',
		address_line2 varchar(191) NOT NULL DEFAULT '',
		city varchar(191) NOT NULL DEFAULT '',
		state varchar(191) NOT NULL DEFAULT '',
		postal_code varchar(32) NOT NULL DEFAULT '',
		country varchar(64) NOT NULL DEFAULT '',
		is_default_shipping tinyint(1) NOT NULL DEFAULT 0,
		is_default_billing tinyint(1) NOT NULL DEFAULT 0,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY customer_created (customer_id, created_at)
	) $charset;";

	dbDelta( $address_sql );

	// First-party storefront events. A table rather than post meta because this is
	// append-only telemetry read in aggregate (views per product, per path), and a
	// site with traffic would otherwise put every page view in the posts table.
	$events_table = hk_storefront_events_table();

	$events_sql = "CREATE TABLE {$events_table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		event varchar(64) NOT NULL,
		path varchar(2048) NOT NULL DEFAULT '',
		referrer varchar(2048) NOT NULL DEFAULT '',
		visitor_id varchar(64) NOT NULL DEFAULT '',
		session_id varchar(64) NOT NULL DEFAULT '',
		device varchar(16) NOT NULL DEFAULT '',
		utm_source varchar(256) NOT NULL DEFAULT '',
		utm_medium varchar(256) NOT NULL DEFAULT '',
		utm_campaign varchar(256) NOT NULL DEFAULT '',
		item_ids text NOT NULL,
		value decimal(12,2) DEFAULT NULL,
		currency varchar(8) NOT NULL DEFAULT '',
		occurred_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY event_occurred (event, occurred_at),
		KEY occurred_at (occurred_at)
	) $charset;";

	dbDelta( $events_sql );

	// Newsletter subscribers. The UNIQUE key on the email is the idempotency rule:
	// subscribing the same address twice keeps one row rather than erroring.
	$newsletter_table = hk_storefront_newsletter_table();

	$newsletter_sql = "CREATE TABLE {$newsletter_table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		email varchar(300) NOT NULL,
		source varchar(100) NOT NULL DEFAULT '',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		UNIQUE KEY email (email),
		KEY created_at (created_at)
	) $charset;";

	dbDelta( $newsletter_sql );

	// Contact-form submissions. A row here is a message the owner has to answer, so
	// losing one is worse than any tidiness argument for leaving it in Supabase.
	$contact_table = hk_storefront_contact_table();

	$contact_sql = "CREATE TABLE {$contact_table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		name varchar(200) NOT NULL DEFAULT '',
		email varchar(300) NOT NULL DEFAULT '',
		phone varchar(50) NOT NULL DEFAULT '',
		subject varchar(200) NOT NULL DEFAULT '',
		message text NOT NULL,
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY  (id),
		KEY created_at (created_at)
	) $charset;";

	dbDelta( $contact_sql );

	update_option( HK_STOREFRONT_DB_VERSION_OPTION, HK_STOREFRONT_VERSION );
}
register_activation_hook( __FILE__, 'hk_storefront_install' );

/** The cart-session table's name. */
function hk_storefront_cart_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_cart_sessions';
}

/** The first-party events table's name. */
function hk_storefront_events_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_site_events';
}

/** The newsletter table's name. */
function hk_storefront_newsletter_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_newsletter_subscribers';
}

/** The contact-submissions table's name. */
function hk_storefront_contact_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_contact_submissions';
}

/**
 * Brings the schema up to date when the file is newer than the database.
 *
 * Without this, a table added in an update would never be created on a site where
 * the plugin was already active: dbDelta runs on activation, and activation has
 * already happened. Cheap enough to check on every request, and it makes "update
 * the file and reload" the whole deploy story for the WordPress half.
 */
add_action(
	'plugins_loaded',
	function () {
		if ( get_option( HK_STOREFRONT_DB_VERSION_OPTION ) !== HK_STOREFRONT_VERSION ) {
			hk_storefront_install();
		}
	}
);

/* -------------------------------------------------------------------------
 * Retired product slugs
 * ---------------------------------------------------------------------- */

/**
 * Product URLs that are no longer their own product.
 *
 * Making grain size a real variation axis merges a pair of grain-specific listings
 * into one variable product, which retires one URL per pair. Those URLs have been
 * live and indexed, so instead of letting them 404, each old slug is redirected to
 * the product that now sells it. That keeps a bookmark, a search result and a paid
 * link landing on something a customer can buy.
 *
 * Adding a line here is the whole procedure when a future merge retires a product.
 */
function hk_storefront_retired_product_slugs() {
	return array(
		// 6 lbs bulk salt: the Fine and Coarse listings became variations of 2492.
		'himalayan-salt-fine-grain-6-lbs'                   => 'himalayan-salt-6-lbs',
		'himalayan-salt-coarse-grain-6-lbs'                 => 'himalayan-salt-6-lbs',
		// 16 oz edible jar: the Fine and Coarse listings became variations of 2479.
		'himalayan-pink-edible-salt-fine-grain-16-oz-jar'    => 'himalayan-pink-edible-salt-16-oz-jar',
		'himalayan-pink-edible-salt-coarse-grain-16-oz-jar'  => 'himalayan-pink-edible-salt-16-oz-jar',
	);
}

/**
 * Sends a retired product URL to its successor, permanently.
 *
 * Hooked on `template_redirect` and gated on `is_404()`: a slug that still resolves
 * to a product is never hijacked, so this can only ever redirect a URL WordPress
 * has already decided does not exist. The lookup goes through the slug rather than a
 * hardcoded id, so re-creating a product under an old slug takes precedence.
 */
add_action(
	'template_redirect',
	function () {
		if ( ! is_404() ) {
			return;
		}

		$request = isset( $_SERVER['REQUEST_URI'] ) ? wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) : '';
		$slug    = $request ? basename( trim( (string) $request, '/' ) ) : '';
		if ( '' === $slug ) {
			return;
		}

		$retired = hk_storefront_retired_product_slugs();
		if ( ! isset( $retired[ $slug ] ) ) {
			return;
		}

		$target = get_page_by_path( $retired[ $slug ], OBJECT, 'product' );
		if ( ! $target ) {
			return;
		}

		wp_safe_redirect( get_permalink( $target ), 301 );
		exit;
	}
);

/* -------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------- */

/** Permission callback shared by every route: WordPress decides, not the app. */
function hk_storefront_can_manage() {
	if ( current_user_can( 'manage_options' ) ) {
		return true;
	}
	return new WP_Error(
		'hk_storefront_forbidden',
		'This endpoint requires an administrator application password.',
		array( 'status' => 403 )
	);
}

/**
 * Reads and validates the owner from a request, or returns a WP_Error.
 *
 * Required rather than defaulted: an endpoint that fell back to a blanket owner
 * would turn a missing parameter into "show me everybody's wishlist", which is
 * the one way this table could leak between accounts.
 */
function hk_storefront_require_owner( $raw ) {
	$owner = is_string( $raw ) ? trim( $raw ) : '';
	if ( $owner === '' ) {
		return new WP_Error(
			'hk_storefront_owner_required',
			'An owner is required.',
			array( 'status' => 400 )
		);
	}
	if ( strlen( $owner ) > 191 ) {
		return new WP_Error(
			'hk_storefront_owner_too_long',
			'The owner identifier is too long (max 191 characters).',
			array( 'status' => 400 )
		);
	}
	return $owner;
}

/** A positive integer product id, or a WP_Error. */
function hk_storefront_require_product_id( $raw ) {
	$id = is_numeric( $raw ) ? (int) $raw : 0;
	if ( $id <= 0 ) {
		return new WP_Error(
			'hk_storefront_product_required',
			'A positive product id is required.',
			array( 'status' => 400 )
		);
	}
	return $id;
}

/** One wishlist row as the app reads it. */
function hk_storefront_row( $row ) {
	return array(
		'id'         => (int) $row->id,
		'owner'      => (string) $row->owner,
		'product_id' => (int) $row->product_id,
		'created_at' => (string) $row->created_at,
	);
}

/* -------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------- */

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'hk-storefront/v1',
			'/wishlist',
			array(
				// The owner's saved products, newest first.
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_wishlist',
					'permission_callback' => 'hk_storefront_can_manage',
					'args'                => array(
						'owner' => array( 'required' => true ),
					),
				),
				// Save a product. Idempotent: saving twice is not an error.
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_add_wishlist',
					'permission_callback' => 'hk_storefront_can_manage',
				),
				// Forget a product. Also idempotent.
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => 'hk_storefront_remove_wishlist',
					'permission_callback' => 'hk_storefront_can_manage',
				),
			)
		);

		// Everything one owner saved, for account deletion. Its own route rather
		// than a loop of per-product deletes: a deleted account must not leave rows
		// behind because one product id failed to come back.
		register_rest_route(
			'hk-storefront/v1',
			'/wishlist/owner',
			array(
				'methods'             => WP_REST_Server::DELETABLE,
				'callback'            => 'hk_storefront_remove_owner',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/wishlist/count',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_storefront_count_wishlist',
				'permission_callback' => 'hk_storefront_can_manage',
				'args'                => array(
					'owner' => array( 'required' => true ),
				),
			)
		);
	}
);

function hk_storefront_list_wishlist( WP_REST_Request $request ) {
	global $wpdb;

	$owner = hk_storefront_require_owner( $request->get_param( 'owner' ) );
	if ( is_wp_error( $owner ) ) {
		return $owner;
	}

	$table = hk_storefront_wishlist_table();
	$rows  = $wpdb->get_results(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"SELECT * FROM {$table} WHERE owner = %s ORDER BY created_at DESC, id DESC",
			$owner
		)
	);

	return rest_ensure_response(
		array(
			'items' => array_map( 'hk_storefront_row', is_array( $rows ) ? $rows : array() ),
		)
	);
}

function hk_storefront_count_wishlist( WP_REST_Request $request ) {
	global $wpdb;

	$owner = hk_storefront_require_owner( $request->get_param( 'owner' ) );
	if ( is_wp_error( $owner ) ) {
		return $owner;
	}

	$table = hk_storefront_wishlist_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$count = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE owner = %s", $owner ) );

	return rest_ensure_response( array( 'count' => $count ) );
}

function hk_storefront_add_wishlist( WP_REST_Request $request ) {
	global $wpdb;

	$body  = $request->get_json_params() ?: array();
	$owner = hk_storefront_require_owner( $body['owner'] ?? '' );
	if ( is_wp_error( $owner ) ) {
		return $owner;
	}
	$product_id = hk_storefront_require_product_id( $body['productId'] ?? null );
	if ( is_wp_error( $product_id ) ) {
		return $product_id;
	}

	$table = hk_storefront_wishlist_table();

	// INSERT IGNORE against the UNIQUE key rather than SELECT-then-INSERT: the
	// duplicate check and the insert are then one atomic statement, so a double
	// click cannot produce two rows the way a read-then-write can.
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"INSERT IGNORE INTO {$table} (owner, product_id) VALUES (%s, %d)",
			$owner,
			$product_id
		)
	);

	$row = $wpdb->get_row(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"SELECT * FROM {$table} WHERE owner = %s AND product_id = %d",
			$owner,
			$product_id
		)
	);

	return rest_ensure_response(
		array(
			'ok'   => true,
			'item' => $row ? hk_storefront_row( $row ) : null,
		)
	);
}

/**
 * Forgets everything one owner saved.
 *
 * Used by account deletion. `owner` may also arrive in the JSON body, because a
 * DELETE body is stripped by some proxies and losing it would leave the rows
 * behind — which is the outcome this route exists to prevent.
 */
function hk_storefront_remove_owner( WP_REST_Request $request ) {
	global $wpdb;

	$body  = $request->get_json_params() ?: array();
	$owner = hk_storefront_require_owner( $request->get_param( 'owner' ) ?? ( $body['owner'] ?? '' ) );
	if ( is_wp_error( $owner ) ) {
		return $owner;
	}

	$table   = hk_storefront_wishlist_table();
	$deleted = $wpdb->delete( $table, array( 'owner' => $owner ), array( '%s' ) );

	return rest_ensure_response(
		array(
			'ok'      => true,
			// Rows removed. Zero is a valid answer: the account may never have saved
			// anything, and reporting that is clearer than refusing the request.
			'deleted' => (int) $deleted,
		)
	);
}

function hk_storefront_remove_wishlist( WP_REST_Request $request ) {
	global $wpdb;

	// DELETE with a body is unusual, so the query string is accepted too — some
	// proxies strip a DELETE body, and losing it would turn "remove one product"
	// into an error rather than a silent no-op.
	$body       = $request->get_json_params() ?: array();
	$owner      = hk_storefront_require_owner( $request->get_param( 'owner' ) ?? ( $body['owner'] ?? '' ) );
	if ( is_wp_error( $owner ) ) {
		return $owner;
	}
	$product_id = hk_storefront_require_product_id(
		$request->get_param( 'productId' ) ?? ( $body['productId'] ?? null )
	);
	if ( is_wp_error( $product_id ) ) {
		return $product_id;
	}

	$table   = hk_storefront_wishlist_table();
	$deleted = $wpdb->delete(
		$table,
		array(
			'owner'      => $owner,
			'product_id' => $product_id,
		),
		array( '%s', '%d' )
	);

	return rest_ensure_response(
		array(
			'ok'      => true,
			// False when nothing matched — reported rather than hidden, so a
			// request that removed nothing is distinguishable from one that did.
			'deleted' => (bool) $deleted,
		)
	);
}

/* -------------------------------------------------------------------------
 * Customer accounts
 * ---------------------------------------------------------------------- */

/** A positive integer customer id, or a WP_Error. */
function hk_storefront_require_customer_id( $raw ) {
	$id = is_numeric( $raw ) ? (int) $raw : 0;
	if ( $id <= 0 ) {
		return new WP_Error(
			'hk_storefront_customer_required',
			'A positive customer id is required.',
			array( 'status' => 400 )
		);
	}
	return $id;
}

/** The customer's name, preferring the name parts WooCommerce records. */
function hk_storefront_customer_name( $user ) {
	$first = trim( (string) get_user_meta( $user->ID, 'first_name', true ) );
	$last  = trim( (string) get_user_meta( $user->ID, 'last_name', true ) );
	$name  = trim( $first . ' ' . $last );
	if ( $name !== '' ) {
		return $name;
	}
	$display = trim( (string) $user->display_name );
	if ( $display !== '' && $display !== $user->user_login ) {
		return $display;
	}
	return (string) $user->user_login;
}

/**
 * The identity the app needs to mint a customer session.
 *
 * `id` is the WordPress user id, which for a registered WooCommerce customer is
 * the customer id: the same number `/wc/v3/customers/<id>` is keyed by, and the
 * one the app stores as the wishlist owner and as the account's cart key.
 */
function hk_storefront_customer_payload( $user ) {
	if ( ! $user instanceof WP_User ) {
		return new WP_Error(
			'hk_storefront_customer_missing',
			'No such customer.',
			array( 'status' => 404 )
		);
	}
	return array(
		'ok'       => true,
		'customer' => array(
			'id'       => (int) $user->ID,
			'email'    => (string) $user->user_email,
			'name'     => hk_storefront_customer_name( $user ),
			'username' => (string) $user->user_login,
			'roles'    => array_values( (array) $user->roles ),
		),
	);
}

/**
 * Verifies a shopper's credentials.
 *
 * `wp_authenticate` takes the username *or* the email address, runs the same
 * filters as wp-login.php (so the store's brute-force protection applies), and
 * checks the stored hash — the password is never stored, logged or returned.
 *
 * One message for every refusal on purpose: saying which half was wrong is how an
 * endpoint becomes a way to enumerate who has an account here.
 */
function hk_storefront_customer_login( WP_REST_Request $request ) {
	$body     = $request->get_json_params() ?: array();
	$login    = trim( (string) ( $body['login'] ?? '' ) );
	$password = (string) ( $body['password'] ?? '' );

	if ( $login === '' || $password === '' ) {
		return new WP_Error(
			'hk_storefront_credentials_required',
			'Enter your email or username and your password.',
			array( 'status' => 400 )
		);
	}

	$user = wp_authenticate( $login, $password );
	if ( is_wp_error( $user ) ) {
		return new WP_Error(
			'hk_storefront_invalid_credentials',
			'Wrong email/username or password.',
			array( 'status' => 401 )
		);
	}

	return rest_ensure_response( hk_storefront_customer_payload( $user ) );
}

/** A username derived from the email, made unique against existing logins. */
function hk_storefront_unique_username( $email ) {
	$base = sanitize_user( strtok( $email, '@' ), true );
	if ( $base === '' ) {
		$base = 'customer';
	}
	$username = $base;
	$suffix   = 1;
	while ( username_exists( $username ) ) {
		$suffix++;
		$username = $base . $suffix;
	}
	return $username;
}

/**
 * Creates a customer account.
 *
 * `wc_create_new_customer` is WooCommerce's own account creation: it makes the
 * WordPress user with the `customer` role, records the WooCommerce customer and
 * sends the store's "new account" email. None of that is worth reimplementing,
 * and all of it would drift if it were.
 */
function hk_storefront_customer_register( WP_REST_Request $request ) {
	$body     = $request->get_json_params() ?: array();
	$email    = sanitize_email( (string) ( $body['email'] ?? '' ) );
	$password = (string) ( $body['password'] ?? '' );
	$name     = sanitize_text_field( (string) ( $body['name'] ?? '' ) );

	if ( ! is_email( $email ) ) {
		return new WP_Error(
			'hk_storefront_email_invalid',
			'A valid email address is required.',
			array( 'status' => 400 )
		);
	}
	if ( strlen( $password ) < 8 ) {
		return new WP_Error(
			'hk_storefront_password_short',
			'Choose a password of at least 8 characters.',
			array( 'status' => 400 )
		);
	}
	if ( email_exists( $email ) ) {
		return new WP_Error(
			'hk_storefront_email_taken',
			'An account already exists for this email. Sign in instead.',
			array( 'status' => 409 )
		);
	}
	if ( ! function_exists( 'wc_create_new_customer' ) ) {
		return new WP_Error(
			'hk_storefront_no_woocommerce',
			'WooCommerce is not active, so customer accounts cannot be created.',
			array( 'status' => 503 )
		);
	}

	$customer_id = wc_create_new_customer( $email, hk_storefront_unique_username( $email ), $password );
	if ( is_wp_error( $customer_id ) ) {
		return new WP_Error(
			'hk_storefront_register_failed',
			$customer_id->get_error_message(),
			array( 'status' => 400 )
		);
	}

	if ( $name !== '' ) {
		$parts = explode( ' ', $name, 2 );
		wp_update_user( array( 'ID' => $customer_id, 'display_name' => $name ) );
		update_user_meta( $customer_id, 'first_name', $parts[0] );
		if ( isset( $parts[1] ) ) {
			update_user_meta( $customer_id, 'last_name', $parts[1] );
		}
	}

	return rest_ensure_response( hk_storefront_customer_payload( get_userdata( $customer_id ) ) );
}

/* -------------------------------------------------------------------------
 * Password reset
 * ---------------------------------------------------------------------- */

/**
 * Finds a user by email address or username.
 *
 * `wp_authenticate` accepts either, and a shopper is not expected to know which
 * one their account uses — so the reset flow has to accept either too, or it would
 * refuse an address that signs in perfectly well.
 */
function hk_storefront_find_user( $login ) {
	$login = trim( (string) $login );
	if ( $login === '' ) {
		return null;
	}

	if ( is_email( $login ) ) {
		$user = get_user_by( 'email', $login );
		if ( $user ) {
			return $user;
		}
	}

	$user = get_user_by( 'login', sanitize_user( $login, true ) );
	return $user ? $user : null;
}

/**
 * The storefront origin to build the emailed reset link from.
 *
 * The app sends this because WordPress has no way to know where the storefront is
 * served (it is a different origin, and not WordPress's own `home_url`). It is
 * accepted only because this route already requires an administrator application
 * password — a caller able to forge it can already edit the site — and it is
 * sanitised and re-checked to be an http(s) origin, so a malformed value cannot
 * produce a link pointing somewhere else entirely.
 */
function hk_storefront_reset_origin( $raw ) {
	$origin = untrailingslashit( esc_url_raw( trim( (string) $raw ) ) );
	if ( $origin === '' || ! preg_match( '#^https?://[^/]+$#', $origin ) ) {
		return new WP_Error(
			'hk_storefront_origin_invalid',
			'A storefront origin is required so the reset link can come back to the store.',
			array( 'status' => 400 )
		);
	}
	return $origin;
}

/**
 * Sends a customer a password-reset link that returns to the storefront.
 *
 * WordPress owns the token: `get_password_reset_key()` stores the half of it that
 * matters on the user and returns the half that goes in the link, so the link can
 * only be validated by `check_password_reset_key()`. What this route decides is
 * only **where the link points** — at the storefront's own `/reset-password` page,
 * because a headless storefront does not serve `wp-login.php` and a link to it
 * would dead-end the customer.
 *
 * ## Why every answer looks the same
 *
 * The response is `accepted: true` whether or not an account exists, so this
 * endpoint cannot be used to ask WordPress who has an account here. That is the
 * same reason `customer/login` answers one message for every refusal. The field is
 * named for what actually happened — the request was accepted — rather than
 * `sent`, which would be a claim this route cannot make: whether `wp_mail`
 * delivers depends on the host's mail configuration, and a delivery failure is
 * logged for the owner rather than reported to an unauthenticated caller.
 */
function hk_storefront_request_password_reset( WP_REST_Request $request ) {
	$body   = $request->get_json_params() ?: array();
	$login  = trim( (string) ( $body['login'] ?? '' ) );
	$origin = hk_storefront_reset_origin( $body['origin'] ?? '' );

	if ( is_wp_error( $origin ) ) {
		return $origin;
	}
	if ( $login === '' ) {
		return new WP_Error(
			'hk_storefront_credentials_required',
			'Enter the email address your account uses.',
			array( 'status' => 400 )
		);
	}

	$user = hk_storefront_find_user( $login );
	if ( ! $user ) {
		return rest_ensure_response( array( 'accepted' => true ) );
	}

	$key = get_password_reset_key( $user );
	if ( is_wp_error( $key ) ) {
		return new WP_Error(
			'hk_storefront_reset_unavailable',
			'Password resets are not available for this account.',
			array( 'status' => 400 )
		);
	}

	$url = add_query_arg(
		array(
			'login' => rawurlencode( $user->user_login ),
			'key'   => rawurlencode( $key ),
		),
		$origin . '/reset-password'
	);

	$sent = wp_mail(
		$user->user_email,
		sprintf( '[%s] Reset your password', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ),
		"Someone asked to reset the password for this account.\n\n"
			. "Choose a new one here (the link expires in 24 hours):\n\n"
			. $url . "\n\n"
			. "If this was not you, nothing has changed and you can ignore this message.\n",
		array( 'Content-Type: text/plain; charset=UTF-8' )
	);

	if ( ! $sent ) {
		// Logged, not returned: telling a caller that this address has an account
		// but that the mail server misbehaved is a worse leak than the silence.
		error_log( 'hk-storefront: password reset email could not be sent for user ' . $user->ID );
	}

	return rest_ensure_response( array( 'accepted' => true ) );
}

/**
 * Sets a customer's new password from a WordPress reset key.
 *
 * `check_password_reset_key()` is the only validator for the token, and it fails a
 * key that is wrong, expired, or already used — so this is single-use by
 * WordPress's own design rather than by anything here. `reset_password()` then
 * writes the new hash and fires WordPress's own "your password changed" notice,
 * which is the message the customer must get.
 */
function hk_storefront_reset_customer_password( WP_REST_Request $request ) {
	$body     = $request->get_json_params() ?: array();
	$login    = trim( (string) ( $body['login'] ?? '' ) );
	$key      = trim( (string) ( $body['key'] ?? '' ) );
	$password = (string) ( $body['password'] ?? '' );

	if ( $login === '' || $key === '' ) {
		return new WP_Error(
			'hk_storefront_reset_key_invalid',
			'This reset link is missing its token. Request a new one.',
			array( 'status' => 400 )
		);
	}
	if ( strlen( $password ) < 8 ) {
		return new WP_Error(
			'hk_storefront_password_short',
			'Choose a password of at least 8 characters.',
			array( 'status' => 400 )
		);
	}

	// The link carries the login urlencoded and the browser hands it back decoded,
	// so it arrives here as the plain username. Whether to decode again is moot
	// anyway: a WordPress username is strict-sanitised to `[a-z0-9 _.-@]`, so it
	// never contains a `%` to begin with.
	$user = check_password_reset_key( $key, $login );
	if ( is_wp_error( $user ) ) {
		return new WP_Error(
			'hk_storefront_reset_key_invalid',
			'This reset link is invalid or has expired. Request a new one.',
			array( 'status' => 400 )
		);
	}

	reset_password( $user, $password );

	return rest_ensure_response( hk_storefront_customer_payload( $user ) );
}

/**
 * Changes a signed-in customer's password, re-checking the current one first.
 *
 * The account portal's "change password" form used to do this with Supabase
 * (`signInWithPassword` to prove the old password, then `updateUser` to set the
 * new one) — a shape that stopped working the moment sign-in moved to WordPress,
 * and a shape this app should not have anyway: it means the new password passes
 * through the browser's own auth client rather than through the system that stores
 * the hash.
 *
 * So both halves happen here. `wp_authenticate` proves the current password and
 * `wp_set_password` writes the new one — which also fires WordPress's own "your
 * password changed" notice, so the customer hears about the change from the
 * system that made it.
 *
 * The customer id is required and checked against the authenticated user: knowing
 * somebody's password must not become a way to change *their* password, and the
 * app passes the id from the session rather than from the form.
 */
function hk_storefront_change_customer_password( WP_REST_Request $request ) {
	$body         = $request->get_json_params() ?: array();
	$login        = trim( (string) ( $body['login'] ?? '' ) );
	$current      = (string) ( $body['currentPassword'] ?? '' );
	$new          = (string) ( $body['newPassword'] ?? '' );
	$customer_id  = hk_storefront_require_customer_id( $body['customerId'] ?? null );

	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}
	if ( $login === '' || $current === '' ) {
		return new WP_Error(
			'hk_storefront_credentials_required',
			'Enter your current password.',
			array( 'status' => 400 )
		);
	}
	if ( strlen( $new ) < 8 ) {
		return new WP_Error(
			'hk_storefront_password_short',
			'Choose a password of at least 8 characters.',
			array( 'status' => 400 )
		);
	}

	$user = wp_authenticate( $login, $current );
	if ( is_wp_error( $user ) || ! ( $user instanceof WP_User ) ) {
		return new WP_Error(
			'hk_storefront_current_password_invalid',
			'That current password is not correct.',
			array( 'status' => 401 )
		);
	}

	if ( (int) $user->ID !== $customer_id ) {
		// The credential belongs to a different account than the session did. Refused
		// rather than reconciled: one of the two is wrong, and the app decides which.
		return new WP_Error(
			'hk_storefront_customer_mismatch',
			'Those credentials do not belong to this account.',
			array( 'status' => 403 )
		);
	}

	wp_set_password( $new, $user->ID );

	return rest_ensure_response( array( 'ok' => true, 'customer' => hk_storefront_customer_payload( $user )['customer'] ) );
}

/* -------------------------------------------------------------------------
 * The account's cart
 * ---------------------------------------------------------------------- */

/**
 * The cart token saved for this customer, or null.
 *
 * Null is a real answer — the account has never had a cart on a signed-in device
 * — and the app turns it into "this account has no cart yet" rather than an error.
 */
function hk_storefront_get_cart_session( WP_REST_Request $request ) {
	global $wpdb;

	$customer_id = hk_storefront_require_customer_id( $request->get_param( 'customerId' ) );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$table = hk_storefront_cart_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT cart_token, nonce, updated_at FROM {$table} WHERE customer_id = %d", $customer_id ) );

	return rest_ensure_response(
		array(
			'ok'      => true,
			'session' => $row ? array(
				'cartToken' => (string) $row->cart_token,
				'nonce'     => (string) $row->nonce,
				'updatedAt' => (string) $row->updated_at,
			) : null,
		)
	);
}

/**
 * Saves the customer's current cart token.
 *
 * REPLACE INTO rather than SELECT-then-INSERT-or-UPDATE: the upsert is one
 * statement, so two devices saving at the same moment cannot interleave a read
 * and a write and lose a cart.
 */
function hk_storefront_save_cart_session( WP_REST_Request $request ) {
	global $wpdb;

	$body        = $request->get_json_params() ?: array();
	$customer_id = hk_storefront_require_customer_id( $body['customerId'] ?? null );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$cart_token = trim( (string) ( $body['cartToken'] ?? '' ) );
	$nonce      = trim( (string) ( $body['nonce'] ?? '' ) );

	if ( $cart_token === '' ) {
		return new WP_Error(
			'hk_storefront_cart_token_required',
			'A cart token is required.',
			array( 'status' => 400 )
		);
	}
	if ( strlen( $cart_token ) > 191 || strlen( $nonce ) > 191 ) {
		return new WP_Error(
			'hk_storefront_cart_token_too_long',
			'The cart token is too long (max 191 characters).',
			array( 'status' => 400 )
		);
	}

	$table = hk_storefront_cart_table();
	$wpdb->replace(
		$table,
		array(
			'customer_id' => $customer_id,
			'cart_token'  => $cart_token,
			'nonce'       => $nonce,
			'updated_at'  => current_time( 'mysql', true ),
		),
		array( '%d', '%s', '%s', '%s' )
	);

	return rest_ensure_response( array( 'ok' => true ) );
}

/** Forgets the customer's saved cart token (account deletion). */
function hk_storefront_delete_cart_session( WP_REST_Request $request ) {
	global $wpdb;

	$body        = $request->get_json_params() ?: array();
	$customer_id = hk_storefront_require_customer_id( $request->get_param( 'customerId' ) ?? ( $body['customerId'] ?? null ) );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$table   = hk_storefront_cart_table();
	$deleted = $wpdb->delete( $table, array( 'customer_id' => $customer_id ), array( '%d' ) );

	return rest_ensure_response( array( 'ok' => true, 'deleted' => (bool) $deleted ) );
}

/*
 * Registrations. A second `rest_api_init` hook rather than edits inside the block
 * above, so the customer endpoints read as one addition rather than a diff.
 *
 * All of them require `manage_options`, exactly like every other route here: the
 * app's server calls them with an administrator application password. A browser
 * cannot reach this namespace, which is what keeps `customerId` unspoofable.
 */
add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'hk-storefront/v1',
			'/customer/login',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_storefront_customer_login',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/customer/register',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_storefront_customer_register',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/customer/request-password-reset',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_storefront_request_password_reset',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/customer/reset-password',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_storefront_reset_customer_password',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/customer/change-password',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_storefront_change_customer_password',
				'permission_callback' => 'hk_storefront_can_manage',
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/cart-session',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_get_cart_session',
					'permission_callback' => 'hk_storefront_can_manage',
					'args'                => array( 'customerId' => array( 'required' => true ) ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_save_cart_session',
					'permission_callback' => 'hk_storefront_can_manage',
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => 'hk_storefront_delete_cart_session',
					'permission_callback' => 'hk_storefront_can_manage',
				),
			)
		);

		// Saved addresses. `customer_id` is always the id the app derived from the
		// shopper's session — never an id the browser chose — because this namespace
		// is administrator-only and the app is the only caller.
		register_rest_route(
			'hk-storefront/v1',
			'/addresses',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_addresses',
					'permission_callback' => 'hk_storefront_can_manage',
					'args'                => array( 'customerId' => array( 'required' => true ) ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_create_address',
					'permission_callback' => 'hk_storefront_can_manage',
				),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/addresses/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::EDITABLE,
					'callback'            => 'hk_storefront_update_address',
					'permission_callback' => 'hk_storefront_can_manage',
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => 'hk_storefront_delete_address',
					'permission_callback' => 'hk_storefront_can_manage',
				),
			)
		);
	}
);

/* -------------------------------------------------------------------------
 * Saved addresses
 * ---------------------------------------------------------------------- */

/** The whole-address columns this table stores, in insert/update order. */
function hk_storefront_address_fields() {
	return array( 'label', 'full_name', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country' );
}

/** Per-column maximum lengths, matching the schema — one list, checked on write. */
function hk_storefront_address_max_lengths() {
	return array(
		'label'         => 191,
		'full_name'     => 191,
		'phone'         => 64,
		'address_line1' => 191,
		'address_line2' => 191,
		'city'          => 191,
		'state'         => 191,
		'postal_code'   => 32,
		'country'       => 64,
	);
}

/** Fields a saved address is meaningless without. */
function hk_storefront_address_required_fields() {
	return array( 'full_name', 'address_line1', 'city', 'state', 'postal_code', 'country' );
}

/*
 * The customer id is validated by `hk_storefront_require_customer_id()` above,
 * which the cart-session routes already use — one validator for "which customer",
 * so the wishlist, the cart binding and these addresses cannot disagree about
 * what a valid customer id is.
 */

/**
 * Reads and validates the address body, or returns a WP_Error.
 *
 * `$partial` is what makes one validator serve create and update: an update may
 * send a single field (the default-address toggle), while a create must supply the
 * fields an address needs to be usable. Text is stored trimmed and length-capped
 * to the schema rather than rejected, so a long line is truncated by the system
 * that stores it instead of failing the customer's save.
 */
function hk_storefront_read_address_body( $body, $partial = false ) {
	$max    = hk_storefront_address_max_lengths();
	$fields = array();

	foreach ( hk_storefront_address_fields() as $field ) {
		if ( ! isset( $body[ $field ] ) ) {
			if ( ! $partial ) {
				$fields[ $field ] = '';
			}
			continue;
		}
		$fields[ $field ] = mb_substr( trim( (string) $body[ $field ] ), 0, $max[ $field ] );
	}

	if ( ! $partial ) {
		$missing = array();
		foreach ( hk_storefront_address_required_fields() as $field ) {
			if ( $fields[ $field ] === '' ) {
				$missing[] = $field;
			}
		}
		if ( $missing ) {
			return new WP_Error(
				'hk_storefront_address_incomplete',
				'An address needs a name, street, city, state, postal code and country.',
				array( 'status' => 400 )
			);
		}
	}

	foreach ( array( 'is_default_shipping', 'is_default_billing' ) as $flag ) {
		if ( isset( $body[ $flag ] ) ) {
			$fields[ $flag ] = rest_sanitize_boolean( $body[ $flag ] ) ? 1 : 0;
		}
	}

	return $fields;
}

/**
 * Makes one address the customer's only default on an axis.
 *
 * "Default" is a single-row fact — one default shipping address — so it is
 * enforced in one statement here rather than by asking every writer to remember.
 * Without this, marking a second address default would leave the customer with two
 * and no rule about which one checkout should trust.
 */
function hk_storefront_clear_other_defaults( $customer_id, $column, $keep_id ) {
	global $wpdb;

	$table = hk_storefront_address_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table and column names are ours.
	$wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table and column names are ours.
			"UPDATE {$table} SET {$column} = 0 WHERE customer_id = %d AND id <> %d",
			$customer_id,
			$keep_id
		)
	);
}

/** One address as the app reads it. */
function hk_storefront_address_row( $row ) {
	$address = array(
		'id'          => (int) $row->id,
		'customer_id' => (int) $row->customer_id,
	);

	foreach ( hk_storefront_address_fields() as $field ) {
		$address[ $field ] = (string) $row->$field;
	}

	$address['is_default_shipping'] = (bool) $row->is_default_shipping;
	$address['is_default_billing']  = (bool) $row->is_default_billing;
	$address['created_at']          = (string) $row->created_at;
	$address['updated_at']          = (string) $row->updated_at;

	return $address;
}

/**
 * One address, scoped to its owner.
 *
 * The `customer_id` is part of the lookup rather than a check afterwards: a
 * missing row and somebody else's row are then the same answer, so an id cannot be
 * probed for existence across accounts.
 */
function hk_storefront_find_address( $id, $customer_id ) {
	global $wpdb;

	if ( $id <= 0 || $customer_id <= 0 ) {
		return null;
	}

	$table = hk_storefront_address_table();
	return $wpdb->get_row(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"SELECT * FROM {$table} WHERE id = %d AND customer_id = %d",
			$id,
			$customer_id
		)
	);
}

/** The customer's saved addresses, defaults first, newest first within each. */
function hk_storefront_list_addresses( WP_REST_Request $request ) {
	global $wpdb;

	$customer_id = hk_storefront_require_customer_id( $request->get_param( 'customerId' ) );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$table = hk_storefront_address_table();
	$rows  = $wpdb->get_results(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"SELECT * FROM {$table} WHERE customer_id = %d
			 ORDER BY is_default_shipping DESC, is_default_billing DESC, created_at DESC, id DESC",
			$customer_id
		)
	);

	return rest_ensure_response(
		array(
			'items' => array_map( 'hk_storefront_address_row', is_array( $rows ) ? $rows : array() ),
		)
	);
}

/** Saves a new address for the customer. */
function hk_storefront_create_address( WP_REST_Request $request ) {
	global $wpdb;

	$body = $request->get_json_params() ?: array();

	$customer_id = hk_storefront_require_customer_id( $body['customerId'] ?? null );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$fields = hk_storefront_read_address_body( $body );
	if ( is_wp_error( $fields ) ) {
		return $fields;
	}

	$table = hk_storefront_address_table();
	$row   = array_merge(
		array(
			'customer_id'         => $customer_id,
			'is_default_shipping' => (int) ( $fields['is_default_shipping'] ?? 0 ),
			'is_default_billing'  => (int) ( $fields['is_default_billing'] ?? 0 ),
		),
		array_intersect_key( $fields, hk_storefront_address_max_lengths() )
	);

	$inserted = $wpdb->insert(
		$table,
		$row,
		array_merge(
			array( '%d' ),
			array_fill( 0, count( hk_storefront_address_fields() ), '%s' ),
			array( '%d', '%d' )
		)
	);

	if ( false === $inserted ) {
		return new WP_Error(
			'hk_storefront_address_not_saved',
			'The address could not be saved.',
			array( 'status' => 500 )
		);
	}

	$id = (int) $wpdb->insert_id;

	if ( $row['is_default_shipping'] ) {
		hk_storefront_clear_other_defaults( $customer_id, 'is_default_shipping', $id );
	}
	if ( $row['is_default_billing'] ) {
		hk_storefront_clear_other_defaults( $customer_id, 'is_default_billing', $id );
	}

	return rest_ensure_response(
		array(
			'ok'      => true,
			'address' => hk_storefront_address_row( hk_storefront_find_address( $id, $customer_id ) ),
		)
	);
}

/**
 * Updates an address — a single field, or the whole thing.
 *
 * Answers 404 for an id that is not the caller's, which is the same answer a
 * nonexistent id gets, so ids cannot be enumerated across accounts.
 */
function hk_storefront_update_address( WP_REST_Request $request ) {
	global $wpdb;

	$body = $request->get_json_params() ?: array();

	$customer_id = hk_storefront_require_customer_id( $body['customerId'] ?? $request->get_param( 'customerId' ) );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$id  = (int) $request->get_param( 'id' );
	$row = hk_storefront_find_address( $id, $customer_id );
	if ( ! $row ) {
		return new WP_Error(
			'hk_storefront_address_missing',
			'That address is not saved on this account.',
			array( 'status' => 404 )
		);
	}

	$fields = hk_storefront_read_address_body( $body, true );
	if ( is_wp_error( $fields ) ) {
		return $fields;
	}

	$defaults = array_intersect_key( $fields, array( 'is_default_shipping' => true, 'is_default_billing' => true ) );
	$text     = array_intersect_key( $fields, hk_storefront_address_max_lengths() );

	if ( ! $text && ! $defaults ) {
		return new WP_Error(
			'hk_storefront_address_empty_update',
			'No address fields were supplied.',
			array( 'status' => 400 )
		);
	}

	$table = hk_storefront_address_table();

	if ( $text ) {
		$formats = array();
		foreach ( array_keys( $text ) as $field ) {
			$formats[] = '%s';
		}
		$wpdb->update( $table, $text, array( 'id' => $id, 'customer_id' => $customer_id ), $formats, array( '%d', '%d' ) );
	}

	foreach ( $defaults as $column => $value ) {
		$wpdb->update(
			$table,
			array( $column => $value ),
			array( 'id' => $id, 'customer_id' => $customer_id ),
			array( '%d' ),
			array( '%d', '%d' )
		);

		// Setting a default clears the others on that axis; clearing one just
		// clears this row, so the customer can end up with no default at all
		// rather than a default they cannot remove.
		if ( $value ) {
			hk_storefront_clear_other_defaults( $customer_id, $column, $id );
		}
	}

	// `updated_at` is written on every update rather than by the column default,
	// which MySQL only applies on insert.
	$wpdb->update( $table, array( 'updated_at' => current_time( 'mysql' ) ), array( 'id' => $id ), array( '%s' ), array( '%d' ) );

	return rest_ensure_response(
		array(
			'ok'      => true,
			'address' => hk_storefront_address_row( hk_storefront_find_address( $id, $customer_id ) ),
		)
	);
}

/** Removes one address. Idempotent — a missing row is not an error. */
function hk_storefront_delete_address( WP_REST_Request $request ) {
	global $wpdb;

	$body = $request->get_json_params() ?: array();

	$customer_id = hk_storefront_require_customer_id( $body['customerId'] ?? $request->get_param( 'customerId' ) );
	if ( is_wp_error( $customer_id ) ) {
		return $customer_id;
	}

	$table   = hk_storefront_address_table();
	$deleted = $wpdb->delete(
		$table,
		array(
			'id'          => (int) $request->get_param( 'id' ),
			'customer_id' => $customer_id,
		),
		array( '%d', '%d' )
	);

	return rest_ensure_response( array( 'ok' => true, 'deleted' => (bool) $deleted ) );
}

/* =========================================================================
 * Site content bridge
 *
 * WordPress already owns the blog (posts), the media library and the site's own
 * settings. What it does not own is the handful of HK-specific things the app's
 * admin console writes, so those live here rather than in a second backend:
 *
 *   - app settings the console edits                  -> WordPress options
 *   - category-hub overrides                          -> WordPress options
 *   - first-party storefront events                   -> a table (append-only)
 *   - newsletter subscribers / contact submissions    -> a table each
 *   - the HK blog fields (SEO, hero image, FAQ, tags) -> post meta
 *
 * Options rather than a table for the first two: they are small, whole-value
 * documents read as a unit ("this category's settings", "this hub's override"),
 * which is exactly what an option is, and it inherits WordPress's own caching
 * and export/backup path instead of inventing a parallel one.
 * ====================================================================== */

/* -------------------------------------------------------------------------
 * HK blog fields (post meta)
 * ---------------------------------------------------------------------- */

/**
 * The HK blog fields, as post meta.
 *
 * `show_in_rest` is what makes them readable and writable through `/wp/v2/posts`,
 * which is where the app's blog console reads and writes posts. They are kept as
 * meta rather than a parallel table because they *are* properties of the post, and
 * WordPress's own revision system then snapshots them with the content for free.
 */
function hk_storefront_blog_meta_fields() {
	return array(
		'hk_hero_image_url'     => array( 'type' => 'string' ),
		'hk_hero_image_alt'     => array( 'type' => 'string' ),
		'hk_seo_title'          => array( 'type' => 'string' ),
		'hk_meta_description'   => array( 'type' => 'string' ),
		'hk_target_keyword'     => array( 'type' => 'string' ),
		'hk_search_intent'      => array( 'type' => 'string' ),
		'hk_secondary_keywords' => array( 'type' => 'array' ),
		'hk_tags'               => array( 'type' => 'array' ),
		'hk_faq_json'           => array( 'type' => 'string' ),
	);
}

/**
 * Registers the fields above on posts.
 *
 * The auth callback is the default REST write check (`edit_posts` for the post in
 * question) rather than a custom rule: the app writes posts through WordPress core
 * with an administrator application password, so WordPress's own capability check
 * is the right one and a second rule here could only disagree with it.
 */
add_action(
	'init',
	function () {
		foreach ( hk_storefront_blog_meta_fields() as $key => $spec ) {
			register_post_meta(
				'post',
				$key,
				array(
					'type'         => $spec['type'],
					'single'       => true,
					'show_in_rest' => array( 'schema' => array( 'type' => $spec['type'] ) ),
				)
			);
		}
	}
);

/* -------------------------------------------------------------------------
 * App settings and category-hub overrides (WordPress options)
 * ---------------------------------------------------------------------- */

/** The option name holding one settings category's values. */
function hk_storefront_settings_option( $category ) {
	return 'hk_settings_' . sanitize_key( $category );
}

/** The option name holding one category hub's override. */
function hk_storefront_hub_option( $key ) {
	return 'hk_category_hub_' . sanitize_key( $key );
}

/** A required, sanitised category name from the request. */
function hk_storefront_require_category( $raw ) {
	$category = sanitize_key( is_string( $raw ) ? trim( $raw ) : '' );
	if ( $category === '' ) {
		return new WP_Error(
			'hk_storefront_category_required',
			'A settings category is required.',
			array( 'status' => 400 )
		);
	}
	return $category;
}

/**
 * One settings category's values, always an array.
 *
 * Values are stored as strings (or null to mean "cleared"), because that is what
 * the app stores: the console's fields are text, and a key present with a null
 * value is a field the owner deliberately emptied, which is not the same as a field
 * that was never set.
 */
function hk_storefront_settings_values( $category ) {
	$stored = get_option( hk_storefront_settings_option( $category ), array() );
	return is_array( $stored ) ? $stored : array();
}

/** Reads one settings category. */
function hk_storefront_get_settings( WP_REST_Request $request ) {
	$category = hk_storefront_require_category( $request->get_param( 'category' ) );
	if ( is_wp_error( $category ) ) {
		return $category;
	}

	return rest_ensure_response(
		array(
			'category' => $category,
			'values'   => hk_storefront_settings_values( $category ),
		)
	);
}

/**
 * Writes one settings category.
 *
 * A whole-category write rather than a per-key one: the console saves a form, and
 * one `update_option` either lands entirely or not at all — a per-key loop can
 * leave half a form saved, which is the state that makes an owner distrust the
 * screen.
 */
function hk_storefront_save_settings( WP_REST_Request $request ) {
	$body     = $request->get_json_params() ?: array();
	$category = hk_storefront_require_category( $body['category'] ?? '' );
	if ( is_wp_error( $category ) ) {
		return $category;
	}

	$incoming = $body['values'] ?? null;
	if ( ! is_array( $incoming ) ) {
		return new WP_Error(
			'hk_storefront_settings_invalid',
			'A values object is required.',
			array( 'status' => 400 )
		);
	}

	$option = hk_storefront_settings_option( $category );
	$values = $request->get_param( 'replace' ) ? array() : hk_storefront_settings_values( $category );

	foreach ( $incoming as $key => $value ) {
		$key = sanitize_key( (string) $key );
		if ( $key === '' ) {
			continue;
		}
		if ( $value === null ) {
			$values[ $key ] = null;
			continue;
		}
		// Stored as text: the console's inputs are text, and JSON-encoding an array
		// here would hand every reader a string it has to know how to parse.
		$values[ $key ] = is_scalar( $value ) ? (string) $value : wp_json_encode( $value );
	}

	update_option( $option, $values, false );

	return rest_ensure_response(
		array(
			'ok'     => true,
			'values' => hk_storefront_settings_values( $category ),
		)
	);
}

/** Removes one stored value — a campaign that no longer exists, say. */
function hk_storefront_delete_setting( WP_REST_Request $request ) {
	$category = hk_storefront_require_category( $request->get_param( 'category' ) );
	if ( is_wp_error( $category ) ) {
		return $category;
	}

	$key = sanitize_key( (string) $request->get_param( 'key' ) );
	if ( $key === '' ) {
		return new WP_Error(
			'hk_storefront_key_required',
			'A settings key is required.',
			array( 'status' => 400 )
		);
	}

	$values = hk_storefront_settings_values( $category );
	$had    = array_key_exists( $key, $values );
	unset( $values[ $key ] );
	update_option( hk_storefront_settings_option( $category ), $values, false );

	return rest_ensure_response( array( 'ok' => true, 'deleted' => $had ) );
}

/** One category hub override, or null. */
function hk_storefront_hub_override( $key ) {
	$stored = get_option( hk_storefront_hub_option( $key ), null );
	return is_array( $stored ) ? $stored : null;
}

/** Every category hub override that exists. */
function hk_storefront_list_hubs( WP_REST_Request $request ) {
	global $wpdb;

	// The option prefix is ours, so this LIKE is a search over a known namespace
	// rather than over arbitrary options. `_transient_` and friends cannot match
	// because the prefix is a literal.
	$prefix = $wpdb->esc_like( 'hk_category_hub_' ) . '%';
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is WordPress's own.
	$names = $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s ORDER BY option_name ASC", $prefix ) );

	$items = array();
	foreach ( is_array( $names ) ? $names : array() as $name ) {
		$override = hk_storefront_hub_override( substr( (string) $name, strlen( 'hk_category_hub_' ) ) );
		if ( $override ) {
			$items[] = $override;
		}
	}

	return rest_ensure_response( array( 'items' => $items ) );
}

/** One category hub override. */
function hk_storefront_get_hub( WP_REST_Request $request ) {
	$key = sanitize_key( (string) $request->get_param( 'key' ) );
	if ( $key === '' ) {
		return new WP_Error( 'hk_storefront_hub_key_required', 'A category key is required.', array( 'status' => 400 ) );
	}

	return rest_ensure_response( array( 'override' => hk_storefront_hub_override( $key ) ) );
}

/**
 * Saves a category hub override.
 *
 * The payload is the same JSON the app's editor already produces, stored as-is
 * apart from the category key: `hero`, `seo` and `trust_points` are nested
 * structures whose shape belongs to the content model, and re-declaring that shape
 * here would be a second definition to keep in step with the first.
 */
function hk_storefront_save_hub( WP_REST_Request $request ) {
	$body = $request->get_json_params() ?: array();

	$key = sanitize_key( (string) ( $body['category_key'] ?? '' ) );
	if ( $key === '' ) {
		return new WP_Error( 'hk_storefront_hub_key_required', 'A category key is required.', array( 'status' => 400 ) );
	}

	$override = array(
		'category_key' => $key,
		'hero'         => is_array( $body['hero'] ?? null ) ? $body['hero'] : array(),
		'seo'          => is_array( $body['seo'] ?? null ) ? $body['seo'] : array(),
		'trust_points' => is_array( $body['trust_points'] ?? null ) ? $body['trust_points'] : array(),
		'is_published' => rest_sanitize_boolean( $body['is_published'] ?? false ),
		'updated_at'   => current_time( 'mysql', true ),
	);

	update_option( hk_storefront_hub_option( $key ), $override, false );

	return rest_ensure_response( array( 'ok' => true, 'override' => $override ) );
}

/* -------------------------------------------------------------------------
 * First-party storefront events
 * ---------------------------------------------------------------------- */

/** Per-column caps, so a public endpoint cannot be used to store bulk text. */
function hk_storefront_event_caps() {
	return array(
		'event'        => 64,
		'path'         => 2048,
		'referrer'     => 2048,
		'visitor_id'   => 64,
		'session_id'   => 64,
		'device'       => 16,
		'utm_source'   => 256,
		'utm_medium'   => 256,
		'utm_campaign' => 256,
	);
}

/** A trimmed, length-capped string from the request body. */
function hk_storefront_event_text( $raw, $max ) {
	if ( ! is_string( $raw ) ) {
		return '';
	}
	$trimmed = trim( $raw );
	return $trimmed === '' ? '' : mb_substr( $trimmed, 0, $max );
}

/** Records one event. */
function hk_storefront_record_event( WP_REST_Request $request ) {
	global $wpdb;

	$body  = $request->get_json_params() ?: array();
	$caps  = hk_storefront_event_caps();
	$event = hk_storefront_event_text( $body['event'] ?? '', $caps['event'] );
	$path  = hk_storefront_event_text( $body['path'] ?? '', $caps['path'] );

	if ( $event === '' || $path === '' ) {
		return new WP_Error(
			'hk_storefront_event_incomplete',
			'event and path are required.',
			array( 'status' => 400 )
		);
	}

	$item_ids = array();
	if ( isset( $body['item_ids'] ) && is_array( $body['item_ids'] ) ) {
		foreach ( $body['item_ids'] as $item ) {
			if ( is_scalar( $item ) ) {
				$item_ids[] = mb_substr( (string) $item, 0, 64 );
			}
		}
	}

	$row = array(
		'event'        => $event,
		'path'         => $path,
		'referrer'     => hk_storefront_event_text( $body['referrer'] ?? '', $caps['referrer'] ),
		'visitor_id'   => hk_storefront_event_text( $body['visitor_id'] ?? '', $caps['visitor_id'] ),
		'session_id'   => hk_storefront_event_text( $body['session_id'] ?? '', $caps['session_id'] ),
		'device'       => hk_storefront_event_text( $body['device'] ?? '', $caps['device'] ),
		'utm_source'   => hk_storefront_event_text( $body['utm_source'] ?? '', $caps['utm_source'] ),
		'utm_medium'   => hk_storefront_event_text( $body['utm_medium'] ?? '', $caps['utm_medium'] ),
		'utm_campaign' => hk_storefront_event_text( $body['utm_campaign'] ?? '', $caps['utm_campaign'] ),
		'item_ids'     => implode( ',', $item_ids ),
		'currency'     => hk_storefront_event_text( $body['currency'] ?? '', 8 ),
		'occurred_at'  => current_time( 'mysql', true ),
	);

	$value = $body['value'] ?? null;
	if ( is_numeric( $value ) ) {
		$row['value'] = (float) $value;
	}

	$inserted = $wpdb->insert( hk_storefront_events_table(), $row );
	if ( false === $inserted ) {
		return new WP_Error( 'hk_storefront_event_not_saved', 'The event could not be recorded.', array( 'status' => 500 ) );
	}

	return rest_ensure_response( array( 'ok' => true, 'id' => (int) $wpdb->insert_id ) );
}

/** One stored event as the app reads it. */
function hk_storefront_event_row( $row ) {
	$items = isset( $row->item_ids ) && $row->item_ids !== '' ? explode( ',', (string) $row->item_ids ) : array();
	return array(
		'id'            => (int) $row->id,
		'event'         => (string) $row->event,
		'path'          => (string) $row->path,
		'referrer'      => (string) $row->referrer,
		'visitor_id'    => (string) $row->visitor_id,
		'session_id'    => (string) $row->session_id,
		'device'        => (string) $row->device,
		'utm_source'    => (string) $row->utm_source,
		'utm_medium'    => (string) $row->utm_medium,
		'utm_campaign'  => (string) $row->utm_campaign,
		'item_ids'      => $items,
		'value'         => isset( $row->value ) && $row->value !== null ? (float) $row->value : null,
		'currency'      => (string) $row->currency,
		'occurred_at'   => (string) $row->occurred_at,
	);
}

/**
 * Aggregates events by path and event name, with 7/30/90-day windows.
 *
 * Aggregated in SQL rather than by shipping rows to the app: this table grows with
 * traffic, and "views per product" is what the analytics screens ask for — pulling
 * twenty thousand rows across HTTP to count them in JavaScript is the shape this
 * endpoint exists to avoid.
 */
function hk_storefront_event_summary( WP_REST_Request $request ) {
	global $wpdb;

	$events = $request->get_param( 'events' );
	$names  = array();
	if ( is_string( $events ) && $events !== '' ) {
		foreach ( explode( ',', $events ) as $name ) {
			$name = sanitize_key( trim( $name ) );
			if ( $name !== '' ) {
				$names[] = $name;
			}
		}
	}

	$table = hk_storefront_events_table();
	$where = '';
	$args  = array();
	if ( $names ) {
		$where = 'WHERE event IN (' . implode( ', ', array_fill( 0, count( $names ), '%s' ) ) . ')';
		$args  = $names;
	}

	$sql = "SELECT path, event,
			COUNT(*) AS total,
			SUM(occurred_at >= %s) AS w7,
			SUM(occurred_at >= %s) AS w30,
			SUM(occurred_at >= %s) AS w90
		FROM {$table} {$where}
		GROUP BY path, event";

	$params = array_merge(
		array(
			gmdate( 'Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS ),
			gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS ),
			gmdate( 'Y-m-d H:i:s', time() - 90 * DAY_IN_SECONDS ),
		),
		$args
	);

	// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- prepared immediately below; table name is ours.
	$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ) );

	$summary = array();
	foreach ( is_array( $rows ) ? $rows : array() as $row ) {
		$summary[] = array(
			'path'  => (string) $row->path,
			'event' => (string) $row->event,
			'total' => (int) $row->total,
			'w7'    => (int) $row->w7,
			'w30'   => (int) $row->w30,
			'w90'   => (int) $row->w90,
		);
	}

	return rest_ensure_response( array( 'summary' => $summary ) );
}

/**
 * Raw events, newest first — the admin traffic dashboard aggregates these.
 *
 * The cap is 5000 rather than 100 because the dashboard charts per-day and
 * per-device series that the grouped summary cannot answer, so it needs rows. A hard
 * cap still applies, and the app reports truncation rather than presenting a partial
 * window as the whole one.
 */
function hk_storefront_list_events( WP_REST_Request $request ) {
	global $wpdb;

	$limit  = (int) $request->get_param( 'limit' );
	$limit  = $limit > 0 ? min( $limit, 5000 ) : 1000;
	$since  = (string) $request->get_param( 'since' );
	$events = (string) $request->get_param( 'events' );

	$table  = hk_storefront_events_table();
	$where  = array();
	$params = array();

	if ( $since !== '' ) {
		$where[]  = 'occurred_at >= %s';
		$params[] = preg_replace( '/[^0-9\-: ]/', '', $since );
	}

	$names = array_filter( array_map( 'sanitize_key', explode( ',', $events ) ) );
	if ( $names ) {
		$where[] = 'event IN (' . implode( ', ', array_fill( 0, count( $names ), '%s' ) ) . ')';
		$params  = array_merge( $params, array_values( $names ) );
	}

	$params[] = $limit;
	$sql      = "SELECT * FROM {$table}"
		. ( $where ? ' WHERE ' . implode( ' AND ', $where ) : '' )
		. ' ORDER BY occurred_at DESC, id DESC LIMIT %d';

	// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- prepared immediately below; table name is ours.
	$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ) );

	return rest_ensure_response(
		array(
			'items' => array_map( 'hk_storefront_event_row', is_array( $rows ) ? $rows : array() ),
		)
	);
}

/* -------------------------------------------------------------------------
 * Newsletter subscribers and contact submissions
 * ---------------------------------------------------------------------- */

/** Records a newsletter subscriber. Idempotent on the email. */
function hk_storefront_subscribe( WP_REST_Request $request ) {
	global $wpdb;

	$body  = $request->get_json_params() ?: array();
	$email = sanitize_email( (string) ( $body['email'] ?? '' ) );
	$src   = hk_storefront_event_text( $body['source'] ?? '', 100 );

	if ( ! is_email( $email ) ) {
		return new WP_Error( 'hk_storefront_email_invalid', 'Enter a valid email address.', array( 'status' => 400 ) );
	}

	$table = hk_storefront_newsletter_table();

	// INSERT IGNORE against the UNIQUE key rather than SELECT-then-INSERT: the
	// duplicate check and the write are one statement, so two tabs (or a retry)
	// cannot produce two rows for one address.
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
			"INSERT IGNORE INTO {$table} (email, source) VALUES (%s, %s)",
			$email,
			$src
		)
	);

	// `created` is false when the address was already subscribed — reported rather
	// than hidden, so "thanks, you are on the list" never claims a new signup.
	return rest_ensure_response( array( 'ok' => true, 'created' => $wpdb->rows_affected > 0 ) );
}

/** Subscribers, newest first. */
function hk_storefront_list_subscribers( WP_REST_Request $request ) {
	global $wpdb;

	$limit = (int) $request->get_param( 'limit' );
	$limit = $limit > 0 ? min( $limit, 500 ) : 200;

	$table = hk_storefront_newsletter_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, email, source, created_at FROM {$table} ORDER BY created_at DESC, id DESC LIMIT %d", $limit ) );

	return rest_ensure_response(
		array(
			'items' => array_map(
				function ( $row ) {
					return array(
						'id'         => (int) $row->id,
						'email'      => (string) $row->email,
						'source'     => (string) $row->source,
						'created_at' => (string) $row->created_at,
					);
				},
				is_array( $rows ) ? $rows : array()
			),
		)
	);
}

/** Stores a contact-form submission. */
function hk_storefront_submit_contact( WP_REST_Request $request ) {
	global $wpdb;

	$body    = $request->get_json_params() ?: array();
	$name    = hk_storefront_event_text( $body['name'] ?? '', 200 );
	$email   = sanitize_email( (string) ( $body['email'] ?? '' ) );
	$phone   = hk_storefront_event_text( $body['phone'] ?? '', 50 );
	$subject = hk_storefront_event_text( $body['subject'] ?? '', 200 );
	$message = hk_storefront_event_text( $body['message'] ?? '', 5000 );

	$missing = array();
	foreach ( array( 'name' => $name, 'email' => $email, 'subject' => $subject, 'message' => $message ) as $field => $value ) {
		if ( $value === '' ) {
			$missing[] = $field;
		}
	}
	if ( $missing ) {
		return new WP_Error(
			'hk_storefront_contact_incomplete',
			'Name, email, subject and message are required.',
			array( 'status' => 400 )
		);
	}
	if ( ! is_email( $email ) ) {
		return new WP_Error( 'hk_storefront_email_invalid', 'Enter a valid email address.', array( 'status' => 400 ) );
	}

	$inserted = $wpdb->insert(
		hk_storefront_contact_table(),
		array(
			'name'    => $name,
			'email'   => $email,
			'phone'   => $phone,
			'subject' => $subject,
			'message' => $message,
		),
		array( '%s', '%s', '%s', '%s', '%s' )
	);

	if ( false === $inserted ) {
		return new WP_Error( 'hk_storefront_contact_not_saved', 'The message could not be saved.', array( 'status' => 500 ) );
	}

	return rest_ensure_response( array( 'ok' => true, 'id' => (int) $wpdb->insert_id ) );
}

/** Contact submissions, newest first. */
function hk_storefront_list_contacts( WP_REST_Request $request ) {
	global $wpdb;

	$limit = (int) $request->get_param( 'limit' );
	$limit = $limit > 0 ? min( $limit, 500 ) : 200;

	$table = hk_storefront_contact_table();
	// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is built from $wpdb->prefix.
	$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY created_at DESC, id DESC LIMIT %d", $limit ) );

	return rest_ensure_response(
		array(
			'items' => array_map(
				function ( $row ) {
					return array(
						'id'         => (int) $row->id,
						'name'       => (string) $row->name,
						'email'      => (string) $row->email,
						'phone'      => (string) $row->phone,
						'subject'    => (string) $row->subject,
						'message'    => (string) $row->message,
						'created_at' => (string) $row->created_at,
					);
				},
				is_array( $rows ) ? $rows : array()
			),
		)
	);
}

/*
 * Registrations. A third `rest_api_init` hook, for the same reason the customer
 * block has its own: this section reads as one addition rather than a diff to the
 * wishlist routes. Every route requires `manage_options`; the app's server is the
 * only caller, with an administrator application password.
 */
add_action(
	'rest_api_init',
	function () {
		$manage = 'hk_storefront_can_manage';

		register_rest_route(
			'hk-storefront/v1',
			'/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_get_settings',
					'permission_callback' => $manage,
					'args'                => array( 'category' => array( 'required' => true ) ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_save_settings',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => 'hk_storefront_delete_setting',
					'permission_callback' => $manage,
				),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/category-hubs',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_hubs',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_save_hub',
					'permission_callback' => $manage,
				),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/category-hubs/one',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_storefront_get_hub',
				'permission_callback' => $manage,
				'args'                => array( 'key' => array( 'required' => true ) ),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/events',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_events',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_record_event',
					'permission_callback' => $manage,
				),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/events/summary',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_storefront_event_summary',
				'permission_callback' => $manage,
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/newsletter',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_subscribers',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_subscribe',
					'permission_callback' => $manage,
				),
			)
		);

		register_rest_route(
			'hk-storefront/v1',
			'/contact',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_storefront_list_contacts',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_storefront_submit_contact',
					'permission_callback' => $manage,
				),
			)
		);
	}
);
