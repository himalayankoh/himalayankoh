<?php
/**
 * Plugin Name: Himalayan Koh — Woo Store API Compatibility
 * Description: Stops the FarmAgrico theme's add-to-cart-text callback (which dereferences a global product the Store API never populates) from fataling every WooCommerce Store API product response. Scoped to those requests only; removable once the theme is fixed.
 * Version: 1.0.1
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Himalayan Koh
 *
 * WHY THIS EXISTS
 * ---------------
 * Every non-empty `GET /wp-json/wc/store/v1/products` request on staging answered
 * HTTP 500. The staging PHP error log names the cause precisely: the active
 * FarmAgrico theme's `farmagrico_woocommerce_add_to_cart_text()` (its
 * `inc/woocommerce.php`, line 842) reads the global `$product` and calls
 * `$product->get_type()`. WordPress's `wp_loaded` phase and WooCommerce's Store
 * API serialiser call that same filter while building a product response, and in
 * that context the global is null — so the callback fatals, WooCommerce returns
 * its "critical error" page, and the public product routes become unusable.
 *
 * Empty result sets never reach the per-product builder, which is why
 * `include=99999999` answered `200 []` while every query that matched a product
 * failed. (1.0.1 tightens the route match to include query strings — without it,
 * `products?per_page=1` and `products?include=<id>` kept fataling.)
 *
 * WHY REMOVING THE CALLBACK IS SAFE — AND WHY IT IS SCOPED
 * -------------------------------------------------------
 * The callback's whole purpose is to customise the *HTML* add-to-cart button
 * text a visitor sees on theme-rendered pages. A Store API request returns JSON;
 * no button is rendered and no visitor ever sees that filter's output there. So
 * on Store API product requests the theme's contribution is meaningless, and
 * removing it restores WooCommerce's built-in text for a response shape the theme
 * never sees. Ordinary theme pages are untouched: the removal only runs when the
 * request path is a Store API products route.
 *
 * This is a compatibility shim, not the permanent fix. The permanent fix is in
 * the theme: use the product argument the filter hands over instead of the global,
 * or guard the global before calling it. When that lands on the site, delete this
 * plugin — nothing else depends on it.
 *
 * HOW TO REMOVE
 * -------------
 * Plugins → deactivate, then delete. Site behaviour reverts immediately.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * True when the current request is a WooCommerce Store API products route.
 *
 * Both URL shapes are recognised: pretty permalinks (`/wp-json/wc/store/v1/...`)
 * and the query-string form (`?rest_route=/wc/store/v1/...`), because a site can
 * move between them with one permalink setting and this file must not silently
 * stop working when it does.
 *
 * Deliberately narrow: `/products/categories`, `/products/attributes` and
 * `/products/tags` are different routes and are left alone, as is every non-Store
 * request.
 */
function hk_store_api_compat_is_product_request() {
	$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
	$rest_route  = isset( $_GET['rest_route'] ) ? (string) wp_unslash( $_GET['rest_route'] ) : '';

	return (bool) (
		preg_match( '#/wp-json/wc/store/v1/products(?:/|\?|$)#', $request_uri )
		|| preg_match( '#^/?wc/store/v1/products(?:/|\?|$)#', $rest_route )
	);
}

/**
 * Detaches the theme callback for the duration of a Store API product request.
 *
 * Runs on `wp_loaded`, which is after the theme registered its filters
 * (`after_setup_theme` / `init`) and before the REST request is dispatched — and
 * it removes the callback at every priority it was attached with, so it does not
 * depend on the theme's choice of priority.
 */
function hk_store_api_compat_detach_farmagrico_callback() {
	if ( ! hk_store_api_compat_is_product_request() ) {
		return;
	}

	$callback = 'farmagrico_woocommerce_add_to_cart_text';
	$hooks    = array(
		'woocommerce_product_add_to_cart_text',
		'woocommerce_product_single_add_to_cart_text',
	);

	global $wp_filter;

	foreach ( $hooks as $hook_name ) {
		if ( false === has_filter( $hook_name, $callback ) ) {
			continue;
		}
		if ( empty( $wp_filter[ $hook_name ] ) || ! $wp_filter[ $hook_name ] instanceof WP_Hook ) {
			continue;
		}
		foreach ( array_keys( $wp_filter[ $hook_name ]->callbacks ) as $priority ) {
			remove_filter( $hook_name, $callback, $priority );
		}
	}
}
add_action( 'wp_loaded', 'hk_store_api_compat_detach_farmagrico_callback', PHP_INT_MAX );
