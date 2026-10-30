<?php
// Run with PHP 7.4+; load the actual plugin while leaving WordPress hooks inactive.
define( 'ABSPATH', __DIR__ . '/' );
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
require dirname( __DIR__ ) . '/hk-wholesale.php';

$cases = array(
	'KEY status (status)' => 'KEY `status` (`status`)',
	'KEY lane (origin_port, destination_port, container_type)' => 'KEY `lane` (`origin_port`, `destination_port`, `container_type`)',
	'KEY side_port (side, port)' => 'KEY `side_port` (`side`, `port`)',
	'KEY entity (entity, entity_id)' => 'KEY `entity` (`entity`, `entity_id`)',
);
foreach ( $cases as $input => $expected ) {
	if ( hk_wholesale_quote_schema_key( $input ) !== $expected ) {
		fwrite( STDERR, "Invalid index SQL for {$input}\n" );
		exit( 1 );
	}
}
// Every actual schema index must name declared columns individually.
foreach ( hk_wholesale_schema() as $resource => $spec ) {
	foreach ( $spec['keys'] as $key ) {
		$sql = hk_wholesale_quote_schema_key( $key );
		preg_match( '/\((.+)\)/', $sql, $matches );
		foreach ( explode( ',', $matches[1] ) as $column ) {
			$name = trim( trim( $column ), '`' );
			if ( ! isset( $spec['columns'][ $name ] ) ) {
				fwrite( STDERR, "Index references an unknown column in {$resource}\n" );
				exit( 1 );
			}
		}
	}
}
echo "Wholesale schema indexes passed.\n";
