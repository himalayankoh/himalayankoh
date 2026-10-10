<?php
/**
 * Plugin Name:       Himalayan Koh — Wholesale (B2B)
 * Description:       The wholesale side of Himalayan Koh: buyer applications and accounts, a wholesale product master with its own packaging/MOQ/cost fields, price tiers, suppliers and origins, container and cost profiles, freight rates, port charges, quotes and wholesale orders. Wholesale pricing is separate from the retail price WooCommerce owns — a change here never rewrites a storefront price. The Next.js app talks to the hk-wholesale/v1 namespace below; nothing in this plugin reads or writes a retail customer, cart or WooCommerce order.
 * Version:           1.2.1
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Himalayan Koh
 *
 * WHY THIS IS SEPARATE FROM himalayan-koh-storefront
 * --------------------------------------------------
 * The storefront plugin owns *retail* account state (wishlist, addresses, cart
 * binding) and the app's site-content bridge. Wholesale is a different business:
 * different buyer, different price, different unit of sale (a pallet, not a jar),
 * different documents. Keeping it in its own plugin means a fault in the wholesale
 * calculator cannot take a shopper's wishlist down, and the whole subsystem can be
 * deactivated without touching retail — which is the isolation the retail admin
 * was promised.
 *
 * WHY WOOCOMMERCE IS ONLY *REFERENCED* HERE
 * -----------------------------------------
 * `hk_wholesale_products.woo_product_id` points at a WooCommerce product so the
 * two sides agree on *which* product a wholesale line is about. Everything else —
 * wholesale SKU, packaging, MOQ, pallets, ex-factory cost, tiers, origin — lives in
 * this plugin's own tables, because WooCommerce has no concept for any of it. A
 * wholesale cost change therefore cannot move a retail price: the two numbers are
 * different rows in different tables, and only one of them is read by the storefront.
 *
 * WHY LINES ARE STORED AS JSON ON THE QUOTE
 * -----------------------------------------
 * A quote is a *snapshot*: the prices, freight, FX rate and assumptions are frozen
 * at the moment it was priced, and re-reading them from live product rows is exactly
 * the bug that would make an accepted quote change its own total. So `lines`,
 * `totals`, `fx`, `freight` and `assumptions` are JSON on the quote row rather than
 * child rows joined back to the master. `hk_wholesale_audit` records who changed
 * what, so an override is visible rather than silent.
 *
 * AUTHENTICATION
 * --------------
 * Every endpoint requires `manage_options`, exactly as the storefront and LeadOS
 * plugins do: the app's server authenticates with a WordPress **administrator
 * application password** over HTTPS. The endpoint is not what authorises a buyer —
 * the Next.js route in front of it verifies the buyer's own signed wholesale session
 * and passes the account id it derived from that session. A browser can never reach
 * this namespace directly, so an account id cannot be spoofed from the client.
 *
 * NO UNINSTALL DROP. Deactivating this plugin leaves its tables alone; deleting a
 * supplier's costs because a plugin was switched off is not a recoverable mistake.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'HK_WHOLESALE_VERSION', '1.2.1' );
// Bumped when the schema array changes: `hk_wholesale_maybe_upgrade` re-runs dbDelta
// only when this differs from what is stored, so an existing install picks up the new
// columns on its next load instead of waiting for a deactivate/reactivate cycle.
// v2 added the dealer commission fields and the order profit record.
// v5 backticks every identifier in the generated DDL: a column called `lines` is a
// reserved word, and the unquoted CREATE TABLE was rejected in silence — which left the
// quotations table missing on a real install while every read of it returned an empty
// list rather than an error. v4 records *why* a table is missing; v3 verifies the work.
define( 'HK_WHOLESALE_DB_VERSION', '7' );

/** The installed schema version, so a later release can add tables without re-activation. */
const HK_WHOLESALE_DB_OPTION = 'hk_wholesale_db_version';

/**
 * The WordPress role a wholesale buyer holds, and the whole of their authority there.
 *
 * A buyer signs in with a real WordPress user (that is where the password hash lives),
 * so approving an application has to give them one. `read` and nothing else: no
 * `edit_posts`, no `upload_files`, no `manage_options`, no WooCommerce capability — a
 * wholesale buyer is a trade customer of the wholesale side, not a member of the shop's
 * staff, and wp-admin is not their portal. The portal itself is the app's, behind its own
 * signed session, so WordPress is never what authorises a wholesale action.
 */
const HK_WHOLESALE_BUYER_ROLE = 'hk_wholesale_buyer';

/** Creates the buyer role if it is not there yet. */
function hk_wholesale_ensure_buyer_role() {
	if ( get_role( HK_WHOLESALE_BUYER_ROLE ) ) {
		return;
	}
	add_role( HK_WHOLESALE_BUYER_ROLE, 'Wholesale buyer', array( 'read' => true ) );
}

/**
 * The WordPress user an approved buyer signs in with.
 *
 * Two decisions matter here:
 *
 *   - **An existing user keeps their role.** If the applicant already has a WordPress
 *     account — including, in the worst case, the site owner's — approval links the
 *     wholesale account to it and stops. Re-assigning the role would quietly demote an
 *     administrator, and a commercial approval must never change what someone can do in
 *     wp-admin.
 *   - **A new user gets a random password nobody sees**, plus WordPress's own "your
 *     account is ready" email, which is where the set-password link comes from. No
 *     credential is created here and emailed by hand, and nothing returns a password to
 *     the caller: an approval response is not the place for one.
 *
 * Returns a description of what happened, including a failure, because "approved" and
 * "can actually sign in" are different facts and the console should not imply the second.
 */
function hk_wholesale_ensure_buyer_user( $email, $contact_name = '', $company = '' ) {
	$email = strtolower( trim( (string) $email ) );
	if ( ! is_email( $email ) ) {
		return array(
			'created' => false,
			'emailed' => false,
			'userId'  => 0,
			'role'    => '',
			'message' => 'The application has no usable email address, so no sign-in account was created.',
		);
	}

	$existing = get_user_by( 'email', $email );
	if ( $existing ) {
		return array(
			'created' => false,
			'emailed' => false,
			'userId'  => (int) $existing->ID,
			'role'    => implode( ', ', (array) $existing->roles ),
			'message' => 'This buyer already had a WordPress account, so it is unchanged — they sign in with the password they already use.',
		);
	}

	hk_wholesale_ensure_buyer_role();

	$base     = sanitize_user( strtok( $email, '@' ), true );
	$base     = $base !== '' ? $base : 'wholesale';
	$username = $base;
	$suffix   = 1;
	while ( username_exists( $username ) ) {
		$suffix++;
		$username = $base . $suffix;
	}

	$user_id = wp_insert_user(
		array(
			'user_login'   => $username,
			'user_email'   => $email,
			'user_pass'    => wp_generate_password( 32, true, true ),
			'first_name'   => (string) $contact_name,
			'display_name' => $company !== '' ? (string) $company : (string) $contact_name,
			'role'         => HK_WHOLESALE_BUYER_ROLE,
		)
	);

	if ( is_wp_error( $user_id ) ) {
		return array(
			'created' => false,
			'emailed' => false,
			'userId'  => 0,
			'role'    => '',
			'message' => 'The buyer’s WordPress account could not be created: ' . $user_id->get_error_message(),
		);
	}

	// WordPress's own new-user email, which carries the set-password link. Whether the
	// host's mail actually delivers is not something this code can claim, so the reply
	// says the mail was *asked for* rather than sent.
	$emailed = false;
	if ( function_exists( 'wp_new_user_notification' ) ) {
		wp_new_user_notification( $user_id, null, 'user' );
		$emailed = true;
	}

	return array(
		'created' => true,
		'emailed' => $emailed,
		'userId'  => (int) $user_id,
		'role'    => HK_WHOLESALE_BUYER_ROLE,
		'message' => $emailed
			? 'A WordPress sign-in account was created with the wholesale buyer role, and the set-password email was sent to ' . $email . '.'
			: 'A WordPress sign-in account was created with the wholesale buyer role, but the set-password email could not be requested — the buyer needs a password reset from the site.',
	);
}

