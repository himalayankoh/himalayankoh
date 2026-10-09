<?php
/** Run with: php wordpress/tests/backend-rest-url.php (no live WordPress writes). */
define( 'ABSPATH', __DIR__ . '/' );
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function untrailingslashit( $value ) { return rtrim( $value, '/' ); }
function wp_parse_url( $value ) { return parse_url( $value ); }
function get_home_url( $blog_id, $path, $scheme ) { return $GLOBALS['test_home']; }
function get_site_url( $blog_id, $path, $scheme ) { return $GLOBALS['test_site']; }
require dirname( __DIR__ ) . '/himalayan-koh-storefront.php';

$cases = array(
	array( 'https://store.example', 'https://wp.store.example', 'https://store.example/wp-json/wp/v2/users/1/application-passwords', 'https://wp.store.example/wp-json/wp/v2/users/1/application-passwords' ),
	array( 'https://store.example', 'https://wp.store.example', 'https://store.example/index.php?rest_route=/wp/v2/users', 'https://wp.store.example/index.php?rest_route=/wp/v2/users' ),
	array( 'https://store.example/shop/', 'https://wp.store.example/cms/', 'https://store.example/shop/wp-json/?context=edit', 'https://wp.store.example/cms/wp-json/?context=edit' ),
	array( 'https://staging.example', 'https://staging.example/wp', 'https://staging.example/wp-json/', 'https://staging.example/wp-json/' ),
	array( 'http://localhost:3000', 'http://localhost:8080', 'http://localhost:3000/wp-json/', 'http://localhost:8080/wp-json/' ),
	array( 'https://store.example', 'https://wp.store.example', 'https://external.example/wp-json/', 'https://external.example/wp-json/' ),
	array( 'https://store.example', 'https://wp.store.example', 'https://store.example.evil/wp-json/', 'https://store.example.evil/wp-json/' ),
	array( '/relative', 'https://wp.store.example', '/relative/wp-json/', '/relative/wp-json/' ),
);
foreach ( $cases as $index => $case ) {
	$GLOBALS['test_home'] = $case[0];
	$GLOBALS['test_site'] = $case[1];
	$actual = hk_storefront_backend_rest_url( $case[2], '', null, 'rest' );
	if ( $actual !== $case[3] ) {
		fwrite( STDERR, 'REST URL case ' . $index . ' failed: ' . $actual . PHP_EOL );
		exit( 1 );
	}
}
echo count( $cases ) . ' REST URL cases passed.' . PHP_EOL;
