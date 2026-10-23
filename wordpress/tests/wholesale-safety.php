<?php
// Isolated plugin behavior test: no WordPress installation, network or live database.
define( 'ABSPATH', __DIR__ . '/' );
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function is_email( $email ) { return filter_var( $email, FILTER_VALIDATE_EMAIL ); }
function is_wp_error( $value ) { return $value instanceof WP_Error; }
class WP_Error {
    public $code; public $message; public $data;
    function __construct( $code, $message, $data = array() ) { $this->code = $code; $this->message = $message; $this->data = $data; }
}
class SafetyDB {
    public $prefix = 'isolated_'; public $vars = array(); public $row = array();
    function prepare( $sql, ...$args ) { return $sql; }
    function get_var( $sql ) { return array_shift( $this->vars ); }
    function get_row( $sql, $mode ) { return $this->row; }
    function insert( ...$args ) { throw new Exception( 'Unexpected database write.' ); }
    function update( ...$args ) { throw new Exception( 'Unexpected database write.' ); }
}
define( 'ARRAY_A', 'ARRAY_A' );
class SafetyRequest {
    public $body;
    function __construct( $body ) { $this->body = $body; }
    function get_json_params() { return $this->body; }
}
$wpdb = new SafetyDB();
require dirname( __DIR__ ) . '/hk-wholesale.php';
function check( $condition, $message ) { if ( ! $condition ) throw new Exception( $message ); }
$wpdb->row = array( 'id' => 42, 'email_verified_at' => '', 'declaration_name' => 'Internal Owner' );
$result = hk_wholesale_decide_application( new SafetyRequest( array( 'application_id' => 42, 'decision' => 'APPROVED' ) ) );
check( is_wp_error( $result ) && 409 === $result->data['status'], 'Unverified application was approved.' );
$wpdb->row['email_verified_at'] = '2026-01-01';
$wpdb->row['resale_expires'] = '2020-01-01';
$result = hk_wholesale_decide_application( new SafetyRequest( array( 'application_id' => 42, 'decision' => 'APPROVED' ) ) );
check( is_wp_error( $result ) && 'hk_wholesale_expired_certificate' === $result->code, 'Expired certificate was approved.' );
$wpdb->vars = array( null, 42 );
$result = hk_wholesale_submit_application( new SafetyRequest( array( 'email' => 'internal@example.invalid', 'company' => 'Internal', 'contact_name' => 'Owner', 'country' => 'United States', 'business_type' => 'reseller' ) ) );
check( is_wp_error( $result ) && 409 === $result->data['status'], 'Public resubmission overwrote a private application.' );
echo "Wholesale approval, expiry and duplicate-application boundaries passed without database writes.\n";