/**
 * Where the installer records a table it could not create.
 *
 * `dbDelta()` reports nothing: a CREATE TABLE that MySQL refused is simply not
 * there, and the first symptom is a write answering "the record could not be
 * stored" with no reason. So the installer checks each table after it builds it and
 * leaves the answer where a human can read it (`/settings`) instead of in a log
 * nobody looks at.
 */
const HK_WHOLESALE_SCHEMA_OPTION = 'hk_wholesale_schema_problems';

/** One owner for the table prefix, so no table name is spelled twice. */
function hk_wholesale_table( $resource ) {
	global $wpdb;
	return $wpdb->prefix . 'hk_wholesale_' . $resource;
}

/* ------------------------------------------------------------------ */
/* Schema — one declaration, used for both dbDelta and the write gate  */
/* ------------------------------------------------------------------ */

/**
 * Every wholesale store, declared once.
 *
 * The column list is not decoration: `hk_wholesale_filter_payload()` filters an
 * incoming request against exactly this map, so a caller cannot invent a column.
 * Generating the CREATE TABLE statement from the same array is what keeps the
 * write gate and the real schema from drifting apart — a column the database has
 * but this map does not is unreachable, and a column this map has but the
 * database does not would be a bug that surfaces on the first write rather than
 * in production months later.
 *
 * `created_at`/`updated_at` are added to every table by the builder and are never
 * writable from a request: a client does not get to say when a row was created.
 */
function hk_wholesale_schema() {
	return array(
		// A buyer we approved. `wp_user_id` links the wholesale account to the
		// WordPress/WooCommerce user whose password the portal login verifies.
		'accounts'       => array(
			'columns' => array(
				'ref'                 => 'string32',
				'wp_user_id'          => 'int',
				'company'             => 'string191',
				'contact_name'        => 'string191',
				'email'               => 'string191',
				'phone'               => 'string64',
				'country'             => 'string64',
				'website'             => 'string191',
				'business_type'       => 'string64',
				'billing_address'     => 'text',
				'destination_country' => 'string64',
				'destination_port'    => 'string64',
				'status'              => 'string32',
				'payment_terms'       => 'text',
				// The dealer's share of the profit on orders they bring or receive. Kept on
				// the account as the standing agreement, and copied onto each order so a
				// renegotiation cannot silently reprice history.
				'commission_pct'      => 'float',
				'commission_terms'    => 'text',
				'notes'               => 'text',
				'approved_at'         => 'datetime',
			),
			'keys'    => array( 'KEY status (status)', 'KEY email (email)', 'KEY ref (ref)' ),
		),
		// A request for an account, before anyone approved it.
		'applications'   => array(
			'columns' => array(
				'company'             => 'string191',
				'contact_name'        => 'string191',
				'email'               => 'string191',
				'phone'               => 'string64',
				'country'             => 'string64',
				'website'             => 'string191',
				'business_type'       => 'string64',
				'monthly_volume'      => 'string191',
				'annual_volume'       => 'string191',
				'interested_products' => 'text',
				'logistics_mode'      => 'string64',
				'destination_country' => 'string64',
				'destination_port'    => 'string32',
				'notes'               => 'text',
				'status'              => 'string32',
				'account_id'          => 'int',
				'decided_at'          => 'datetime',
				'decided_by'          => 'string191',
			),
			'keys'    => array( 'KEY status (status)', 'KEY email (email)' ),
		),
		// The wholesale master. `packaging` is JSON: see `hk_wholesale_packaging_fields()`.
		'products'       => array(
			'columns' => array(
				'woo_product_id'      => 'int',
				'wholesale_sku'       => 'string191',
				'name'                => 'string191',
				'moq'                 => 'int',
				'ex_factory_cost'     => 'float',
				'currency'            => 'string8',
				'origin_id'           => 'int',
				'supplier_id'         => 'int',
				'lead_time_days'      => 'int',
				'net_unit_weight_kg'  => 'float',
				'packaging'           => 'json',
				'active'              => 'bool',
				'notes'               => 'text',
			),
			'keys'    => array( 'KEY woo_product_id (woo_product_id)', 'KEY active (active)' ),
		),
		// Volume breaks. A tier belongs to one wholesale product.
		'price_tiers'    => array(
			'columns' => array(
				'product_id' => 'int',
				'min_units'  => 'int',
				'unit_price' => 'float',
				'currency'   => 'string8',
				'notes'      => 'text',
			),
			'keys'    => array( 'KEY product_id (product_id)', 'KEY min_units (min_units)' ),
		),
		'suppliers'      => array(
			'columns' => array(
				'name'     => 'string191',
				'country'  => 'string64',
				'city'     => 'string64',
				'port'     => 'string32',
				'currency' => 'string8',
				'contact'  => 'string191',
				'notes'    => 'text',
				'active'   => 'bool',
			),
			'keys'    => array( 'KEY active (active)' ),
		),
		'origins'        => array(
			'columns' => array(
				'country' => 'string64',
				'city'    => 'string64',
				'port'    => 'string32',
				'notes'   => 'text',
				'active'  => 'bool',
			),
			'keys'    => array( 'KEY port (port)' ),
		),
		// The configurable charge set for one origin/supplier, in one currency.
		// `charges` and `destination` are JSON keyed by the labels the cost engine
		// knows (`HK_WHOLESALE_CHARGE_KEYS`), so adding a charge is data, not a
		// migration.
		'cost_profiles'  => array(
			'columns' => array(
				'name'                 => 'string191',
				'origin_id'            => 'int',
				'supplier_id'          => 'int',
				'currency'             => 'string8',
				'charges'              => 'json',
				'destination'          => 'json',
				'insurance_pct'        => 'float',
				'duty_pct'             => 'float',
				'duty_in_landed'       => 'bool',
				'include_destination'  => 'bool',
				'notes'                => 'text',
			),
			'keys'    => array( 'KEY origin_id (origin_id)' ),
		),
		// An ocean rate. `source` is 'manual' or a provider id, and is never
		// inferred: a manual number and a fetched one must stay distinguishable.
		'freight_rates'  => array(
			'columns' => array(
				'source'             => 'string16',
				'provider'           => 'string191',
				'origin_port'        => 'string32',
				'destination_port'   => 'string32',
				'container_type'     => 'string32',
				'carrier'            => 'string191',
				'currency'           => 'string8',
				'ocean_freight'      => 'float',
				'surcharges'         => 'json',
				'transit_days'       => 'int',
				'valid_until'        => 'datetime',
				'retrieved_at'       => 'datetime',
				'provider_reference' => 'string191',
				'notes'              => 'text',
			),
			'keys'    => array( 'KEY lane (origin_port, destination_port, container_type)', 'KEY valid_until (valid_until)' ),
		),
		'port_charges'   => array(
			'columns' => array(
				'side'     => 'string16',
				'port'     => 'string32',
				'label'    => 'string191',
				'amount'   => 'float',
				'currency' => 'string8',
				'per'      => 'string16',
				'notes'    => 'text',
			),
			'keys'    => array( 'KEY side_port (side, port)' ),
		),
		// A container type's real limits. Editable, because "a 20ft holds 33 CBM"
		// is a planning assumption, not a constant.
		'container_profiles' => array(
			'columns' => array(
				'code'                    => 'string32',
				'name'                    => 'string191',
				'usable_cbm'              => 'float',
				'max_cargo_weight_kg'     => 'float',  				'practical_volume_factor' => 'float',
				// The box's inside, in centimetres. These are what let the pallet count be
				// *counted* — floor positions × stackable tiers — instead of taking the
				// assumed `pallet_capacity` on faith. Null means "not measured", and the
				// calculator then says it is assuming rather than measuring.
				'internal_length_cm'      => 'float',
				'internal_width_cm'       => 'float',
				'internal_height_cm'      => 'float',
				'pallet_capacity'         => 'int',
				'notes'                   => 'text',
			),
			'keys'    => array( 'KEY code (code)' ),
		),
		'quotes'         => array(
			'columns' => array(
				'ref'                   => 'string32',
				'account_id'            => 'int',
				'status'                => 'string32',
				'incoterm'              => 'string8',
				'destination_country'   => 'string64',
				'destination_port'      => 'string32',
				'container_profile_id'  => 'int',
				'containers'            => 'int',
				'currency'              => 'string8',
				'fx'                    => 'json',
				'cost_profile_id'       => 'int',
				'freight'               => 'json',
				'lines'                 => 'json',
				'assumptions'           => 'json',
				'totals'                => 'json',
				'margin_pct'            => 'float',
				'sell_total'            => 'float',
				'pricing_basis'         => 'string32',
				'valid_until'           => 'datetime',
				'notes'                 => 'text',
				'created_by'            => 'string191',
				'submitted_at'          => 'datetime',
				'decided_at'            => 'datetime',
			),
			'keys'    => array( 'KEY status (status)', 'KEY account_id (account_id)', 'KEY ref (ref)' ),
		),
		'orders'         => array(
			'columns' => array(
				'ref'                 => 'string32',
				'account_id'          => 'int',
				'quote_id'            => 'int',
				'status'              => 'string32',
				'incoterm'            => 'string8',
				'destination_country' => 'string64',
				'destination_port'    => 'string32',
				'currency'            => 'string8',
				'plan'                => 'json',
				'totals'              => 'json',
				'payment_terms'       => 'json',
				'sell_total'          => 'float',
				'paid_amount'         => 'float',
				'quote_ref'           => 'string32',
				// Whether the account itself is the dealer, or a trade customer the dealer
				// introduced. Zero means "no dealer" — the order is Himalayan Koh's own.
				'dealer_id'           => 'int',
				// The profit record. Every figure is a snapshot taken when the order was
				// raised: changing a supplier cost later must not rewrite an agreed margin.
				'cost_total'          => 'float',
				'freight_total'       => 'float',
				'other_costs'         => 'float',
				'commission_pct'      => 'float',
				'commission_amount'   => 'float',
				'hk_net_profit'       => 'float',
				'notes'               => 'text',
				'created_by'          => 'string191',
			),
			'keys'    => array( 'KEY account_id (account_id)', 'KEY status (status)', 'KEY ref (ref)' ),
		),
		'audit'          => array(
			'columns' => array(
				'at'        => 'datetime',
				'actor'     => 'string191',
				'action'    => 'string64',
				'entity'    => 'string64',
				'entity_id' => 'int',
				'detail'    => 'json',
			),
			'keys'    => array( 'KEY entity (entity, entity_id)', 'KEY at (at)' ),
		),
	);
}

