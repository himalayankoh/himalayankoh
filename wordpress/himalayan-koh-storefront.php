<?php
/**
 * Plugin Name:       Himalayan Koh — Storefront Account State
 * Description:       Custom table and REST endpoints for per-account storefront state (the wishlist) that WooCommerce has no native table for. This is the WordPress side of the app's Supabase → WordPress migration; the Next.js app talks to the hk-storefront/v1 namespace below.
 * Version:           1.1.0
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

define( 'HK_STOREFRONT_VERSION', '1.1.0' );

/** The installed schema version, so an update can add tables without re-activation. */
const HK_STOREFRONT_DB_VERSION_OPTION = 'hk_storefront_db_version';

/** The wishlist table's name. One owner so nothing spells it twice. */
function hk_storefront_wishlist_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_wishlists';
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

	update_option( HK_STOREFRONT_DB_VERSION_OPTION, HK_STOREFRONT_VERSION );
}
register_activation_hook( __FILE__, 'hk_storefront_install' );

/** The cart-session table's name. */
function hk_storefront_cart_table() {
	global $wpdb;
	return $wpdb->prefix . 'hk_cart_sessions';
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
	}
);
