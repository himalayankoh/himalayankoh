<?php
/** Pure policy/identity tests, no WordPress/database/customer access. PHP 7.4+. */
define( 'ABSPATH', __DIR__ );
function add_action( $name, $callback ) {}
function sanitize_text_field( $value ) { return strip_tags( (string) $value ); }
function esc_url_raw( $value ) { return filter_var( $value, FILTER_VALIDATE_URL ) ? $value : ''; }
function wp_parse_url( $value, $component = -1 ) { return parse_url( $value, $component ); }
require __DIR__ . '/../wordpress/himalayan-koh-leados-intelligence.php';
$checks = 0;
function check( $label, $condition ) {
 global $checks;
 if ( ! $condition ) { fwrite( STDERR, "FAIL $label\n" ); exit( 1 ); }
 $checks++; echo "PASS $label\n";
}
$robots = "User-agent: *\nDisallow: /\nAllow: /contact\nDisallow: /contact/private\n";
check( 'robots disallows root', ! hk_leados2_robots_allowed( $robots, '/' ) );
check( 'robots longest allow', hk_leados2_robots_allowed( $robots, '/contact' ) );
check( 'robots longer disallow', ! hk_leados2_robots_allowed( $robots, '/contact/private/team' ) );
check( 'robots wildcard and end anchor', ! hk_leados2_robots_allowed( "User-agent: *\nDisallow: /*.pdf$", '/salt.pdf' ) );
check( 'robots explicit bot overrides wildcard', hk_leados2_robots_allowed( "User-agent: *\nDisallow: /\nUser-agent: HimalayanKohResearchBot\nAllow: /", '/' ) );
check( 'robots empty specific group overrides wildcard', hk_leados2_robots_allowed( "User-agent: *\nDisallow: /\nUser-agent: HimalayanKohResearchBot\nDisallow:", '/' ) );
$lead = array( 'business_name' => 'Texas Feed', 'website' => 'https://www.feed.example.org/', 'address' => '1 Main', 'city' => 'Houston', 'region' => 'TX' );
$same = $lead; $same['website'] = 'https://feed.example.org/contact';
$branch = $lead; $branch['address'] = '2 Main';
check( 'same company URL canonical identity', hk_leados2_identity( $lead ) === hk_leados2_identity( $same ) );
check( 'different branch is distinct', hk_leados2_identity( $lead ) !== hk_leados2_identity( $branch ) );
$source = array( 'url' => 'https://feed.example.org/contact', 'kind' => 'company_page', 'status' => 'verified', 'retrievedAt' => '2026-10-12', 'excerpt' => '<script>unsafe</script> feed products' );
$clean = hk_leados2_clean_research( array( 'assignedOwner' => '<b>Owner</b>', 'sources' => array( $source, $source ), 'nextFollowUp' => '2026-10-20' ) );
check( 'source dedup retains provenance', count( $clean['sources'] ) === 1 && 'verified' === $clean['sources'][0]['status'] );
check( 'metadata preserves named object fields', isset( $clean['assignedOwner'] ) && 'Owner' === $clean['assignedOwner'] );
check( 'all pipeline statuses supported', in_array( 'do_not_contact', hk_leados2_pipeline(), true ) && in_array( 'quote_requested', hk_leados2_pipeline(), true ) );
echo "$checks policy checks passed.\n";
