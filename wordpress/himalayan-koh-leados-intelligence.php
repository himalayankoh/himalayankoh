<?php
/** LeadOS 2 additive intelligence and workflow support. No commerce table writes. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function hk_leados2_pipeline() {
 return array( 'new', 'researched', 'qualified', 'approved_for_outreach', 'contacted', 'replied', 'interested', 'quote_requested', 'negotiating', 'won', 'lost', 'do_not_contact', 'reviewed', 'shortlisted', 'disqualified', 'not_relevant' );
}
function hk_leados2_norm( $value ) { return trim( preg_replace( '/[^a-z0-9]+/', ' ', strtolower( (string) $value ) ) ); }
function hk_leados2_identity( $lead ) {
 $domain = preg_replace( '/^www\./', '', strtolower( wp_parse_url( $lead['website'] ?? '', PHP_URL_HOST ) ?: '' ) );
 $location = implode( '|', array_map( 'hk_leados2_norm', array( $lead['address'] ?? '', $lead['city'] ?? '', $lead['region'] ?? '' ) ) );
 $key = $domain ? 'company|' . $domain . '|' . hk_leados2_norm( $lead['business_name'] ?? '' ) . '|' . $location : ( ! empty( $lead['osm_type'] ) && ! empty( $lead['osm_id'] ) ? 'osm|' . $lead['osm_type'] . '|' . $lead['osm_id'] : 'name|' . hk_leados2_norm( $lead['business_name'] ?? '' ) . '|' . $location );
 return hash( 'sha256', $key );
}
function hk_leados2_merge_sources( $old, $new ) {
 $result = array(); $seen = array();
 foreach ( array_merge( (array) $old, (array) $new ) as $source ) {
  if ( ! is_array( $source ) || empty( $source['url'] ) ) { continue; }
  $key = ( $source['kind'] ?? '' ) . '|' . $source['url'] . '|' . ( $source['retrievedAt'] ?? '' );
  if ( isset( $seen[$key] ) ) { continue; }
  $seen[$key] = true;
  $result[] = array( 'url' => esc_url_raw( $source['url'] ), 'kind' => sanitize_text_field( $source['kind'] ?? 'company_page' ), 'status' => in_array( $source['status'] ?? '', array( 'verified', 'inferred', 'not_found' ), true ) ? $source['status'] : 'inferred', 'retrievedAt' => sanitize_text_field( $source['retrievedAt'] ?? '' ), 'excerpt' => substr( sanitize_text_field( $source['excerpt'] ?? '' ), 0, 800 ) );
 }
 return array_slice( $result, -40 );
}
function hk_leados2_clean_research( $research ) {
 if ( ! is_array( $research ) ) { return array(); }
 $result = array( 'sources' => hk_leados2_merge_sources( array(), $research['sources'] ?? array() ) );
 foreach ( array( 'publicCompanyName', 'lastVerifiedAt', 'productInterest', 'assignedOwner', 'nextFollowUp', 'requestedQuantity', 'packagingPreference', 'buyerQuestions', 'facebook', 'instagram' ) as $key ) {
  if ( isset( $research[$key] ) ) { $result[$key] = substr( sanitize_text_field( $research[$key] ), 0, 2000 ); }
 }
 if ( isset( $research['contactPage'] ) ) { $result['contactPage'] = esc_url_raw( $research['contactPage'] ); }
 $result['quoteRequired'] = ! empty( $research['quoteRequired'] );
 if ( isset( $research['qualification'] ) && is_array( $research['qualification'] ) ) { $result['qualification'] = $research['qualification']; }
 $result['errors'] = array_map( 'sanitize_text_field', array_slice( (array) ( $research['errors'] ?? array() ), 0, 10 ) );
 return $result;
}
function hk_leados2_error( $message, $status = 409 ) { return new WP_Error( 'hk_leados2_rejected', $message, array( 'status' => $status ) ); }

/** Serialized shared provider pacing. Public geocoding/search requests stay bounded. */
function hk_leados2_gate( WP_REST_Request $request ) {
 global $wpdb;
 $lock = 'hklo2_search_gate';
 if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 2)', $lock ) ) ) { return hk_leados2_error( 'Search is busy.', 429 ); }
 try {
  $last = (int) get_option( 'hk_leados2_last_search', 0 );
  if ( time() - $last < 15 ) { return hk_leados2_error( 'Wait 15 seconds between searches.', 429 ); }
  update_option( 'hk_leados2_last_search', time(), false );
  return array( 'ok' => true );
 } finally { $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) ); }
}

/** Public HTTP research: WordPress validates DNS; every redirect is refused. */
function hk_leados2_get( $url ) {
 if ( ! wp_http_validate_url( $url ) ) { return hk_leados2_error( 'Unsafe public URL.', 400 ); }
 return wp_safe_remote_get( $url, array( 'timeout' => 8, 'redirection' => 0, 'limit_response_size' => 350000, 'user-agent' => 'HimalayanKohResearchBot/2.0 (+https://himalayankoh.com/contact)', 'headers' => array( 'Accept' => 'text/html,text/plain;q=0.9' ), 'cookies' => array() ) );
}
/** Longest matching rule wins. Specific bot groups override wildcard groups. */
function hk_leados2_robots_allowed( $robots, $path ) {
 $groups = array(); $agents = array(); $rules = array();
 foreach ( preg_split( '/\r?\n/', $robots ) as $line ) {
  $line = trim( explode( '#', $line, 2 )[0] );
  if ( ! preg_match( '/^(user-agent|allow|disallow)\s*:\s*(.*)$/i', $line, $m ) ) { continue; }
  $name = strtolower( $m[1] ); $value = trim( $m[2] );
  if ( 'user-agent' === $name ) {
   if ( $rules ) { $groups[] = array( $agents, $rules ); $agents = array(); $rules = array(); }
   $agents[] = strtolower( $value );
  } elseif ( $agents && '' !== $value ) { $rules[] = array( $name, $value ); }
 }
 if ( $agents ) { $groups[] = array( $agents, $rules ); }
 $specific = array(); $wild = array(); $has_specific = false;
 foreach ( $groups as $group ) {
  if ( in_array( 'himalayankohresearchbot', $group[0], true ) || in_array( 'himalayankohresearchbot/2.0', $group[0], true ) ) { $has_specific = true; $specific = array_merge( $specific, $group[1] ); }
  elseif ( in_array( '*', $group[0], true ) ) { $wild = array_merge( $wild, $group[1] ); }
 }
 $selected = $has_specific ? $specific : $wild; $length = -1; $allowed = true;
 foreach ( $selected as $rule ) {
  $pattern = preg_quote( $rule[1], '~' ); $pattern = str_replace( '\*', '.*', $pattern );
  $pattern = str_replace( '\$', '$', $pattern );
  if ( preg_match( '~^' . $pattern . '~', $path ) && ( strlen( $rule[1] ) > $length || ( strlen( $rule[1] ) === $length && 'allow' === $rule[0] ) ) ) {
   $length = strlen( $rule[1] ); $allowed = 'allow' === $rule[0];
  }
 }
 return $allowed;
}