/** Column type → its SQL, so the schema array and the database cannot disagree. */
function hk_wholesale_column_sql( $type ) {
	switch ( $type ) {
		case 'string191':
			return 'varchar(191) NOT NULL DEFAULT \'\'';
		case 'string64':
			return 'varchar(64) NOT NULL DEFAULT \'\'';
		case 'string32':
			return 'varchar(32) NOT NULL DEFAULT \'\'';
		case 'string16':
			return 'varchar(16) NOT NULL DEFAULT \'\'';
		case 'string8':
			return 'varchar(8) NOT NULL DEFAULT \'\'';
		case 'text':
		case 'json':
			return 'longtext NOT NULL';
		case 'int':
			return 'bigint(20) NOT NULL DEFAULT 0';
		case 'float':
			return 'decimal(18,6) NOT NULL DEFAULT 0';
		case 'bool':
			return 'tinyint(1) NOT NULL DEFAULT 0';
		case 'datetime':
			return 'datetime NULL DEFAULT NULL';
	}
	return 'longtext NOT NULL';
}

/** The columns the builder adds to every table and never lets a request write. */
function hk_wholesale_managed_columns() {
	return array( 'created_at' => 'datetime', 'updated_at' => 'datetime' );
}

/* ------------------------------------------------------------------ */
/* Install                                                             */
/* ------------------------------------------------------------------ */

/** Quote each index column separately, including composite indexes. */
function hk_wholesale_quote_schema_key( $key ) {
	return preg_replace_callback(
		'/^\s*(PRIMARY KEY|UNIQUE KEY|KEY|FULLTEXT KEY)\s+([a-z_]+)\s*\(([^)]+)\)\s*$/i',
		function ( $matches ) {
			$columns = array_map( function ( $column ) { return '`' . trim( $column ) . '`'; }, explode( ',', $matches[3] ) );
			return $matches[1] . ' `' . $matches[2] . '` (' . implode( ', ', $columns ) . ')';
		},
		(string) $key
	);
}

/**
 * Creates or updates every table. Safe to call repeatedly — that is what dbDelta is.
 *
 * Also seeds the assumptions a calculator cannot invent: container types and the
 * two origins Himalayan Koh actually buys from. Seeding only fills an empty table,
 * so re-running never overwrites a limit the owner has corrected.
 */
function hk_wholesale_install() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$charset = $wpdb->get_charset_collate();
	$missing = array();
	$lost    = array();
	$error   = '';

	foreach ( hk_wholesale_schema() as $resource => $spec ) {
		$table   = hk_wholesale_table( $resource );
		$wanted  = array_merge( $spec['columns'], hk_wholesale_managed_columns() );
		$columns = array();
		foreach ( $wanted as $name => $type ) {
			// Every identifier is backticked. A column may legitimately be called a word
			// SQL reserves — `lines` is one — and an unquoted column name is a syntax
			// error, which dbDelta swallows, leaving a table that silently does not
			// exist until the first write against it fails.
			$columns[] = "`{$name}` " . hk_wholesale_column_sql( $type );
		}
		$keys = isset( $spec['keys'] ) ? $spec['keys'] : array();
		$keys = array_map( 'hk_wholesale_quote_schema_key', $keys );

		// dbDelta is whitespace-sensitive: two spaces after PRIMARY KEY, and the
		// key list after it one per line.
		$sql = "CREATE TABLE `{$table}` (\n"
			. "\t\t`id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n\t\t"
			. implode( ",\n\t\t", $columns ) . ",\n"
			. "\t\tPRIMARY KEY  (`id`),\n\t\t"
			. implode( ",\n\t\t", $keys ) . "\n"
			. "\t) $charset;";

		$delta   = dbDelta( $sql );
		// Read the database's own complaint *before* the next query clears it: a
		// successful statement resets `last_error`, so checking after the verification
		// below is how the reason for a missing table gets lost.
		$db_error = $wpdb->last_error;

		// Verified, not assumed: dbDelta is quiet about failure.
		$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ); // phpcs:ignore WordPress.DB
		if ( $found !== $table ) {
			$missing[] = $resource;
			if ( ! $error ) {
				$detail = $db_error
					? $db_error
					: ( is_array( $delta ) && $delta ? implode( '; ', array_slice( $delta, 0, 3 ) ) : 'dbDelta reported nothing' );
				$error = $resource . ': ' . $detail;
			}
			continue;
		}

		// A table that exists can still be short a column: that is what an upgrade
		// looks like when dbDelta's ADD COLUMN was refused, and the read path would
		// never notice because a missing column in a SELECT returns NULL, not an error.
		$present = (array) $wpdb->get_col( "SHOW COLUMNS FROM `{$table}`" ); // phpcs:ignore WordPress.DB
		$absent  = array_values( array_diff( array_keys( $wanted ), $present ) );
		if ( $absent ) {
			$lost[ $resource ] = $absent;
			if ( ! $error ) {
				$error = $resource . ': missing column(s) ' . implode( ', ', $absent );
			}
		}
	}

	hk_wholesale_seed_defaults();
	hk_wholesale_backfill_container_dimensions();

	update_option( HK_WHOLESALE_DB_OPTION, HK_WHOLESALE_DB_VERSION );
	update_option(
		HK_WHOLESALE_SCHEMA_OPTION,
		array(
			'at'      => current_time( 'mysql' ),
			'missing' => $missing,
			'columns' => $lost,
			'error'   => substr( (string) $error, 0, 300 ),
		)
	);
}

