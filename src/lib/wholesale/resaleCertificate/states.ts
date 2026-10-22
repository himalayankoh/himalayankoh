/**
 * The U.S. state registry behind resale-certificate review.
 *
 * ## What this file is, and what it deliberately is not
 *
 * It is a table of *facts a reviewer needs to do the check by hand*: which authority
 * issues a resale certificate in each state, where that authority publishes its own
 * verification or lookup page, whether the state levies a sales tax at all, and which
 * certificate forms the state is documented to accept.
 *
 * It is **not** an integration. There is no universal U.S. resale-certificate
 * verification API, no state publishes a signed machine-readable "is this permit
 * valid" endpoint that a private site can call, and several authorities' lookup tools
 * sit behind CAPTCHAs or acceptable-use terms that forbid automated querying. So
 * nothing here is called at runtime: a verification run reads these entries and tells
 * the reviewer where to look. Every entry therefore carries `lookupUrl`, and the admin
 * screens render it as a link a person opens themselves.
 *
 * ## Why the format rules are so thin
 *
 * A shape check is only ever allowed to *add* information for a human — it can never
 * approve anything (see `verify.ts`). A wrong regular expression would then be a
 * nuisance rather than a legal risk, but it would still be a wrong claim about a
 * state's numbering, so patterns are included only where the format is documented
 * plainly and the check is stated as advisory. Texas is the state the owner asked for
 * by name, and its Comptroller publishes the eleven-digit taxpayer number; every other
 * state gets a structural check and a note saying no machine-readable format is
 * documented — which is the honest answer, not a missing feature.
 *
 * Server-only by intent, but it holds no secret: the admin screens receive the entries
 * they render.
 */

/** The certificate documents a U.S. buyer may present. */
export type CertificateType =
  | 'STATE_RESALE_CERTIFICATE'
  | 'STREAMLINED_EXEMPTION_CERTIFICATE'
  | 'MTC_UNIFORM_CERTIFICATE'
  | 'HOME_STATE_REGISTRATION'
  | 'SIGNED_EXEMPTION_STATEMENT';

export const CERTIFICATE_TYPES: ReadonlyArray<{ value: CertificateType; label: string; description: string }> = [
  {
    value: 'STATE_RESALE_CERTIFICATE',
    label: 'State resale certificate',
    description: "The certificate or permit issued by the state where the buyer's business is registered.",
  },
  {
    value: 'STREAMLINED_EXEMPTION_CERTIFICATE',
    label: 'Streamlined Sales Tax exemption certificate',
    description:
      'The Multistate Tax Commission / SSTGB exempt-entity certificate, accepted by Streamlined member states for resale.',
  },
  {
    value: 'MTC_UNIFORM_CERTIFICATE',
    label: 'MTC Uniform Sales & Use Tax Exemption Certificate',
    description: 'The Multistate Tax Commission uniform certificate, used to claim resale in states that accept it.',
  },
  {
    value: 'HOME_STATE_REGISTRATION',
    label: 'Home-state seller registration',
    description: 'A seller/permit registration from the state that issued the number, where no separate resale form exists.',
  },
  {
    value: 'SIGNED_EXEMPTION_STATEMENT',
    label: 'Signed exemption statement',
    description:
      'A written statement from the buyer, used only in states with no state-level sales tax or where the state accepts it in place of a permit.',
  },
];

export function isCertificateType(value: unknown): value is CertificateType {
  return CERTIFICATE_TYPES.some((entry) => entry.value === value);
}

export interface StateAuthority {
  /** USPS two-letter code. */
  code: string;
  name: string;
  /** The body that administers sales and use tax in this state. */
  authority: string;
  /** The authority's public home page. */
  url: string;
  /** The page or tool a reviewer opens to check a certificate number by hand. */
  lookupUrl: string;
  /** False for the four states with no state-level sales tax (plus Alaska's partial system). */
  stateSalesTax: boolean;
  /** Certificate documents this state is documented to accept for resale. */
  accepted: CertificateType[];
  /**
   * A documented number format, as an anchored regular-expression source, for the few
   * states that publish one plainly. Advisory only — a mismatch is a review note.
   */
  numberPattern?: string;
  /** What the number looks like, in words, for the reviewer and the applicant. */
  numberHint: string;
  /** One sentence the review screen shows, including anything unusual about this state. */
  notes: string;
}