function hk_leados2_research_website( WP_REST_Request $request ) {
 $body = $request->get_json_params() ?: array(); $url = esc_url_raw( $body['website'] ?? '' );
 $parts = wp_parse_url( $url );
 if ( ! $parts || ! wp_http_validate_url( $url ) || ! in_array( $parts['scheme'] ?? '', array( 'http', 'https' ), true ) || isset( $parts['user'] ) || isset( $parts['pass'] ) || ( isset( $parts['port'] ) && ! in_array( $parts['port'], array( 80,443 ), true ) ) ) { return hk_leados2_error( 'Public company URL required.', 400 ); }
 $origin = $parts['scheme'] . '://' . $parts['host'];
 $cache_key = 'hklo2_site_v2_' . hash( 'sha256', $origin ); $cached = get_transient( $cache_key );
 if ( $cached ) { return $cached; }
 $gate_key = 'hklo2_site_gate_' . hash( 'sha256', $origin );
 if ( get_transient( $gate_key ) ) { return hk_leados2_error( 'Site research is already running. Retry later.', 429 ); }
 set_transient( $gate_key, 1, 60 );
 $robots_res = hk_leados2_get( $origin . '/robots.txt' );
 if ( is_wp_error( $robots_res ) ) { return hk_leados2_error( 'Robots check failed; no company pages fetched.', 502 ); }
 $code = wp_remote_retrieve_response_code( $robots_res );
 if ( 200 !== $code && 404 !== $code ) { return hk_leados2_error( 'Robots unavailable or redirected; research stopped.', 403 ); }
 $robots = 200 === $code ? wp_remote_retrieve_body( $robots_res ) : '';
 if ( preg_match( '/crawl-delay\s*:/i', $robots ) ) { return hk_leados2_error( 'Site crawl-delay requires a scheduled external crawler.', 403 ); }
 $queue = array( $origin . '/' ); $sources = array(); $errors = array(); $email = null; $phone = null; $contact = null; $seen = array(); $facts = array();
 while ( $queue && count( $seen ) < 4 ) {
  $page = array_shift( $queue ); if ( isset( $seen[$page] ) ) { continue; } $seen[$page] = true;
  if ( ! hk_leados2_robots_allowed( $robots, wp_parse_url( $page, PHP_URL_PATH ) ?: '/' ) ) { $errors[] = 'Robots excludes ' . $page; continue; }
  usleep( 1100000 );
  $res = hk_leados2_get( $page );
  if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) ) { $errors[] = 'Page unavailable or redirected: ' . $page; continue; }
  if ( ! preg_match( '/text\/html/i', wp_remote_retrieve_header( $res, 'content-type' ) ) ) { $errors[] = 'Non-HTML page: ' . $page; continue; }
  $html = wp_remote_retrieve_body( $res );
  $text = html_entity_decode( wp_strip_all_tags( preg_replace( '~<(script|style|noscript)\b[^>]*>.*?</\1>~is', ' ', $html ) ), ENT_QUOTES, 'UTF-8' );
  $text = preg_replace( '/\s+/', ' ', $text );
  if ( preg_match( '/captcha|access denied|automated access (?:is )?prohibited/i', substr( $text, 0, 1000 ) ) ) { $errors[] = 'Access restriction: ' . $page; continue; }
  if ( strlen( $text ) < 120 || preg_match('/enable javascript|javascript is required/i', substr($text,0,400)) ) { $errors[] = 'Meaningful company content requires a rendered browser: ' . $page; continue; }
  if ( preg_match_all('~<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>~is',$html,$schemas) ) {
   foreach ( array_slice($schemas[1],0,10) as $schema ) {
    $structured = json_decode($schema,true); if (!is_array($structured)) { continue; }
    $nodes = isset($structured['@graph']) ? $structured['@graph'] : (isset($structured[0]) ? $structured : array($structured));
    foreach (array_slice($nodes,0,20) as $company) {
     if (!is_array($company)) { continue; }
     $types = (array)($company['@type'] ?? array()); $declared_url = $company['url'] ?? '';
     if (!is_string($declared_url) || !array_intersect($types,array('Organization','LocalBusiness','Store','WholesaleStore','PetStore')) || wp_parse_url($declared_url,PHP_URL_HOST) !== $parts['host']) { continue; }
     if (!empty($company['name'])) { $facts['publicCompanyName'] = sanitize_text_field(html_entity_decode($company['name'],ENT_QUOTES,'UTF-8')); }
     $address = $company['address'] ?? array();
     if (is_array($address) && !isset($address[0])) {
      foreach (array('streetAddress'=>'address','addressLocality'=>'city','addressRegion'=>'region','addressCountry'=>'country') as $source_key=>$dest_key) {
       if (isset($address[$source_key]) && is_string($address[$source_key])) { $facts[$dest_key] = sanitize_text_field($address[$source_key]); }
      }
     }
    }
   }
  }
  $excerpt = substr( $text, 0, 350 );
  if ( preg_match( '/.{0,80}(?:wholesale|distribut|private[ -]label|livestock|horse|feed|spice|salt).{0,200}/i', $text, $signal ) ) { $excerpt .= ' ' . $signal[0]; }
  $sources[] = array( 'url' => $page, 'retrievedAt' => gmdate( 'c' ), 'kind' => 'company_page', 'status' => 'verified', 'excerpt' => $excerpt );
  $email_text = $text;
  if ( preg_match_all( '~href=["\']mailto:([^"\'?]+)~i', $html, $mailtos ) ) { $email_text .= ' ' . implode( ' ', array_map( 'rawurldecode', $mailtos[1] ) ); }
  if ( preg_match_all( '/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i', $email_text, $emails ) ) {
   foreach ( $emails[0] as $candidate ) {
    $candidate = strtolower( $candidate ); $local = explode( '@', $candidate )[0];
    $mail_domain = explode( '@', $candidate )[1]; $site_domain = preg_replace( '/^www\./', '', $parts['host'] );
    if ( preg_match( '/^(info|sales|contact|hello|office|orders|wholesale|customerservice|service|support|enquiries|inquiries)$/', $local ) && ( $mail_domain === $site_domain || substr( $site_domain, -strlen( '.' . $mail_domain ) ) === '.' . $mail_domain ) ) { $email = $candidate; $sources[count($sources)-1]['excerpt'] .= ' Public business email: ' . $candidate; break; }
   }
  }
  if ( preg_match( '~href=["\']tel:([^"\']+)~i', $html, $telephone ) ) { $phone = sanitize_text_field( rawurldecode( $telephone[1] ) ); }
  if ( preg_match_all( '~href=["\']([^"\'#]+)["\']~i', $html, $links ) ) {
   foreach ( $links[1] as $href ) {
    $href = html_entity_decode( $href, ENT_QUOTES, 'UTF-8' );
    if ( ! preg_match( '/contact|about|wholesale|distribut|private[-_]?label|products/i', $href ) || preg_match( '/login|account|checkout|cart|wp-admin|\?|\.pdf/i', $href ) ) { continue; }
    if ( 0 === strpos( $href, '/' ) && 0 !== strpos( $href, '//' ) ) { $href = $origin . $href; }
    elseif ( ! preg_match( '~^https?://~', $href ) ) { $href = $origin . '/' . ltrim( $href, '/' ); }
    if ( wp_parse_url( $href, PHP_URL_HOST ) !== $parts['host'] ) { continue; }
    if ( preg_match( '/contact/i', $href ) ) { $contact = $href; array_unshift( $queue, $href ); } else { $queue[] = $href; }
    $queue = array_slice( array_unique( $queue ), 0, 10 );
   }
  }
 }
 $result = array( 'research' => array( 'sources' => $sources, 'contactPage' => $contact, 'lastVerifiedAt' => $sources ? gmdate( 'c' ) : null, 'errors' => $errors ) );
 if (isset($facts['publicCompanyName'])) { $result['research']['publicCompanyName'] = $facts['publicCompanyName']; unset($facts['publicCompanyName']); }
 foreach ($facts as $key=>$value) { $result[$key] = $value; }
 if ( $email ) { $result['email'] = $email; $result['emailSource'] = 'company_website'; }
 if ( $phone ) { $result['phone'] = $phone; }
 set_transient( $cache_key, $result, 6 * HOUR_IN_SECONDS );
 return $result;
}