/**
 * Runs the installer when the code is newer than the installed schema — or when the
 * last attempt left a table missing.
 *
 * A schema that could not be built is retried at most hourly rather than on every
 * request: DDL on a page load is expensive, and a host that refused the statement once
 * is unlikely to accept it again a second later. Until it succeeds the problem is
 * visible in `/settings`, which is better than a silent half-built store.
 */
function hk_wholesale_maybe_upgrade() {
	$installed = get_option( HK_WHOLESALE_DB_OPTION );
	if ( $installed !== HK_WHOLESALE_DB_VERSION ) {
		hk_wholesale_install();
		return;
	}

	$problems = get_option( HK_WHOLESALE_SCHEMA_OPTION );
	if ( ! is_array( $problems ) || ( empty( $problems['missing'] ) && empty( $problems['columns'] ) ) ) {
		return;
	}
	if ( time() - (int) strtotime( (string) $problems['at'] ) < HOUR_IN_SECONDS ) {
		return;
	}
	hk_wholesale_install();
}

/**
 * Gives container profiles their inside dimensions where they are still blank.
 *
 * The seed above only runs on an empty table, so an installation that already had its
 * container types would keep null dimensions for ever — and a null box is a box the
 * calculator has to *assume* rather than count. The three standard types have published
 * inside measurements, so they are filled in by code, once, and only where nothing is
 * recorded. An owner who has already entered their own forwarder's figures is never
 * overwritten: those are theirs, not ours.
 */
function hk_wholesale_backfill_container_dimensions() {
	global $wpdb;

	$containers = hk_wholesale_table( 'container_profiles' );
	$known      = array(
		'20FT' => array( 589, 235, 239 ),
		'40FT' => array( 1203, 235, 239 ),
		'40HC' => array( 1203, 235, 269 ),
	);

	// One statement per known type, guarded on every dimension being blank, so running
	// this twice changes nothing and an owner's own figures are never replaced.
	foreach ( $known as $code => $dims ) {
		$sql = $wpdb->prepare(
			'UPDATE ' . $containers . ' SET internal_length_cm = %f, internal_width_cm = %f, internal_height_cm = %f, updated_at = %s'
			. ' WHERE UPPER(code) = %s'
			. ' AND ( internal_length_cm IS NULL OR internal_length_cm = 0 )'
			. ' AND ( internal_width_cm IS NULL OR internal_width_cm = 0 )'
			. ' AND ( internal_height_cm IS NULL OR internal_height_cm = 0 )',
			$dims[0],
			$dims[1],
			$dims[2],
			current_time( 'mysql' ),
			$code
		);
		$wpdb->query( $sql ); // phpcs:ignore WordPress.DB
	}
}