/**
 * All fifty states and the District of Columbia.
 *
 * `lookupUrl` points at the authority's own site. Where the state publishes a
 * dedicated verification tool the entry names it in `notes`; the link still goes to
 * the authority so a URL change cannot silently send a reviewer somewhere else.
 */
export const STATE_AUTHORITIES: Record<string, StateAuthority> = {
  AL: {
    code: 'AL',
    name: 'Alabama',
    authority: 'Alabama Department of Revenue',
    url: 'https://www.revenue.alabama.gov/',
    lookupUrl: 'https://www.revenue.alabama.gov/sales-use/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Alabama taxpayer/account number printed on the resale certificate (Form STE-1 or equivalent).',
    notes: 'Alabama accepts its own resale certificate and the multistate certificates; the number is the account number on the form.',
  },
  AK: {
    code: 'AK',
    name: 'Alaska',
    authority: 'Alaska Department of Revenue',
    url: 'https://tax.alaska.gov/',
    lookupUrl: 'https://tax.alaska.gov/programs/programs.aspx?60600',
    stateSalesTax: false,
    accepted: ['SIGNED_EXEMPTION_STATEMENT', 'HOME_STATE_REGISTRATION'],
    numberHint: 'A local business licence or seller registration number, if the buyer holds one.',
    notes: 'Alaska has no statewide sales tax. Some boroughs and cities levy local sales tax; resale is a local question, so every Alaska application needs manual review.',
  },
  AZ: {
    code: 'AZ',
    name: 'Arizona',
    authority: 'Arizona Department of Revenue',
    url: 'https://azdor.gov/',
    lookupUrl: 'https://azdor.gov/transaction-privilege-tax/license-verification',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Arizona Transaction Privilege Tax (TPT) licence number, usually nine digits.',
    notes: 'Arizona publishes a licence-verification page for TPT numbers; open it from the review screen and record what it answered.',
  },
  AR: {
    code: 'AR',
    name: 'Arkansas',
    authority: 'Arkansas Department of Finance and Administration',
    url: 'https://www.dfa.arkansas.gov/',
    lookupUrl: 'https://www.dfa.arkansas.gov/office/taxes/sales-use-tax/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Arkansas sales tax permit number on the resale certificate.',
    notes: 'Arkansas is a Streamlined member state, so the SST exemption certificate is accepted for resale.',
  },
  CA: {
    code: 'CA',
    name: 'California',
    authority: 'California Department of Tax and Fee Administration (CDTFA)',
    url: 'https://www.cdtfa.ca.gov/',
    lookupUrl: 'https://www.cdtfa.ca.gov/formspubs/pub103/valid-resale-certificates.htm',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: "The seller's permit number printed on the resale certificate.",
    notes: "California requires a valid seller's permit for a resale certificate to be valid; CDTFA Publication 103 lists what makes one valid.",
  },
  CO: {
    code: 'CO',
    name: 'Colorado',
    authority: 'Colorado Department of Revenue',
    url: 'https://tax.colorado.gov/',
    lookupUrl: 'https://tax.colorado.gov/sales-tax-licenses',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Colorado sales tax licence (account) number.',
    notes: 'Colorado accepts the Streamlined certificate; home-rule cities may still ask for their own registration.',
  },
  CT: {
    code: 'CT',
    name: 'Connecticut',
    authority: 'Connecticut Department of Revenue Services',
    url: 'https://portal.ct.gov/drs',
    lookupUrl: 'https://portal.ct.gov/drs/taxes/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Connecticut sales and use tax permit number (Form REG-1).',
    notes: 'Connecticut issues a sales and use tax permit; the resale certificate cites that permit number.',
  },
  DC: {
    code: 'DC',
    name: 'District of Columbia',
    authority: 'DC Office of Tax and Revenue',
    url: 'https://otr.cfo.dc.gov/',
    lookupUrl: 'https://otr.cfo.dc.gov/page/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The DC sales and use tax registration number.',
    notes: 'The District of Columbia is a Streamlined member; confirm the registration number against OTR before approving.',
  },
  DE: {
    code: 'DE',
    name: 'Delaware',
    authority: 'Delaware Division of Revenue',
    url: 'https://revenue.delaware.gov/',
    lookupUrl: 'https://revenue.delaware.gov/business-taxes/',
    stateSalesTax: false,
    accepted: ['SIGNED_EXEMPTION_STATEMENT', 'HOME_STATE_REGISTRATION'],
    numberHint: 'A Delaware business licence number, if held.',
    notes: 'Delaware has no state sales tax, so there is no resale certificate to verify; review the signed statement instead.',
  },
  FL: {
    code: 'FL',
    name: 'Florida',
    authority: 'Florida Department of Revenue',
    url: 'https://floridarevenue.com/',
    lookupUrl: 'https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The annual resale certificate number (the buyer’s sales and use tax registration number).',
    notes: 'Florida lets a buyer issue its own annual resale certificate; the number is the state registration number, and the certificate expires each year on 1 January.',
  },
  GA: {
    code: 'GA',
    name: 'Georgia',
    authority: 'Georgia Department of Revenue',
    url: 'https://dor.georgia.gov/',
    lookupUrl: 'https://dor.georgia.gov/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Georgia sales and use tax certificate number (Form ST-5 cites it).',
    notes: 'Georgia’s resale certificate is Form ST-5; the number is the state sales and use tax registration.',
  },
  HI: {
    code: 'HI',
    name: 'Hawaii',
    authority: 'Hawaii Department of Taxation',
    url: 'https://tax.hawaii.gov/',
    lookupUrl: 'https://tax.hawaii.gov/gen/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'HOME_STATE_REGISTRATION'],
    numberHint: 'The Hawaii General Excise Tax (GET) licence number.',
    notes: 'Hawaii levies the General Excise Tax rather than a sales tax; resale is claimed on Form G-17 with the GET licence number.',
  },
  ID: {
    code: 'ID',
    name: 'Idaho',
    authority: 'Idaho State Tax Commission',
    url: 'https://tax.idaho.gov/',
    lookupUrl: 'https://tax.idaho.gov/taxes/sales-use/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Idaho seller’s permit number.',
    notes: 'Idaho is a Streamlined member state; the seller’s permit number appears on the exemption certificate.',
  },
  IL: {
    code: 'IL',
    name: 'Illinois',
    authority: 'Illinois Department of Revenue',
    url: 'https://tax.illinois.gov/',
    lookupUrl: 'https://tax.illinois.gov/businesses/registration.html',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Illinois Account ID / EIN registration number on Form CRT-61.',
    notes: 'Illinois’s resale certificate is Form CRT-61; the number is the buyer’s Illinois Account ID.',
  },
  IN: {
    code: 'IN',
    name: 'Indiana',
    authority: 'Indiana Department of Revenue',
    url: 'https://www.in.gov/dor/',
    lookupUrl: 'https://www.in.gov/dor/business-taxes/sales-use-tax/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Indiana Retail Merchant Certificate (RMC) number, or the state tax ID on the ST-105.',
    notes: 'Indiana’s resale certificate is Form ST-105; the Retail Merchant Certificate number is the usual evidence.',
  },
  IA: {
    code: 'IA',
    name: 'Iowa',
    authority: 'Iowa Department of Revenue',
    url: 'https://tax.iowa.gov/',
    lookupUrl: 'https://tax.iowa.gov/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Iowa sales tax permit number (Form IA 54356).',
    notes: 'Iowa accepts its own exemption certificate and the Streamlined certificate.',
  },
  KS: {
    code: 'KS',
    name: 'Kansas',
    authority: 'Kansas Department of Revenue',
    url: 'https://www.ksrevenue.gov/',
    lookupUrl: 'https://www.ksrevenue.gov/sales.html',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Kansas sales tax registration number on the resale certificate (Form ST-28).',
    notes: 'Kansas’s resale certificate is Form ST-28.',
  },
  KY: {
    code: 'KY',
    name: 'Kentucky',
    authority: 'Kentucky Department of Revenue',
    url: 'https://revenue.ky.gov/',
    lookupUrl: 'https://revenue.ky.gov/Business/Sales-Use-Tax/Pages/default.aspx',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Kentucky sales and use tax permit number.',
    notes: 'Kentucky’s resale certificate is Form 51A105 and cites the permit number.',
  },
  LA: {
    code: 'LA',
    name: 'Louisiana',
    authority: 'Louisiana Department of Revenue',
    url: 'https://revenue.louisiana.gov/',
    lookupUrl: 'https://revenue.louisiana.gov/TaxForms/SalesUseTax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Louisiana resale certificate number (Form R-1042).',
    notes: 'Louisiana has its own resale certificate (R-1042) and does not accept the Streamlined certificate in place of it.',
  },
  ME: {
    code: 'ME',
    name: 'Maine',
    authority: 'Maine Revenue Services',
    url: 'https://www.maine.gov/revenue/',
    lookupUrl: 'https://www.maine.gov/revenue/taxes/sales-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Maine seller registration / sales tax account number.',
    notes: 'Maine is a Streamlined member state.',
  },
  MD: {
    code: 'MD',
    name: 'Maryland',
    authority: 'Comptroller of Maryland',
    url: 'https://www.marylandtaxes.gov/',
    lookupUrl: 'https://www.marylandtaxes.gov/business/sales-use/index.php',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Maryland sales and use tax licence number.',
    notes: 'Maryland’s resale certificate (Form ST-202) cites the state licence number.',
  },
  MA: {
    code: 'MA',
    name: 'Massachusetts',
    authority: 'Massachusetts Department of Revenue',
    url: 'https://www.mass.gov/orgs/massachusetts-department-of-revenue',
    lookupUrl: 'https://www.mass.gov/service-details/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Massachusetts Sales and Use Tax Registration number (Form ST-4).',
    notes: 'Massachusetts’s resale certificate is Form ST-4.',
  },
  MI: {
    code: 'MI',
    name: 'Michigan',
    authority: 'Michigan Department of Treasury',
    url: 'https://www.michigan.gov/treasury',
    lookupUrl: 'https://www.michigan.gov/taxes/business-taxes/sales-use',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Michigan sales tax licence number.',
    notes: 'Michigan’s resale certificate is Form 3372 and cites the sales tax licence number.',
  },
  MN: {
    code: 'MN',
    name: 'Minnesota',
    authority: 'Minnesota Department of Revenue',
    url: 'https://www.revenue.state.mn.us/',
    lookupUrl: 'https://www.revenue.state.mn.us/sales-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Minnesota sales tax ID number (Form ST3).',
    notes: 'Minnesota’s exemption certificate is Form ST3 and is also a Streamlined document.',
  },
  MS: {
    code: 'MS',
    name: 'Mississippi',
    authority: 'Mississippi Department of Revenue',
    url: 'https://www.dor.ms.gov/',
    lookupUrl: 'https://www.dor.ms.gov/business/sales-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Mississippi sales tax permit number.',
    notes: 'Mississippi’s resale certificate is Form 80-201-15-6 (or the buyer’s own certificate citing the permit).',
  },
  MO: {
    code: 'MO',
    name: 'Missouri',
    authority: 'Missouri Department of Revenue',
    url: 'https://dor.mo.gov/',
    lookupUrl: 'https://dor.mo.gov/business/sales/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Missouri sales tax registration number (Form 149).',
    notes: 'Missouri’s resale certificate cites the state sales tax registration number.',
  },
  MT: {
    code: 'MT',
    name: 'Montana',
    authority: 'Montana Department of Revenue',
    url: 'https://revenue.mt.gov/',
    lookupUrl: 'https://revenue.mt.gov/businesses',
    stateSalesTax: false,
    accepted: ['SIGNED_EXEMPTION_STATEMENT', 'HOME_STATE_REGISTRATION'],
    numberHint: 'A Montana business registration number, if held.',
    notes: 'Montana has no state sales tax, so there is no resale certificate to verify; review the signed statement instead.',
  },
  NE: {
    code: 'NE',
    name: 'Nebraska',
    authority: 'Nebraska Department of Revenue',
    url: 'https://revenue.nebraska.gov/',
    lookupUrl: 'https://revenue.nebraska.gov/businesses/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Nebraska sales tax permit / ID number on Form 13.',
    notes: 'Nebraska’s resale certificate is Form 13 and is also a Streamlined document.',
  },
  NV: {
    code: 'NV',
    name: 'Nevada',
    authority: 'Nevada Department of Taxation',
    url: 'https://tax.nv.gov/',
    lookupUrl: 'https://tax.nv.gov/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Nevada sales tax permit number.',
    notes: 'Nevada’s resale certificate cites the state sales tax permit number.',
  },
  NH: {
    code: 'NH',
    name: 'New Hampshire',
    authority: 'New Hampshire Department of Revenue Administration',
    url: 'https://www.revenue.nh.gov/',
    lookupUrl: 'https://www.revenue.nh.gov/',
    stateSalesTax: false,
    accepted: ['SIGNED_EXEMPTION_STATEMENT', 'HOME_STATE_REGISTRATION'],
    numberHint: 'A New Hampshire business registration number, if held.',
    notes: 'New Hampshire has no general sales tax; a resale certificate is not applicable and every application needs manual review.',
  },
  NJ: {
    code: 'NJ',
    name: 'New Jersey',
    authority: 'New Jersey Division of Taxation',
    url: 'https://www.nj.gov/treasury/taxation/',
    lookupUrl: 'https://www.nj.gov/treasury/taxation/su_1.shtml',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The New Jersey tax registration / seller’s certificate number (Form ST-3).',
    notes: 'New Jersey’s resale certificate is Form ST-3.',
  },
  NM: {
    code: 'NM',
    name: 'New Mexico',
    authority: 'New Mexico Taxation and Revenue Department',
    url: 'https://www.tax.newmexico.gov/',
    lookupUrl: 'https://www.tax.newmexico.gov/businesses/gross-receipts-tax/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'HOME_STATE_REGISTRATION'],
    numberHint: 'The New Mexico CRS (Combined Reporting System) identification number.',
    notes: 'New Mexico levies Gross Receipts Tax; a resale deduction depends on the CRS number and the transaction, so review carefully.',
  },
  NY: {
    code: 'NY',
    name: 'New York',
    authority: 'New York State Department of Taxation and Finance',
    url: 'https://www.tax.ny.gov/',
    lookupUrl: 'https://www.tax.ny.gov/bus/st/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The New York Certificate of Authority number (Form ST-120 cites it).',
    notes: 'New York’s resale certificate is Form ST-120; the Certificate of Authority number is the buyer’s evidence.',
  },
  NC: {
    code: 'NC',
    name: 'North Carolina',
    authority: 'North Carolina Department of Revenue',
    url: 'https://www.ncdor.gov/',
    lookupUrl: 'https://www.ncdor.gov/taxes-forms/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The North Carolina sales and use tax account number (Form E-595E).',
    notes: 'North Carolina’s resale certificate is Form E-595E.',
  },
  ND: {
    code: 'ND',
    name: 'North Dakota',
    authority: 'North Dakota Office of State Tax Commissioner',
    url: 'https://www.tax.nd.gov/',
    lookupUrl: 'https://www.tax.nd.gov/business/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The North Dakota sales and use tax permit number.',
    notes: 'North Dakota is a Streamlined member state.',
  },
  OH: {
    code: 'OH',
    name: 'Ohio',
    authority: 'Ohio Department of Taxation',
    url: 'https://tax.ohio.gov/',
    lookupUrl: 'https://tax.ohio.gov/business/ohio-business-taxes/sales-and-use',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Ohio vendor’s licence number.',
    notes: 'Ohio’s exemption certificate cites the vendor’s licence number.',
  },
  OK: {
    code: 'OK',
    name: 'Oklahoma',
    authority: 'Oklahoma Tax Commission',
    url: 'https://oklahoma.gov/tax.html',
    lookupUrl: 'https://oklahoma.gov/tax/businesses/sales-and-use-tax.html',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Oklahoma sales tax permit number.',
    notes: 'Oklahoma’s resale certificate cites the state sales tax permit number.',
  },
  OR: {
    code: 'OR',
    name: 'Oregon',
    authority: 'Oregon Department of Revenue',
    url: 'https://www.oregon.gov/dor/',
    lookupUrl: 'https://www.oregon.gov/dor/programs/businesses/Pages/sales-tax.aspx',
    stateSalesTax: false,
    accepted: ['SIGNED_EXEMPTION_STATEMENT', 'HOME_STATE_REGISTRATION'],
    numberHint: 'An Oregon business registry number, if held.',
    notes: 'Oregon has no sales tax, so there is no resale certificate to verify; review the signed statement instead.',
  },
  PA: {
    code: 'PA',
    name: 'Pennsylvania',
    authority: 'Pennsylvania Department of Revenue',
    url: 'https://www.revenue.pa.gov/',
    lookupUrl: 'https://www.revenue.pa.gov/TaxTypes/SUT/Pages/default.aspx',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Pennsylvania sales tax licence number (Form REV-1220 cites it).',
    notes: 'Pennsylvania’s resale certificate is Form REV-1220.',
  },
  RI: {
    code: 'RI',
    name: 'Rhode Island',
    authority: 'Rhode Island Division of Taxation',
    url: 'https://tax.ri.gov/',
    lookupUrl: 'https://tax.ri.gov/tax-sections/sales-excise-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Rhode Island sales and use tax permit number.',
    notes: 'Rhode Island is a Streamlined member state.',
  },
  SC: {
    code: 'SC',
    name: 'South Carolina',
    authority: 'South Carolina Department of Revenue',
    url: 'https://dor.sc.gov/',
    lookupUrl: 'https://dor.sc.gov/tax/sales-and-use',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The South Carolina retail licence / sales tax number (Form ST-8A).',
    notes: 'South Carolina’s resale certificate is Form ST-8A and cites the retail licence number.',
  },
  SD: {
    code: 'SD',
    name: 'South Dakota',
    authority: 'South Dakota Department of Revenue',
    url: 'https://dor.sd.gov/',
    lookupUrl: 'https://dor.sd.gov/businesses/taxes/sales-use-tax/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The South Dakota sales tax licence number.',
    notes: 'South Dakota is a Streamlined member state.',
  },
  TN: {
    code: 'TN',
    name: 'Tennessee',
    authority: 'Tennessee Department of Revenue',
    url: 'https://www.tn.gov/revenue.html',
    lookupUrl: 'https://www.tn.gov/revenue/taxes/sales-and-use-tax.html',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Tennessee sales and use tax certificate number.',
    notes: 'Tennessee’s resale certificate cites the state sales and use tax certificate of registration.',
  },
  TX: {
    code: 'TX',
    name: 'Texas',
    authority: 'Texas Comptroller of Public Accounts',
    url: 'https://comptroller.texas.gov/',
    lookupUrl: 'https://comptroller.texas.gov/taxes/sales/faq/resale.php',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    // The Comptroller publishes the eleven-digit Texas taxpayer number, and that is the
    // number a resale certificate carries. Advisory only: an out-of-state buyer may
    // legitimately present another state's number on a Texas resale certificate.
    numberPattern: '^\\d{11}$',
    numberHint: 'The eleven-digit Texas taxpayer number printed on the resale certificate.',
    notes:
      'Texas does not issue a separate "resale certificate number": a buyer’s sales tax permit / taxpayer number is what the certificate cites, and the Comptroller’s resale FAQ is the authority a reviewer reads.',
  },
  UT: {
    code: 'UT',
    name: 'Utah',
    authority: 'Utah State Tax Commission',
    url: 'https://tax.utah.gov/',
    lookupUrl: 'https://tax.utah.gov/sales/',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Utah sales tax licence / registration number.',
    notes: 'Utah’s exemption certificate is Form TC-721.',
  },
  VT: {
    code: 'VT',
    name: 'Vermont',
    authority: 'Vermont Department of Taxes',
    url: 'https://tax.vermont.gov/',
    lookupUrl: 'https://tax.vermont.gov/business/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Vermont sales tax account number.',
    notes: 'Vermont is a Streamlined member state.',
  },
  VA: {
    code: 'VA',
    name: 'Virginia',
    authority: 'Virginia Department of Taxation',
    url: 'https://www.tax.virginia.gov/',
    lookupUrl: 'https://www.tax.virginia.gov/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Virginia sales and use tax certificate number (Form ST-10).',
    notes: 'Virginia’s resale certificate is Form ST-10.',
  },
  WA: {
    code: 'WA',
    name: 'Washington',
    authority: 'Washington State Department of Revenue',
    url: 'https://dor.wa.gov/',
    lookupUrl: 'https://dor.wa.gov/taxes-rates/retail-sales-tax/reseller-permits',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Washington reseller permit number.',
    notes: 'Washington issues reseller permits that expire; a reviewer should check the permit’s business name and expiry.',
  },
  WV: {
    code: 'WV',
    name: 'West Virginia',
    authority: 'West Virginia State Tax Department',
    url: 'https://tax.wv.gov/',
    lookupUrl: 'https://tax.wv.gov/Business/SalesAndUseTax/Pages/SalesAndUseTax.aspx',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The West Virginia sales tax account number.',
    notes: 'West Virginia’s resale certificate is Form F0003.',
  },
  WI: {
    code: 'WI',
    name: 'Wisconsin',
    authority: 'Wisconsin Department of Revenue',
    url: 'https://www.revenue.wi.gov/',
    lookupUrl: 'https://www.revenue.wi.gov/Pages/FAQS/pcs-sales.aspx',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'STREAMLINED_EXEMPTION_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Wisconsin seller’s permit number (Form S-211).',
    notes: 'Wisconsin’s exemption certificate is Form S-211.',
  },
  WY: {
    code: 'WY',
    name: 'Wyoming',
    authority: 'Wyoming Department of Revenue',
    url: 'https://revenue.wyo.gov/',
    lookupUrl: 'https://revenue.wyo.gov/tax-information/sales-and-use-tax',
    stateSalesTax: true,
    accepted: ['STATE_RESALE_CERTIFICATE', 'MTC_UNIFORM_CERTIFICATE'],
    numberHint: 'The Wyoming sales tax licence number.',
    notes: 'Wyoming’s resale certificate cites the state sales tax licence number.',
  },
};

/** Every supported state code, alphabetically, plus DC. */
export const US_STATE_CODES: string[] = Object.keys(STATE_AUTHORITIES).sort();

/** The registry entry for a code, or null when the code is not a supported U.S. state. */
export function stateAuthority(code: unknown): StateAuthority | null {
  if (typeof code !== 'string') return null;
  const key = code.trim().toUpperCase();
  return STATE_AUTHORITIES[key] ?? null;
}

/** True when applications from this state can be reviewed at all. */
export function isSupportedState(code: unknown): boolean {
  return stateAuthority(code) !== null;
}

/**
 * Does this state have a separate resale certificate at all?
 *
 * False for the four no-sales-tax states (and Alaska's local system), where the
 * applicant is asked for a signed exemption statement instead. The portal does not
 * refuse those applications — a buyer there can still be a wholesale customer — it
 * just says plainly that the certificate step is a review, not a check.
 */
export function requiresResaleCertificate(code: unknown): boolean {
  const state = stateAuthority(code);
  return Boolean(state?.stateSalesTax);
}