function hk_leados2_workflow_row( $row ) {
 if ( ! $row ) { return null; } $row['payload'] = json_decode( $row['payload'], true ) ?: array(); $row['revision'] = (int) $row['revision']; return $row;
}
function hk_leados2_suppressed( $email ) { return (bool) get_option( 'hklo2_suppress_' . hash( 'sha256', strtolower( trim( $email ) ) ), false ); }

function hk_leados2_workflow( WP_REST_Request $request ) {
 global $wpdb; $table = $wpdb->prefix . 'leados_workflows'; $leads_table = $wpdb->prefix . 'leados_leads';
 if ( 'GET' === $request->get_method() ) {
  $kind = $request->get_param( 'kind' ) ?: 'draft';
  if ( 'discovery' === $kind && $request->get_param( 'id' ) ) {
   return array( 'item' => hk_leados2_workflow_row( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %s AND workspace_id = %s AND kind = 'discovery'", $request->get_param('id'), HK_LEADOS_WORKSPACE_ID ), ARRAY_A ) ) );
  }
  if ( 'activity' === $kind ) { return array( 'items' => $wpdb->get_results( "SELECT action, details, created_at FROM {$wpdb->prefix}leados_audit_logs ORDER BY created_at DESC LIMIT 100", ARRAY_A ) ); }
  if ( ! in_array( $kind, array( 'draft', 'saved_search' ), true ) ) { return hk_leados2_error( 'Invalid kind.', 400 ); }
  $rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $table WHERE workspace_id = %s AND kind = %s ORDER BY updated_at DESC LIMIT 100", HK_LEADOS_WORKSPACE_ID, $kind ), ARRAY_A );
  return array( 'items' => array_map( 'hk_leados2_workflow_row', $rows ?: array() ), 'researchWorkerLastSeen' => get_option( 'hk_leados2_research_heartbeat', null ) );
 }
 $body = $request->get_json_params() ?: array(); $action = $body['action'] ?? ''; $id = sanitize_text_field( $body['id'] ?? '' );
 $lock = 'hklo2_workflow';
 if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 3)', $lock ) ) ) { return hk_leados2_error( 'Workflow busy.' ); }
 try {
  $row = $id ? hk_leados2_workflow_row( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %s AND workspace_id = %s", $id, HK_LEADOS_WORKSPACE_ID ), ARRAY_A ) ) : null;
  $lead_id = $row['lead_id'] ?? sanitize_text_field( $body['leadId'] ?? '' );
  $lead = $lead_id ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $leads_table WHERE id = %s AND workspace_id = %s", $lead_id, HK_LEADOS_WORKSPACE_ID ), ARRAY_A ) : null;
  if ( 'queue_discovery' === $action ) {
   $input = $body['input'] ?? array();
   if ( ! is_array( $input ) ) { return hk_leados2_error( 'Search input required.', 400 ); }
   $clean = array();
   foreach ( array( 'category', 'location', 'keyword', 'productInterest', 'country' ) as $key ) { $clean[$key] = substr( sanitize_text_field( $input[$key] ?? '' ), 0, 160 ); }
   foreach ( array( 'requireWebsite', 'requirePhone', 'requireEmail', 'excludeSaved', 'excludeContacted', 'wholesaleOnly', 'privateLabelOnly' ) as $key ) { $clean[$key] = ! empty( $input[$key] ); }
   $clean['maxResults'] = min( 40, max( 1, (int) ( $input['maxResults'] ?? 15 ) ) );
   $clean['searchDepth'] = min( 2, max( 1, (int) ( $input['searchDepth'] ?? 1 ) ) );
   $clean['radiusKm'] = min( 50, max( 1, (int) ( $input['radiusKm'] ?? 25 ) ) );
   $query = substr(sanitize_text_field($body['query'] ?? ''),0,500);
   if (!$query) { $query = $clean['category'] . ' ' . $clean['location'] . ' ' . $clean['keyword'] . ( $clean['privateLabelOnly'] ? ' private label' : '' ) . ( $clean['wholesaleOnly'] ? ' wholesale distributor' : '' ); }
   $payload = array( 'input' => $clean, 'query' => $query, 'retrievedAt' => gmdate('c'), 'attempts' => 0 );
   $fingerprint = hash( 'sha256', wp_json_encode( array($clean,$query) ) );
   $cached = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE kind = 'discovery' AND workspace_id = %s AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.fingerprint')) = %s AND created_at >= %s AND state IN ('pending','processing','complete') ORDER BY created_at DESC LIMIT 1", HK_LEADOS_WORKSPACE_ID, $fingerprint, gmdate('Y-m-d H:i:s', time()-600) ), ARRAY_A );
   if ( $cached ) { return array( 'item' => hk_leados2_workflow_row( $cached ), 'cached' => true ); }
   if ( (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table WHERE kind = 'discovery' AND state IN ('pending','processing')" ) >= 20 ) { return hk_leados2_error( 'Research queue full.', 429 ); }
   $payload['fingerprint'] = $fingerprint; $id = hk_leados_uuid();
   if ( false === $wpdb->insert( $table, array( 'id' => $id, 'workspace_id' => HK_LEADOS_WORKSPACE_ID, 'kind' => 'discovery', 'state' => 'pending', 'payload' => wp_json_encode( $payload ) ) ) ) { return hk_leados2_error('Queue write failed.',500); }
  } elseif ( 'claim_discovery' === $action ) {
   update_option( 'hk_leados2_research_heartbeat', gmdate('c'), false );
   $candidate = hk_leados2_workflow_row( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE workspace_id = %s AND kind = 'discovery' AND (state = 'pending' OR (state = 'processing' AND updated_at < %s)) ORDER BY created_at ASC LIMIT 1", HK_LEADOS_WORKSPACE_ID, gmdate('Y-m-d H:i:s',time()-120) ), ARRAY_A ) );
   if ( ! $candidate ) { return array('job'=>null); }
   $payload = $candidate['payload'];
   if ( (int)($payload['attempts'] ?? 0) >= 2 ) { $wpdb->update($table,array('state'=>'failed'),array('id'=>$candidate['id'])); return array('job'=>null); }
   $payload['claimToken'] = wp_generate_password(40,false,false); $payload['attempts'] = (int)($payload['attempts'] ?? 0)+1;
   $wpdb->update($table,array('state'=>'processing','payload'=>wp_json_encode($payload),'updated_at'=>current_time('mysql',true)),array('id'=>$candidate['id']));
   return array('job'=>array('id'=>$candidate['id'],'query'=>$payload['query'],'claimToken'=>$payload['claimToken'],'maxResults'=>$payload['input']['maxResults'],'searchDepth'=>$payload['input']['searchDepth']));
  } elseif ( 'complete_discovery' === $action ) {
   if ( ! $row || 'discovery' !== $row['kind'] || ! hash_equals( $row['payload']['claimToken'] ?? '', (string)($body['claimToken'] ?? '') ) ) { return hk_leados2_error('Invalid or expired research claim.'); }
   if ( in_array($row['state'],array('complete','failed'),true) ) { return array('duplicate'=>true); }
   if ( 'processing' !== $row['state'] ) { return hk_leados2_error('Research job not claimed.'); }
   $payload = $row['payload']; $results = array();
   foreach ( array_slice((array)($body['results'] ?? array()),0,100) as $result ) { $results[] = array('title'=>substr(sanitize_text_field($result['title'] ?? ''),0,250),'url'=>esc_url_raw($result['url'] ?? ''),'content'=>substr(sanitize_text_field($result['content'] ?? ''),0,1000)); }
   $payload['results'] = $results; $payload['retrievedAt'] = gmdate('c'); $payload['error'] = sanitize_text_field($body['error'] ?? ''); $payload['upstreamErrors'] = array_map('sanitize_text_field',(array)($body['upstreamErrors'] ?? array()));
   $state = $payload['error'] ? 'failed' : 'complete';
   if ( false === $wpdb->update($table,array('state'=>$state,'payload'=>wp_json_encode($payload),'updated_at'=>current_time('mysql',true)),array('id'=>$id)) ) { return hk_leados2_error('Research result write failed.',500); }
  } elseif ( 'search_history' === $action ) {
   if ( ! $row || 'discovery' !== $row['kind'] ) { return hk_leados2_error( 'Discovery job required.', 404 ); }
   $payload = $row['payload'];
   if ( isset( $body['initialKeys'] ) && ! isset( $payload['initialKeys'] ) ) {
    $payload['initialKeys'] = array_values( array_unique( array_map( function ( $key ) { return substr( sanitize_text_field( $key ), 0, 2000 ); }, array_slice( (array) $body['initialKeys'], 0, 40 ) ) ) );
    $wpdb->update( $table, array( 'payload' => wp_json_encode( $payload ) ), array( 'id' => $id ) );
   }
   $count = min( $payload['input']['maxResults'], max( 0, (int) ( $body['resultsCount'] ?? 0 ) ) );
   $history = $wpdb->prefix . 'leados_searches';
   $written = $wpdb->query( $wpdb->prepare( "INSERT INTO $history (id,workspace_id,query_category,query_location,results_count) VALUES (%s,%s,%s,%s,%d) ON DUPLICATE KEY UPDATE results_count = VALUES(results_count)", $id, HK_LEADOS_WORKSPACE_ID, $payload['input']['category'], $payload['input']['location'], $count ) );
   if ( false === $written ) { return hk_leados2_error( 'Search history write failed.', 500 ); }
  } elseif ( 'save_search' === $action ) {
   $payload = array( 'name' => sanitize_text_field( $body['name'] ?? '' ), 'category' => sanitize_text_field( $body['category'] ?? '' ), 'location' => sanitize_text_field( $body['location'] ?? '' ), 'productInterest' => sanitize_text_field( $body['productInterest'] ?? 'horse_salt' ), 'keyword' => sanitize_text_field( $body['keyword'] ?? '' ), 'maxResults' => min( 40, max( 1, (int) ( $body['maxResults'] ?? 15 ) ) ) );
   foreach ( array( 'requireWebsite', 'requirePhone', 'requireEmail', 'excludeSaved', 'excludeContacted', 'wholesaleOnly', 'privateLabelOnly' ) as $key ) { $payload[$key] = ! empty( $body[$key] ); }
   $payload['radiusKm'] = min( 50, max( 1, (int) ( $body['radiusKm'] ?? 25 ) ) );
   $payload['searchDepth'] = min( 2, max( 1, (int) ( $body['searchDepth'] ?? 1 ) ) );
   $payload['country'] = sanitize_text_field( $body['country'] ?? 'US' );
   $id = hk_leados_uuid();
   if ( false === $wpdb->insert( $table, array( 'id' => $id, 'workspace_id' => HK_LEADOS_WORKSPACE_ID, 'kind' => 'saved_search', 'state' => 'saved', 'payload' => wp_json_encode( $payload ) ) ) ) { return hk_leados2_error( 'Save failed.', 500 ); }
  } elseif ( 'save_draft' === $action ) {
   if ( ! $lead || 'do_not_contact' === $lead['status'] || hk_leados2_suppressed( $lead['email'] ?? '' ) ) { return hk_leados2_error( 'Lead unavailable or suppressed.' ); }
   if ( $row && 'draft' !== $row['kind'] ) { return hk_leados2_error( 'Not a draft.' ); }
   if ( $row && ! in_array( $row['state'], array( 'draft', 'approved', 'rejected', 'paused' ), true ) ) { return hk_leados2_error( 'Dispatched drafts are immutable. Create a new follow-up draft.' ); }
   if ( $row && (int) ( $body['revision'] ?? 0 ) !== $row['revision'] ) { return hk_leados2_error( 'Draft changed; refresh before editing.' ); }
   $payload = array( 'recipient' => sanitize_email( $lead['email'] ?? '' ), 'subject' => substr( sanitize_text_field( $body['subject'] ?? '' ), 0, 250 ), 'message' => substr( sanitize_textarea_field( $body['message'] ?? '' ), 0, 12000 ), 'productInterest' => sanitize_text_field( $body['productInterest'] ?? 'horse_salt' ), 'approvedBy' => null );
   if ( ! $payload['subject'] || ! $payload['message'] ) { return hk_leados2_error( 'Draft copy is required.', 400 ); }
   $id = $row ? $row['id'] : hk_leados_uuid();
   $values = array( 'workspace_id' => HK_LEADOS_WORKSPACE_ID, 'kind' => 'draft', 'lead_id' => $lead_id, 'state' => 'draft', 'revision' => $row ? $row['revision'] + 1 : 1, 'payload' => wp_json_encode( $payload ), 'updated_at' => current_time( 'mysql', true ) );
   $write = $row ? $wpdb->update( $table, $values, array( 'id' => $id ) ) : $wpdb->insert( $table, array_merge( array( 'id' => $id ), $values ) );
   if ( false === $write ) { return hk_leados2_error( 'Draft save failed.', 500 ); }
  } elseif ( 'export_crm' === $action ) {
   if ( ! $lead || ! is_email( $lead['email'] ?? '' ) ) { return hk_leados2_error( 'A saved company email is required for the CRM inbox.' ); }
   $crm_table = $wpdb->prefix . 'crm_leads';
   $crm_id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $crm_table WHERE source = 'leados_b2b' AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.leadId')) = %s LIMIT 1", $lead_id ) );
   if ( ! $crm_id ) {
    $metadata = array( 'leadId' => $lead_id, 'workspaceId' => HK_LEADOS_WORKSPACE_ID, 'prospectOnly' => true );
    if ( false === $wpdb->insert( $crm_table, array( 'email' => $lead['email'], 'company' => $lead['business_name'], 'phone' => $lead['phone'], 'source' => 'leados_b2b', 'page_url' => $lead['website'], 'metadata' => wp_json_encode( $metadata ), 'opted_in' => 0, 'status' => 'new', 'notes' => 'B2B prospect from LeadOS; published email is not subscription consent.' ) ) ) { return hk_leados2_error( 'CRM save failed.', 500 ); }
    $crm_id = $wpdb->insert_id;
   }
   hk_leados_audit( 'b2b_crm_export', array( 'lead_id' => $lead_id, 'crm_id' => $crm_id ) );
   return array( 'crmId' => (int) $crm_id, 'optedIn' => false );
  } elseif ( 'suppress' === $action ) {
   if ( ! $lead || ! $lead['email'] ) { return hk_leados2_error( 'Lead email required.' ); }
   update_option( 'hklo2_suppress_' . hash( 'sha256', strtolower( trim( $lead['email'] ) ) ), array( 'at' => gmdate( 'c' ), 'reason' => sanitize_text_field( $body['reason'] ?? 'owner stop' ) ), false );
   $wpdb->update( $leads_table, array( 'status' => 'do_not_contact' ), array( 'id' => $lead_id ) );
   hk_leados_audit( 'outreach_suppressed', array( 'lead_id' => $lead_id ) ); return array( 'suppressed' => true );
  } else {
   if ( ! $row || 'draft' !== $row['kind'] || ! $lead ) { return hk_leados2_error( 'Draft and lead required.', 404 ); }
   if ( in_array( $action, array( 'approve', 'reject', 'pause', 'reserve' ), true ) && (int) ( $body['revision'] ?? 0 ) !== $row['revision'] ) { return hk_leados2_error( 'Draft revision changed; refresh.' ); }
   $payload = $row['payload']; $state = $row['state'];
   // Recheck suppression at the final SMTP claim, including opt-outs received
   // after reservation. An approved draft is not permanent permission to send.
   if ( 'approve' === $action || 'reserve' === $action || ( 'event' === $action && 'sending' === ( $body['state'] ?? '' ) ) ) {
    $research = json_decode( $lead['research'] ?? '{}', true ) ?: array();
    if ( 'do_not_contact' === $lead['status'] || hk_leados2_suppressed( $payload['recipient'] ) || ! is_email( $payload['recipient'] ) || strtolower( $payload['recipient'] ) !== strtolower( $lead['email'] ?? '' ) || 'company_website' !== ( $lead['email_source'] ?? '' ) || empty( $research['lastVerifiedAt'] ) || strtotime( $research['lastVerifiedAt'] ) < time() - 30 * DAY_IN_SECONDS ) { return hk_leados2_error( 'Recent published company-email evidence and an unsuppressed lead are required.' ); }
   }
   if ( 'approve' === $action ) {
    if ( 'draft' !== $state ) { return hk_leados2_error( 'Only a current draft can be approved.' ); }
    $state = 'approved'; $payload['approvedBy'] = get_current_user_id(); $payload['approvedAt'] = gmdate( 'c' );
   } elseif ( 'reject' === $action || 'pause' === $action ) {
    if ( ! in_array( $state, array( 'draft', 'approved', 'paused', 'rejected' ), true ) ) { return hk_leados2_error( 'Dispatched draft cannot be paused retrospectively.' ); }
    $state = 'reject' === $action ? 'rejected' : 'paused'; $payload['approvedBy'] = null;
   } elseif ( 'reserve' === $action ) {
    if ( 'approved' !== $state || empty( $payload['approvedBy'] ) ) { return hk_leados2_error( 'Dispatch already reserved or not approved.' ); }
    // A delivery/reply/opt-out state change must not release a daily send slot.
    $count = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $table WHERE workspace_id = %s AND kind = 'draft' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.reservedAt')) >= %s", HK_LEADOS_WORKSPACE_ID, gmdate( 'Y-m-d' ) . 'T00:00:00+00:00' ) );
    if ( $count >= 20 ) { return hk_leados2_error( 'Daily maximum of 20 reached.', 429 ); }
    $state = 'queued'; $payload['reservedAt'] = gmdate( 'c' );
   } elseif ( 'dispatch_result' === $action ) {
    if ( 'queued' !== $state ) { return hk_leados2_error( 'Not reserved.' ); }
    $state = 'unknown' === ( $body['state'] ?? '' ) ? 'unknown' : 'queued'; $payload['dispatchError'] = sanitize_text_field( $body['error'] ?? '' );
   } elseif ( 'event' === $action || 'record_reply' === $action ) {
    $event = 'record_reply' === $action ? 'replied' : ( $body['state'] ?? '' );
    $event_id = sanitize_text_field( $body['eventId'] ?? '' );
    if ( ! $event_id || ! in_array( $event, array( 'sending', 'sent', 'delivered', 'bounced', 'replied', 'unsubscribed' ), true ) ) { return hk_leados2_error( 'Recognized event and stable event ID required.' ); }
    if ( in_array( $event_id, $payload['eventIds'] ?? array(), true ) ) { return array( 'item' => $row, 'duplicate' => true ); }
    if ( ! in_array( $state, array( 'queued', 'unknown', 'sending', 'sent', 'delivered', 'replied', 'bounced', 'unsubscribed' ), true ) ) { return hk_leados2_error( 'No outbound correspondence exists.' ); }
    if ( 'sending' === $event && ! in_array( $state, array( 'queued', 'unknown' ), true ) ) { return hk_leados2_error( 'Already claimed for sending.' ); }
    $payload['eventIds'][] = $event_id;
    // Late delivery events cannot reopen opted-out/bounced contacts or undo a reply.
    if ( ! in_array( $state, array( 'unsubscribed', 'bounced', 'replied' ), true ) || in_array( $event, array( 'unsubscribed', 'bounced' ), true ) ) { $state = $event; }
    $payload['lastEventAt'] = gmdate( 'c' );
    if ( in_array( $event, array( 'bounced', 'unsubscribed' ), true ) ) {
     update_option( 'hklo2_suppress_' . hash( 'sha256', strtolower( trim( $payload['recipient'] ) ) ), array( 'at' => gmdate( 'c' ), 'reason' => $event ), false );
     $wpdb->update( $leads_table, array( 'status' => 'do_not_contact' ), array( 'id' => $lead_id ) );
    } elseif ( 'replied' === $event && 'do_not_contact' !== $lead['status'] && ! hk_leados2_suppressed( $payload['recipient'] ) ) { $wpdb->update( $leads_table, array( 'status' => 'replied' ), array( 'id' => $lead_id ) ); }
    elseif ( in_array( $event, array( 'sent', 'delivered' ), true ) && ! in_array( $lead['status'], array( 'interested', 'quote_requested', 'negotiating', 'won', 'lost', 'do_not_contact', 'replied' ), true ) ) { $wpdb->update( $leads_table, array( 'status' => 'contacted' ), array( 'id' => $lead_id ) ); }
   } else { return hk_leados2_error( 'Unsupported action.', 400 ); }
   if ( false === $wpdb->update( $table, array( 'state' => $state, 'payload' => wp_json_encode( $payload ), 'revision' => $row['revision'] + 1, 'updated_at' => current_time( 'mysql', true ) ), array( 'id' => $id ) ) ) { return hk_leados2_error( 'Workflow write failed.', 500 ); }
  }
  hk_leados_audit( 'workflow_' . $action, array( 'id' => $id, 'lead_id' => $lead_id ) );
  return array( 'item' => hk_leados2_workflow_row( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %s", $id ), ARRAY_A ) ) );
 } finally { $wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) ); }
}

add_action( 'rest_api_init', function () {
 foreach ( array( '/research/gate' => 'hk_leados2_gate', '/research/website' => 'hk_leados2_research_website' ) as $path => $callback ) {
  register_rest_route( 'leados/v1', $path, array( 'methods' => 'POST', 'permission_callback' => 'hk_leados_can_manage', 'callback' => $callback ) );
 }
 register_rest_route( 'leados/v1', '/workflow', array( 'methods' => array( 'GET', 'POST' ), 'permission_callback' => 'hk_leados_can_manage', 'callback' => 'hk_leados2_workflow' ) );
} );

/** Owner-session diagnostics; no credentials, SQL input or public test endpoint. */
function hk_leados2_staging_install() {
 return '/staging' === rtrim( (string) wp_parse_url( get_site_url(), PHP_URL_PATH ), '/' );
}
add_action( 'admin_menu', function () {
 add_management_page( 'LeadOS Health', 'LeadOS Health', 'manage_options', 'hk-leados-health', 'hk_leados2_health_page' );
} );
function hk_leados2_health_page() {
 if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Administrator access required.' ); }
 echo '<div class="wrap"><h1>LeadOS Health</h1><p>Plugin ' . esc_html( HK_LEADOS_VERSION ) . ' · schema ' . esc_html( get_option( 'hk_leados_db_version', 'unavailable' ) ) . '</p>';
 echo '<p>Production is the release target. Staging checks use labelled QA prospects only. They never send email or change commerce records.</p>';
 if ( ! hk_leados2_staging_install() ) { echo '<p>Write checks are available only on the staging installation.</p></div>'; return; }
 if ( 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
  check_admin_referer( 'hk_leados2_staging_checks' );
  try {
   $checks = hk_leados2_staging_checks();
   echo '<div class="notice notice-success"><p>' . count( $checks ) . ' staging integration checks passed.</p></div><ul>';
   foreach ( $checks as $check ) { echo '<li>PASS — ' . esc_html( $check ) . '</li>'; }
   echo '</ul>';
  } catch ( Throwable $error ) { echo '<div class="notice notice-error"><p>FAIL — ' . esc_html( $error->getMessage() ) . '</p></div>'; }
 }
 echo '<form method="post">'; wp_nonce_field( 'hk_leados2_staging_checks' );
 submit_button( 'Run staging LeadOS checks' ); echo '</form></div>';
}
function hk_leados2_staging_request( $method, $route, $body ) {
 $request = new WP_REST_Request( $method, '/leados/v1' . $route );
 $request->set_header( 'Content-Type', 'application/json' ); $request->set_body( wp_json_encode( $body ) );
 return rest_do_request( $request );
}
function hk_leados2_staging_checks() {
 if ( ! hk_leados2_staging_install() || ! current_user_can( 'manage_options' ) ) { throw new RuntimeException( 'Staging administrator required.' ); }
 $checks = array();
 $assert = function ( $label, $condition ) use ( &$checks ) { if ( ! $condition ) { throw new RuntimeException( $label ); } $checks[] = $label; };
 $call = function ( $method, $route, $body ) {
  $response = hk_leados2_staging_request( $method, $route, $body );
  if ( $response->get_status() >= 400 ) { $data = $response->get_data(); throw new RuntimeException( $data['message'] ?? 'Staging request failed.' ); }
  return $response->get_data();
 };
 $run = substr( hk_leados_uuid(), 0, 8 );
 $lead = array( 'business_name' => 'QA LeadOS 2 ' . $run, 'category' => 'Feed Store', 'website' => 'https://qa-' . $run . '.example.invalid', 'email' => 'sales@qa-' . $run . '.example.invalid', 'email_source' => 'company_website', 'address' => 'QA branch A', 'city' => 'QA Houston', 'region' => 'TX', 'notes' => 'QA only — no correspondence; retained as a staging test record.', 'research' => array( 'lastVerifiedAt' => gmdate( 'c' ), 'sources' => array( array( 'url' => 'https://qa-' . $run . '.example.invalid/contact', 'kind' => 'company_page', 'status' => 'verified', 'retrievedAt' => gmdate( 'c' ), 'excerpt' => 'Synthetic staging fixture, not a real prospect.' ) ) ) );
 $saved = $call( 'POST', '/leads', array( 'lead' => $lead ) ); $id = $saved['lead']['id'] ?? '';
 $assert( 'Lead and evidence persist in WordPress', $id && ! empty( $saved['lead']['research']['sources'] ) );
 $again = $call( 'POST', '/leads', array( 'lead' => array_merge( $lead, array( 'notes' => 'Must not replace owner note' ) ) ) );
 $assert( 'Rediscovery is idempotent and preserves owner notes', $again['lead']['id'] === $id && $again['lead']['notes'] === $lead['notes'] );
 $patched = $call( 'PATCH', '/leads/' . $id, array( 'status' => 'qualified', 'address' => 'QA owner-confirmed branch A', 'research' => array_merge( $lead['research'], array( 'assignedOwner' => 'QA owner', 'nextFollowUp' => '2099-01-01' ) ) ) );
 $assert( 'Pipeline and sales metadata persist', 'qualified' === $patched['lead']['status'] && 'QA owner' === $patched['lead']['research']['assignedOwner'] );
 $rediscovered = $call( 'POST', '/leads', array( 'lead' => $lead ) );
 $assert( 'Rediscovery preserves confirmed company locations', $rediscovered['lead']['id'] === $id && 'QA owner-confirmed branch A' === $rediscovered['lead']['address'] );
 $branch = $call( 'POST', '/leads', array( 'lead' => array_merge( $lead, array( 'address' => 'QA branch B', 'status' => 'do_not_contact' ) ) ) );
 $assert( 'Distinct branches retain distinct IDs', $branch['lead']['id'] !== $id );
 $draft = $call( 'POST', '/workflow', array( 'action' => 'save_draft', 'leadId' => $id, 'subject' => 'QA only — never send', 'message' => 'Synthetic staging integration fixture. No email is sent.' ) )['item'];
 $assert( 'Draft persists without sending', 'draft' === $draft['state'] );
 $approved = $call( 'POST', '/workflow', array( 'action' => 'approve', 'id' => $draft['id'], 'revision' => $draft['revision'] ) )['item'];
 $assert( 'Owner approval is recorded', 'approved' === $approved['state'] && get_current_user_id() === $approved['payload']['approvedBy'] );
 $edited = $call( 'POST', '/workflow', array( 'action' => 'save_draft', 'id' => $draft['id'], 'revision' => $approved['revision'], 'subject' => 'QA revision', 'message' => 'Changed staging fixture — no send.' ) )['item'];
 $assert( 'Editing revokes approval', 'draft' === $edited['state'] && empty( $edited['payload']['approvedBy'] ) );
 $stale = hk_leados2_staging_request( 'POST', '/workflow', array( 'action' => 'approve', 'id' => $draft['id'], 'revision' => $approved['revision'] ) );
 $assert( 'Stale approval revisions are rejected', 409 === $stale->get_status() );
 $approved = $call( 'POST', '/workflow', array( 'action' => 'approve', 'id' => $draft['id'], 'revision' => $edited['revision'] ) )['item'];
 $reserved = $call( 'POST', '/workflow', array( 'action' => 'reserve', 'id' => $draft['id'], 'revision' => $approved['revision'] ) )['item'];
 $assert( 'Dispatch reservation persists without a provider call', 'queued' === $reserved['state'] );
 $second = hk_leados2_staging_request( 'POST', '/workflow', array( 'action' => 'reserve', 'id' => $draft['id'], 'revision' => $reserved['revision'] ) );
 $assert( 'Duplicate dispatch reservation is rejected', 409 === $second->get_status() );
 $call( 'POST', '/workflow', array( 'action' => 'suppress', 'leadId' => $id, 'reason' => 'QA fixture — never contact' ) );
 $claim = hk_leados2_staging_request( 'POST', '/workflow', array( 'action' => 'event', 'id' => $draft['id'], 'state' => 'sending', 'eventId' => 'qa-final-claim-' . $run ) );
 $assert( 'Opt-out after approval blocks the final send claim', 409 === $claim->get_status() );
 $crm = $call( 'POST', '/workflow', array( 'action' => 'export_crm', 'leadId' => $id ) );
 $crm_again = $call( 'POST', '/workflow', array( 'action' => 'export_crm', 'leadId' => $id ) );
 $assert( 'CRM prospect export is idempotent and does not subscribe', $crm['crmId'] === $crm_again['crmId'] && false === $crm['optedIn'] );
 $search = $call( 'POST', '/workflow', array( 'action' => 'save_search', 'name' => 'QA saved search ' . $run, 'category' => 'Feed Store', 'location' => 'Texas', 'keyword' => 'QA only', 'requireEmail' => true, 'excludeContacted' => true, 'radiusKm' => 35, 'searchDepth' => 2 ) )['item'];
 $assert( 'Saved searches preserve contact and depth filters', $search['payload']['requireEmail'] && $search['payload']['excludeContacted'] && 35 === $search['payload']['radiusKm'] && 2 === $search['payload']['searchDepth'] );
 $job = $call( 'POST', '/workflow', array( 'action' => 'queue_discovery', 'input' => array( 'category' => 'Feed Store', 'location' => 'Texas', 'keyword' => 'QA fixture ' . $run, 'maxResults' => 15 ) ) )['item'];
 $call( 'POST', '/workflow', array( 'action' => 'search_history', 'id' => $job['id'], 'initialKeys' => array( 'QA initial source' ), 'resultsCount' => 1 ) );
 $call( 'POST', '/workflow', array( 'action' => 'search_history', 'id' => $job['id'], 'resultsCount' => 3 ) );
 global $wpdb;
 $history = $wpdb->get_row( $wpdb->prepare( "SELECT COUNT(*) AS rows_count, MAX(results_count) AS final_count FROM {$wpdb->prefix}leados_searches WHERE id = %s", $job['id'] ), ARRAY_A );
 $assert( 'Queued search history updates once without duplicate executions', 1 === (int) $history['rows_count'] && 3 === (int) $history['final_count'] );
 // Retain test evidence but prevent this synthetic fixture from reaching a worker.
 $wpdb->update( $wpdb->prefix . 'leados_workflows', array( 'state' => 'failed' ), array( 'id' => $job['id'] ) );
 return $checks;
}