/** Container types and origins, inserted only while their table is empty. */
function hk_wholesale_seed_defaults() {
	global $wpdb;

	$containers = hk_wholesale_table( 'container_profiles' );
	if ( ! $wpdb->get_var( "SELECT COUNT(*) FROM {$containers}" ) ) { // phpcs:ignore WordPress.DB
		// code, name, CBM, payload kg, practical factor, inside L×W×H (cm), assumed
		// pallets, notes. The inside dimensions are the published dry-van figures; they
		// are stored so the counting can be done from them, and they stay editable.
		$rows = array(
			array( '20FT', '20ft Standard', 33.2, 28200, 0.9, 589, 235, 239, 10, 'Typical 20ft dry container: 33.2 CBM nominal, 28.2 t payload, inside 589×235×239 cm. Loading assumptions are editable.' ),
			array( '40FT', '40ft Standard', 67.7, 26700, 0.9, 1203, 235, 239, 21, 'Typical 40ft dry container: 67.7 CBM nominal, 26.7 t payload, inside 1203×235×239 cm.' ),
			array( '40HC', '40ft High Cube', 76.4, 26500, 0.9, 1203, 235, 269, 21, 'Typical 40ft high cube: 76.4 CBM nominal, 26.5 t payload, inside 1203×235×269 cm.' ),
		);
		foreach ( $rows as $row ) {
			$wpdb->insert(
				$containers,
				array(
					'code'                    => $row[0],
					'name'                    => $row[1],
					'usable_cbm'              => $row[2],
					'max_cargo_weight_kg'     => $row[3],
					'practical_volume_factor' => $row[4],
					'internal_length_cm'      => $row[5],
					'internal_width_cm'       => $row[6],
					'internal_height_cm'      => $row[7],
					'pallet_capacity'         => $row[8],
					'notes'                   => $row[9],
					'created_at'              => current_time( 'mysql' ),
					'updated_at'              => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%f', '%f', '%f', '%f', '%f', '%f', '%d', '%s', '%s', '%s' )
			);
		}
	}

	$origins = hk_wholesale_table( 'origins' );
	if ( ! $wpdb->get_var( "SELECT COUNT(*) FROM {$origins}" ) ) { // phpcs:ignore WordPress.DB
		$rows = array(
			array( 'Pakistan', 'Khewra / Karachi', 'PKKHI', 'The salt itself originates in Khewra; export is usually out of Karachi (Port Qasim or KICT).' ),
			array( 'China', 'Shanghai', 'CNSHA', 'Used for sourcing when a product or a price is better placed than Khewra.' ),
		);
		foreach ( $rows as $row ) {
			$wpdb->insert(
				$origins,
				array(
					'country'    => $row[0],
					'city'       => $row[1],
					'port'       => $row[2],
					'notes'      => $row[3],
					'active'     => 1,
					'created_at' => current_time( 'mysql' ),
					'updated_at' => current_time( 'mysql' ),
				),
				array( '%s', '%s', '%s', '%s', '%d', '%s', '%s' )
			);
		}
	}
}

/* ------------------------------------------------------------------ */
/* Request guarding                                                    */
/* ------------------------------------------------------------------ */

/** Every endpoint is administrator-only; the app's server is the only caller. */
function hk_wholesale_can_manage() {
	return current_user_can( 'manage_options' );
}

/** Normalises an identifier from a request. */
function hk_wholesale_id( $value ) {
	return max( 0, (int) $value );
}

/** A row id is required for a single-record read or a delete. */
function hk_wholesale_require_resource( $request ) {
	$resource = (string) $request->get_param( 'resource' );
	$schema   = hk_wholesale_schema();
	if ( '' === $resource || ! isset( $schema[ $resource ] ) ) {
		return new WP_Error(
			'hk_wholesale_unknown_resource',
			'That is not one of the record types this endpoint stores.',
			array( 'status' => 400 )
		);
	}
	return $resource;
}

/** JSON columns come back as text; hand the caller the structure it wrote. */
function hk_wholesale_decode_row( $resource, $row ) {
	if ( ! $row ) {
		return $row;
	}
	$columns = hk_wholesale_schema()[ $resource ]['columns'];
	$out     = array();
	foreach ( (array) $row as $key => $value ) {
		if ( isset( $columns[ $key ] ) && 'json' === $columns[ $key ] ) {
			$decoded     = json_decode( (string) $value, true );
			$out[ $key ] = ( null === $decoded ) ? array() : $decoded;
			continue;
		}
		if ( isset( $columns[ $key ] ) && 'int' === $columns[ $key ] ) {
			$out[ $key ] = (int) $value;
			continue;
		}
		if ( isset( $columns[ $key ] ) && 'float' === $columns[ $key ] ) {
			$out[ $key ] = (float) $value;
			continue;
		}
		if ( isset( $columns[ $key ] ) && 'bool' === $columns[ $key ] ) {
			$out[ $key ] = (bool) (int) $value;
			continue;
		}
		$out[ $key ] = $value;
	}
	return $out;
}

/** A value written into a column of the given type. */
function hk_wholesale_cast_value( $type, $value ) {
	switch ( $type ) {
		case 'int':
			return (int) $value;
		case 'float':
			return (float) $value;
		case 'bool':
			return $value ? 1 : 0;
		case 'json':
			if ( is_array( $value ) || is_object( $value ) ) {
				return wp_json_encode( $value );
			}
			return is_string( $value ) ? $value : '{}';
		case 'datetime':
			$text = is_string( $value ) ? trim( $value ) : '';
			if ( '' === $text ) {
				return null;
			}
			$time = strtotime( $text );
			return $time ? gmdate( 'Y-m-d H:i:s', $time ) : null;
		default:
			return is_scalar( $value ) ? (string) $value : '';
	}
}

/** The $wpdb format for a column. */
function hk_wholesale_format( $type ) {
	if ( 'int' === $type || 'bool' === $type ) {
		return '%d';
	}
	if ( 'float' === $type ) {
		return '%f';
	}
	if ( 'datetime' === $type ) {
		return '%s';
	}
	return '%s';
}

/**
 * A request body reduced to the columns this resource may write.
 *
 * An unknown key is dropped rather than rejected, so a newer client can send a
 * field this build does not know without failing the whole write. What matters is
 * that it is dropped: this function is the reason `resource` cannot be an arbitrary
 * table name or a column name, which is what makes one endpoint for many record
 * types safe instead of a doorway into the database.
 */
function hk_wholesale_filter_payload( $resource, $data ) {
	$columns = hk_wholesale_schema()[ $resource ]['columns'];
	$out     = array();
	foreach ( (array) $data as $key => $value ) {
		if ( ! isset( $columns[ $key ] ) ) {
			continue;
		}
		$out[ $key ] = hk_wholesale_cast_value( $columns[ $key ], $value );
	}
	return $out;
}

/** Every NOT NULL column gets a usable default when a create omits it. */
function hk_wholesale_defaults( $resource ) {
	$defaults = array();
	foreach ( hk_wholesale_schema()[ $resource ]['columns'] as $name => $type ) {
		switch ( $type ) {
			case 'int':
				$defaults[ $name ] = 0;
				break;
			case 'float':
				$defaults[ $name ] = 0.0;
				break;
			case 'bool':
				$defaults[ $name ] = 0;
				break;
			case 'datetime':
				$defaults[ $name ] = null;
				break;
			case 'json':
				$defaults[ $name ] = '{}';
				break;
			default:
				$defaults[ $name ] = '';
		}
	}
	return $defaults;
}

/** Appends an audit row. Every write path calls this, including a status change. */
function hk_wholesale_audit( $action, $entity, $entity_id, $detail, $actor = '' ) {
	global $wpdb;
	$wpdb->insert(
		hk_wholesale_table( 'audit' ),
		array(
			'at'         => current_time( 'mysql' ),
			'actor'      => (string) $actor,
			'action'     => (string) $action,
			'entity'     => (string) $entity,
			'entity_id'  => (int) $entity_id,
			'detail'     => wp_json_encode( is_array( $detail ) ? $detail : array() ),
			'created_at' => current_time( 'mysql' ),
			'updated_at' => current_time( 'mysql' ),
		),
		array( '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s' )
	);
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lists records of one resource.
 *
 * Filters are deliberately few and name-based: `id`, `email`, `status`,
 * `account_id`, `product_id`, `side`, `code` and a lane triple. A generic
 * "where" parameter would be a query builder exposed over HTTP, which is the
 * thing this endpoint exists to avoid.
 */
function hk_wholesale_list_records( $request ) {
	global $wpdb;

	$resource = hk_wholesale_require_resource( $request );
	if ( is_wp_error( $resource ) ) {
		return $resource;
	}

	$table  = hk_wholesale_table( $resource );
	$where  = array( '1=1' );
	$values = array();

	$id = $request->get_param( 'id' );
	if ( $id ) {
		$where[]  = 'id = %d';
		$values[] = hk_wholesale_id( $id );
	}

	// `ref` and `entity` are here for the console and the portal: a quotation or a
	// wholesale order is looked up by the reference a person quotes in an email, and a
	// revision history is read as one entity's audit rows. Both stay inside the
	// prepared-statement path like every other filter.
	foreach ( array( 'email', 'status', 'code', 'side', 'origin_port', 'destination_port', 'container_type', 'wholesale_sku', 'ref', 'entity', 'action' ) as $filter ) {
		$value = $request->get_param( $filter );
		if ( null === $value || '' === $value ) {
			continue;
		}
		if ( ! isset( hk_wholesale_schema()[ $resource ]['columns'][ $filter ] ) ) {
			continue;
		}
		$where[]  = "`{$filter}` = %s";
		$values[] = (string) $value;
	}

	foreach ( array( 'account_id', 'product_id', 'woo_product_id', 'origin_id', 'supplier_id', 'entity_id', 'dealer_id', 'quote_id' ) as $filter ) {
		$value = $request->get_param( $filter );
		if ( null === $value || '' === $value ) {
			continue;
		}
		if ( ! isset( hk_wholesale_schema()[ $resource ]['columns'][ $filter ] ) ) {
			continue;
		}
		$where[]  = "`{$filter}` = %d";
		$values[] = hk_wholesale_id( $value );
	}

	$active = $request->get_param( 'active' );
	if ( null !== $active && '' !== $active && isset( hk_wholesale_schema()[ $resource ]['columns']['active'] ) ) {
		$where[]  = '`active` = %d';
		$values[] = ( '1' === (string) $active || 'true' === (string) $active ) ? 1 : 0;
	}

	$limit = $request->get_param( 'limit' );
	$limit = $limit ? min( 500, max( 1, (int) $limit ) ) : 200;

	$order_by = $request->get_param( 'order' );
	$order_by = $order_by ? preg_replace( '/[^a-z_]/', '', (string) $order_by ) : 'id';
	if ( ! isset( hk_wholesale_schema()[ $resource ]['columns'][ $order_by ] ) && 'id' !== $order_by ) {
		$order_by = 'id';
	}

	// The column is validated against the schema above and backticked here, so a
	// reserved word (`order` is a verb in SQL, not a column) cannot break the query.
	$sql = "SELECT * FROM `{$table}` WHERE " . implode( ' AND ', $where ) . " ORDER BY `{$order_by}` DESC LIMIT %d";
	$values[] = $limit;

	$rows = $wpdb->get_results( $wpdb->prepare( $sql, $values ), ARRAY_A ); // phpcs:ignore WordPress.DB
	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = hk_wholesale_decode_row( $resource, $row );
	}

	return rest_ensure_response(
		array(
			'resource' => $resource,
			'items'    => $items,
			'count'    => count( $items ),
		)
	);
}

/** One record by id. */
function hk_wholesale_get_record( $request ) {
	global $wpdb;

	$resource = hk_wholesale_require_resource( $request );
	if ( is_wp_error( $resource ) ) {
		return $resource;
	}

	$id = hk_wholesale_id( $request->get_param( 'id' ) );
	if ( ! $id ) {
		return new WP_Error( 'hk_wholesale_missing_id', 'A record id is required.', array( 'status' => 400 ) );
	}

	$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . hk_wholesale_table( $resource ) . ' WHERE id = %d', $id ), ARRAY_A ); // phpcs:ignore WordPress.DB
	if ( ! $row ) {
		return new WP_Error( 'hk_wholesale_not_found', 'No such record.', array( 'status' => 404 ) );
	}

	return rest_ensure_response( array( 'record' => hk_wholesale_decode_row( $resource, $row ) ) );
}

/**
 * Creates or updates one record.
 *
 * An `id` selects the update; without one this is a create and the row is filled
 * in with the schema's defaults first, so a partial create is a complete row.
 */
function hk_wholesale_upsert_record( $request ) {
	global $wpdb;

	$resource = hk_wholesale_require_resource( $request );
	if ( is_wp_error( $resource ) ) {
		return $resource;
	}

	$body   = $request->get_json_params();
	$body   = is_array( $body ) ? $body : array();
	$data   = isset( $body['data'] ) && is_array( $body['data'] ) ? $body['data'] : array();
	$actor  = isset( $body['actor'] ) ? (string) $body['actor'] : '';
	$id     = hk_wholesale_id( isset( $body['id'] ) ? $body['id'] : 0 );
	$table  = hk_wholesale_table( $resource );
	$now    = current_time( 'mysql' );
	$fields = hk_wholesale_filter_payload( $resource, $data );

	if ( ! $fields ) {
		return new WP_Error( 'hk_wholesale_empty_payload', 'No writable field was supplied.', array( 'status' => 400 ) );
	}

	$formats = array();
	$types   = hk_wholesale_schema()[ $resource ]['columns'];

	if ( $id ) {
		$existing = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		if ( ! $existing ) {
			return new WP_Error( 'hk_wholesale_not_found', 'No such record.', array( 'status' => 404 ) );
		}

		$fields['updated_at'] = $now;
		foreach ( $fields as $name => $value ) {
			if ( 'updated_at' === $name ) {
				$formats[] = '%s';
				continue;
			}
			$formats[] = hk_wholesale_format( $types[ $name ] );
		}

		$wpdb->update( $table, $fields, array( 'id' => $id ), $formats, array( '%d' ) );

		// A quote's own history is the point of a quote: record both what changed
		// and that it changed, so an override is visible after the fact.
		if ( 'quotes' === $resource && array_key_exists( 'status', $fields ) ) {
			hk_wholesale_audit( 'quote_status', 'quotes', $id, array( 'status' => $fields['status'] ), $actor );
		} else {
			hk_wholesale_audit( 'update', $resource, $id, array( 'fields' => array_keys( $fields ) ), $actor );
		}
	} else {
		$fields = array_merge( hk_wholesale_defaults( $resource ), $fields );
		$fields['created_at'] = $now;
		$fields['updated_at'] = $now;
		foreach ( $fields as $name => $value ) {
			$formats[] = ( 'created_at' === $name || 'updated_at' === $name ) ? '%s' : hk_wholesale_format( $types[ $name ] );
		}

		$wpdb->insert( $table, $fields, $formats );
		$id = (int) $wpdb->insert_id;
		if ( ! $id ) {
			return new WP_Error( 'hk_wholesale_write_failed', 'The record could not be stored.', array( 'status' => 500 ) );
		}
		hk_wholesale_audit( 'create', $resource, $id, array( 'fields' => array_keys( $fields ) ), $actor );
	}

	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB

	return rest_ensure_response( array( 'record' => hk_wholesale_decode_row( $resource, $row ) ) );
}

/** Deletes one record. The audit row is written first so the deletion is traceable. */
function hk_wholesale_delete_record( $request ) {
	global $wpdb;

	$resource = hk_wholesale_require_resource( $request );
	if ( is_wp_error( $resource ) ) {
		return $resource;
	}

	$id = hk_wholesale_id( $request->get_param( 'id' ) );
	if ( ! $id ) {
		return new WP_Error( 'hk_wholesale_missing_id', 'A record id is required.', array( 'status' => 400 ) );
	}

	$table = hk_wholesale_table( $resource );
	$row   = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB
	if ( ! $row ) {
		return new WP_Error( 'hk_wholesale_not_found', 'No such record.', array( 'status' => 404 ) );
	}

	hk_wholesale_audit( 'delete', $resource, $id, array( 'snapshot' => hk_wholesale_decode_row( $resource, $row ) ) );
	$wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );

	return rest_ensure_response( array( 'deleted' => true, 'resource' => $resource, 'id' => $id ) );
}

/* ------------------------------------------------------------------ */
/* Applications and accounts                                           */
/* ------------------------------------------------------------------ */

/** The application statuses the app and the plugin both know. */
function hk_wholesale_application_statuses() {
	return array( 'PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED', 'SUSPENDED' );
}

/**
 * Submits a wholesale application.
 *
 * Idempotent for the same email: a second submission while one is still pending
 * updates that application instead of stacking a duplicate a reviewer would read
 * twice. An email that already holds an active account is refused, because the
 * answer there is "sign in", not "apply again".
 */
function hk_wholesale_submit_application( $request ) {
	global $wpdb;

	$body  = $request->get_json_params();
	$body  = is_array( $body ) ? $body : array();
	$email = isset( $body['email'] ) ? strtolower( trim( (string) $body['email'] ) ) : '';

	if ( ! $email || ! is_email( $email ) ) {
		return new WP_Error( 'hk_wholesale_invalid_email', 'A valid business email address is required.', array( 'status' => 400 ) );
	}

	$required = array( 'company', 'contact_name', 'country', 'business_type' );
	foreach ( $required as $field ) {
		if ( empty( $body[ $field ] ) ) {
			return new WP_Error(
				'hk_wholesale_incomplete',
				'The application is missing a required field: ' . $field . '.',
				array( 'status' => 400 )
			);
		}
	}

	$accounts = hk_wholesale_table( 'accounts' );
	$active   = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$accounts} WHERE email = %s AND status = 'ACTIVE' LIMIT 1", $email ) ); // phpcs:ignore WordPress.DB
	if ( $active ) {
		return new WP_Error(
			'hk_wholesale_already_a_customer',
			'That email already holds an approved wholesale account — sign in instead of applying again.',
			array( 'status' => 409 )
		);
	}

	$applications = hk_wholesale_table( 'applications' );
	$existing     = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$applications} WHERE email = %s ORDER BY id DESC LIMIT 1", $email ) ); // phpcs:ignore WordPress.DB

	$fields = hk_wholesale_filter_payload( 'applications', array_merge( $body, array( 'email' => $email ) ) );
	$fields['status'] = 'PENDING';
	unset( $fields['account_id'], $fields['decided_at'], $fields['decided_by'] );
	$fields['updated_at'] = current_time( 'mysql' );

	if ( $existing ) {
		$wpdb->update( $applications, $fields, array( 'id' => (int) $existing ) );
		$id     = (int) $existing;
		$action = 'application_resubmitted';
	} else {
		$fields['created_at'] = current_time( 'mysql' );
		$wpdb->insert( $applications, $fields );
		$id     = (int) $wpdb->insert_id;
		$action = 'application_submitted';
	}

	if ( ! $id ) {
		return new WP_Error( 'hk_wholesale_write_failed', 'The application could not be stored.', array( 'status' => 500 ) );
	}

	hk_wholesale_audit( $action, 'applications', $id, array( 'company' => $body['company'], 'email' => $email ) );

	$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$applications} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB

	return rest_ensure_response(
		array(
			'record'    => hk_wholesale_decode_row( 'applications', $row ),
			// The reference is what the buyer quotes in an email; the id is internal.
			'reference' => hk_wholesale_application_reference( $id ),
		)
	);
}

/** A human-quotable application reference, derived so it needs no extra column. */
function hk_wholesale_application_reference( $id ) {
	return 'HK-WS-A' . str_pad( (string) $id, 5, '0', STR_PAD_LEFT );
}

/** A human-quotable reference for any record, e.g. HK-WS-Q00012. */
function hk_wholesale_reference( $prefix, $id ) {
	return 'HK-WS-' . $prefix . str_pad( (string) $id, 5, '0', STR_PAD_LEFT );
}

/**
 * Approves or rejects an application, and creates the account an approval implies.
 *
 * One call, because "set the status" and "create the buyer's account" are one
 * decision — splitting them is how an approved applicant ends up with no account.
 * An approval is idempotent: deciding twice reuses the account instead of
 * creating a second one for the same company.
 */
function hk_wholesale_decide_application( $request ) {
	global $wpdb;

	$body     = $request->get_json_params();
	$body     = is_array( $body ) ? $body : array();
	$id       = hk_wholesale_id( isset( $body['application_id'] ) ? $body['application_id'] : 0 );
	$decision = isset( $body['decision'] ) ? strtoupper( trim( (string) $body['decision'] ) ) : '';
	$actor    = isset( $body['actor'] ) ? (string) $body['actor'] : '';
	$note     = isset( $body['note'] ) ? (string) $body['note'] : '';

	if ( ! $id ) {
		return new WP_Error( 'hk_wholesale_missing_id', 'An application id is required.', array( 'status' => 400 ) );
	}
	if ( ! in_array( $decision, hk_wholesale_application_statuses(), true ) ) {
		return new WP_Error( 'hk_wholesale_bad_decision', 'That is not an application decision.', array( 'status' => 400 ) );
	}

	$applications = hk_wholesale_table( 'applications' );
	$application  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$applications} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB
	if ( ! $application ) {
		return new WP_Error( 'hk_wholesale_not_found', 'No such application.', array( 'status' => 404 ) );
	}

	$accounts   = hk_wholesale_table( 'accounts' );
	$account    = null;
	$buyer_user = null;

	if ( 'APPROVED' === $decision ) {
		$existing = hk_wholesale_id( $application['account_id'] )
			? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$accounts} WHERE id = %d", hk_wholesale_id( $application['account_id'] ) ), ARRAY_A ) // phpcs:ignore WordPress.DB
			: null;

		if ( ! $existing ) {
			$existing = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$accounts} WHERE email = %s LIMIT 1", $application['email'] ), ARRAY_A ); // phpcs:ignore WordPress.DB
		}

		$account_fields = array(
			'company'             => $application['company'],
			'contact_name'        => $application['contact_name'],
			'email'               => strtolower( $application['email'] ),
			'phone'               => $application['phone'],
			'country'             => $application['country'],
			'website'             => $application['website'],
			'business_type'       => $application['business_type'],
			'destination_country' => $application['destination_country'],
			'destination_port'    => $application['destination_port'],
			'status'              => 'ACTIVE',
			'approved_at'         => current_time( 'mysql' ),
			'updated_at'          => current_time( 'mysql' ),
		);

		if ( $existing ) {
			$wpdb->update( $accounts, $account_fields, array( 'id' => (int) $existing['id'] ) );
			$account_id = (int) $existing['id'];
		} else {
			$account_fields['ref']        = hk_wholesale_reference( 'B', $id );
			$account_fields['created_at'] = current_time( 'mysql' );
			$wpdb->insert( $accounts, $account_fields );
			$account_id = (int) $wpdb->insert_id;
			if ( $account_id ) {
				// The ref is derived from the account's own id once it exists.
				$wpdb->update( $accounts, array( 'ref' => hk_wholesale_reference( 'B', $account_id ) ), array( 'id' => $account_id ) );
			}
		}

		if ( ! $account_id ) {
			return new WP_Error( 'hk_wholesale_write_failed', 'The account could not be created.', array( 'status' => 500 ) );
		}

		$wpdb->update(
			$applications,
			array(
				'status'     => 'APPROVED',
				'account_id' => $account_id,
				'decided_at' => current_time( 'mysql' ),
				'decided_by' => $actor,
				'updated_at' => current_time( 'mysql' ),
			),
			array( 'id' => $id )
		);

		$account = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$accounts} WHERE id = %d", $account_id ), ARRAY_A ); // phpcs:ignore WordPress.DB

		// An approved buyer with no WordPress user has nowhere to sign in, so approval
		// creates one (see `hk_wholesale_ensure_buyer_user`) and reports what it did.
		$buyer_user = hk_wholesale_ensure_buyer_user(
			isset( $account['email'] ) ? $account['email'] : '',
			isset( $account['contact_name'] ) ? $account['contact_name'] : '',
			isset( $account['company'] ) ? $account['company'] : ''
		);

		hk_wholesale_audit(
			'application_approved',
			'applications',
			$id,
			array( 'account_id' => $account_id, 'note' => $note, 'buyer_user' => $buyer_user ),
			$actor
		);
	} else {
		$wpdb->update(
			$applications,
			array(
				'status'     => $decision,
				'decided_at' => current_time( 'mysql' ),
				'decided_by' => $actor,
				'updated_at' => current_time( 'mysql' ),
			),
			array( 'id' => $id )
		);
		hk_wholesale_audit( 'application_' . strtolower( $decision ), 'applications', $id, array( 'note' => $note ), $actor );
	}

	$application = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$applications} WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB

	return rest_ensure_response(
		array(
			'application' => hk_wholesale_decode_row( 'applications', $application ),
			'account'     => $account ? hk_wholesale_decode_row( 'accounts', $account ) : null,
			'buyerUser'   => isset( $buyer_user ) ? $buyer_user : null,
		)
	);
}

/**
 * The wholesale access a signed-in shopper has, by email.
 *
 * Called by the app's portal-login route after WordPress has verified the
 * password. Returns the account only when it is ACTIVE — a suspended or merely
 * pending applicant gets an account-shaped `null` and the application's status,
 * so the login screen can say "still under review" rather than "no account".
 */
function hk_wholesale_access( $request ) {
	global $wpdb;

	$email = strtolower( trim( (string) $request->get_param( 'email' ) ) );
	if ( ! $email || ! is_email( $email ) ) {
		return new WP_Error( 'hk_wholesale_invalid_email', 'A valid email address is required.', array( 'status' => 400 ) );
	}

	$accounts = hk_wholesale_table( 'accounts' );
	$account  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$accounts} WHERE email = %s ORDER BY id DESC LIMIT 1", $email ), ARRAY_A ); // phpcs:ignore WordPress.DB

	$applications = hk_wholesale_table( 'applications' );
	$application  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$applications} WHERE email = %s ORDER BY id DESC LIMIT 1", $email ), ARRAY_A ); // phpcs:ignore WordPress.DB

	$active = ( $account && 'ACTIVE' === $account['status'] ) ? hk_wholesale_decode_row( 'accounts', $account ) : null;

	return rest_ensure_response(
		array(
			'account'     => $active,
			'application' => $application ? hk_wholesale_decode_row( 'applications', $application ) : null,
			'status'      => $active ? 'ACTIVE' : ( $application ? $application['status'] : 'NONE' ),
		)
	);
}

/* ------------------------------------------------------------------ */
/* Catalog and overview                                                */
/* ------------------------------------------------------------------ */

/**
 * The wholesale master and its tiers, in one read.
 *
 * Returns the plugin's own columns only. The product *name*, live price and stock
 * a buyer sees come from WooCommerce, read by the app through the same reader the
 * storefront uses — one source for the shop's facts, one for the wholesale facts,
 * and the app joins them on `woo_product_id` rather than this plugin guessing.
 */
function hk_wholesale_catalog( $request ) {
	global $wpdb;

	$products = hk_wholesale_table( 'products' );
	$tiers    = hk_wholesale_table( 'price_tiers' );

	$only_active = '0' !== (string) $request->get_param( 'active' );
	$where       = $only_active ? 'WHERE active = 1' : '';

	$rows     = $wpdb->get_results( "SELECT * FROM {$products} {$where} ORDER BY name ASC", ARRAY_A ); // phpcs:ignore WordPress.DB
	$tier_rows = $wpdb->get_results( "SELECT * FROM {$tiers} ORDER BY product_id ASC, min_units ASC", ARRAY_A ); // phpcs:ignore WordPress.DB

	$items = array();
	foreach ( (array) $rows as $row ) {
		$items[] = hk_wholesale_decode_row( 'products', $row );
	}

	$tier_items = array();
	foreach ( (array) $tier_rows as $row ) {
		$tier_items[] = hk_wholesale_decode_row( 'price_tiers', $row );
	}

	return rest_ensure_response( array( 'products' => $items, 'tiers' => $tier_items ) );
}

/**
 * The counts the wholesale overview shows — measured, never estimated.
 *
 * Every number is a COUNT over a real table, so an empty pipeline reads as zeroes
 * rather than as a chart with invented shape.
 */
function hk_wholesale_overview( $request ) {
	global $wpdb;

	$applications = hk_wholesale_table( 'applications' );
	$accounts     = hk_wholesale_table( 'accounts' );
	$quotes       = hk_wholesale_table( 'quotes' );
	$orders       = hk_wholesale_table( 'orders' );

	$count = function ( $sql ) use ( $wpdb ) {
		return (int) $wpdb->get_var( $sql ); // phpcs:ignore WordPress.DB
	};

	$application_rows = $wpdb->get_results( "SELECT status, COUNT(*) AS n FROM {$applications} GROUP BY status", ARRAY_A ); // phpcs:ignore WordPress.DB
	$applications_by_status = array();
	foreach ( (array) $application_rows as $row ) {
		$applications_by_status[ $row['status'] ] = (int) $row['n'];
	}

	$quote_rows = $wpdb->get_results( "SELECT status, COUNT(*) AS n, SUM(sell_total) AS value FROM {$quotes} GROUP BY status", ARRAY_A ); // phpcs:ignore WordPress.DB
	$quotes_by_status = array();
	$quoted_value     = 0.0;
	$accepted_value   = 0.0;
	foreach ( (array) $quote_rows as $row ) {
		$quotes_by_status[ $row['status'] ] = (int) $row['n'];
		if ( in_array( $row['status'], array( 'QUOTED', 'SUBMITTED', 'UNDER_REVIEW' ), true ) ) {
			$quoted_value += (float) $row['value'];
		}
		if ( 'ACCEPTED' === $row['status'] ) {
			$accepted_value += (float) $row['value'];
		}
	}

	$order_rows = $wpdb->get_results( "SELECT status, COUNT(*) AS n, SUM(sell_total) AS value FROM {$orders} GROUP BY status", ARRAY_A ); // phpcs:ignore WordPress.DB
	$orders_by_status = array();
	foreach ( (array) $order_rows as $row ) {
		$orders_by_status[ $row['status'] ] = (int) $row['n'];
	}

	$destinations = $wpdb->get_results( "SELECT destination_country AS country, COUNT(*) AS n FROM {$orders} WHERE destination_country <> '' GROUP BY destination_country ORDER BY n DESC LIMIT 10", ARRAY_A ); // phpcs:ignore WordPress.DB

	return rest_ensure_response(
		array(
			'applications' => array(
				'pending'      => isset( $applications_by_status['PENDING'] ) ? $applications_by_status['PENDING'] : 0,
				'more_info'    => isset( $applications_by_status['MORE_INFO_REQUIRED'] ) ? $applications_by_status['MORE_INFO_REQUIRED'] : 0,
				'approved'     => isset( $applications_by_status['APPROVED'] ) ? $applications_by_status['APPROVED'] : 0,
				'rejected'     => isset( $applications_by_status['REJECTED'] ) ? $applications_by_status['REJECTED'] : 0,
				'total'        => $count( "SELECT COUNT(*) FROM {$applications}" ),
				'by_status'    => $applications_by_status,
			),
			'accounts'     => array(
				'active'    => $count( "SELECT COUNT(*) FROM {$accounts} WHERE status = 'ACTIVE'" ),
				'suspended' => $count( "SELECT COUNT(*) FROM {$accounts} WHERE status = 'SUSPENDED'" ),
				'total'     => $count( "SELECT COUNT(*) FROM {$accounts}" ),
			),
			'quotes'       => array(
				'open'           => $count( "SELECT COUNT(*) FROM {$quotes} WHERE status IN ('SUBMITTED','UNDER_REVIEW','QUOTED')" ),
				'draft'          => isset( $quotes_by_status['DRAFT'] ) ? $quotes_by_status['DRAFT'] : 0,
				'accepted'       => isset( $quotes_by_status['ACCEPTED'] ) ? $quotes_by_status['ACCEPTED'] : 0,
				'expired'        => isset( $quotes_by_status['EXPIRED'] ) ? $quotes_by_status['EXPIRED'] : 0,
				'converted'      => isset( $quotes_by_status['CONVERTED_TO_ORDER'] ) ? $quotes_by_status['CONVERTED_TO_ORDER'] : 0,
				'total'          => $count( "SELECT COUNT(*) FROM {$quotes}" ),
				'by_status'      => $quotes_by_status,
				'quoted_value'   => round( $quoted_value, 2 ),
				'accepted_value' => round( $accepted_value, 2 ),
			),
			'orders'       => array(
				'total'        => $count( "SELECT COUNT(*) FROM {$orders}" ),
				'by_status'    => $orders_by_status,
				'booked_value' => round( (float) $wpdb->get_var( "SELECT COALESCE(SUM(sell_total), 0) FROM {$orders}" ), 2 ), // phpcs:ignore WordPress.DB
			),
			'destinations' => array_map(
				function ( $row ) {
					return array( 'country' => $row['country'], 'orders' => (int) $row['n'] );
				},
				(array) $destinations
			),
			'container_utilisation' => array(),
			'audit'                 => array(
				'recent' => array_map(
					function ( $row ) {
						return hk_wholesale_decode_row( 'audit', $row );
					},
					(array) $wpdb->get_results( 'SELECT * FROM ' . hk_wholesale_table( 'audit' ) . ' ORDER BY id DESC LIMIT 25', ARRAY_A ) // phpcs:ignore WordPress.DB
				),
			),
		)
	);
}

/** The settings a wholesale screen needs, and nothing secret. */
function hk_wholesale_settings( $request ) {
	// Reported so an operator can see, without a database client, whether the installed
	// schema is the one this code expects — the question that a "could not be stored"
	// error otherwise leaves to guesswork.
	$problems = get_option( HK_WHOLESALE_SCHEMA_OPTION );

	return rest_ensure_response(
		array(
			'version'           => HK_WHOLESALE_VERSION,
			'db_version'        => HK_WHOLESALE_DB_VERSION,
			'installed_db_version' => (string) get_option( HK_WHOLESALE_DB_OPTION ),
			'missing_tables'    => is_array( $problems ) && isset( $problems['missing'] ) ? array_values( $problems['missing'] ) : array(),
			'missing_columns'   => is_array( $problems ) && isset( $problems['columns'] ) ? (array) $problems['columns'] : array(),
			'schema_checked_at' => is_array( $problems ) && isset( $problems['at'] ) ? (string) $problems['at'] : null,
			'schema_error'      => is_array( $problems ) && isset( $problems['error'] ) ? (string) $problems['error'] : '',
			'incoterms'         => array( 'EXW', 'FOB', 'CFR', 'CIF' ),
			'application_statuses' => hk_wholesale_application_statuses(),
			'quote_statuses'    => array( 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED_TO_ORDER' ),
			'order_statuses'    => array( 'DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED' ),
			'charge_keys'       => array_keys( hk_wholesale_charge_keys() ),
		)
	);
}

/**
 * The origin charge labels the cost engine understands.
 *
 * One list, shared by the plugin (which stores a profile's numbers by key) and the
 * app (which turns them into named lines). A charge that is not here is not
 * silently dropped — it is not offered, which is the honest way round.
 */
function hk_wholesale_charge_keys() {
	return array(
		'inlandTransport'  => 'Inland transport to port',
		'stuffing'         => 'Stuffing / loading',
		'documentation'    => 'Documentation',
		'originTerminal'   => 'Origin terminal / port',
		'originCustoms'    => 'Export customs handling',
		'inspection'       => 'Inspection',
		'forwarding'       => 'Forwarding',
		'packaging'        => 'Packaging surcharge',
	);
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

add_action(
	'rest_api_init',
	function () {
		$manage = 'hk_wholesale_can_manage';

		register_rest_route(
			'hk-wholesale/v1',
			'/records',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => 'hk_wholesale_list_records',
					'permission_callback' => $manage,
					'args'                => array( 'resource' => array( 'required' => true ) ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => 'hk_wholesale_upsert_record',
					'permission_callback' => $manage,
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => 'hk_wholesale_delete_record',
					'permission_callback' => $manage,
				),
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/records/one',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_wholesale_get_record',
				'permission_callback' => $manage,
				'args'                => array(
					'resource' => array( 'required' => true ),
					'id'       => array( 'required' => true ),
				),
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/apply',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_wholesale_submit_application',
				'permission_callback' => $manage,
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/decide',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'hk_wholesale_decide_application',
				'permission_callback' => $manage,
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/access',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_wholesale_access',
				'permission_callback' => $manage,
				'args'                => array( 'email' => array( 'required' => true ) ),
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/catalog',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_wholesale_catalog',
				'permission_callback' => $manage,
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/overview',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_wholesale_overview',
				'permission_callback' => $manage,
			)
		);

		register_rest_route(
			'hk-wholesale/v1',
			'/settings',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => 'hk_wholesale_settings',
				'permission_callback' => $manage,
			)
		);
	}
);

// Activation creates/updates the tables; an upgrade on the next load does the same
// when the code is newer than the installed schema.
register_activation_hook( __FILE__, 'hk_wholesale_install' );
add_action( 'plugins_loaded', 'hk_wholesale_maybe_upgrade' );
