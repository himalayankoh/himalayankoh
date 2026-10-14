export type ProductInterest = 'horse_salt' | 'livestock_salt' | 'culinary_salt' | 'bulk_wholesale' | 'private_label';
export interface SourceEvidence { url: string; retrievedAt: string; kind: string; status: 'verified' | 'inferred' | 'not_found'; excerpt?: string; }
export interface LeadResearch {
  publicCompanyName?: string;
  sources?: SourceEvidence[];
  contactPage?: string | null;
  lastVerifiedAt?: string;
  productInterest?: ProductInterest;
  assignedOwner?: string;
  nextFollowUp?: string;
  requestedQuantity?: string;
  packagingPreference?: string;
  buyerQuestions?: string;
  quoteRequired?: boolean;
  qualification?: { score: number; reasons: string[]; breakdown: Record<string, number>; interest: ProductInterest; qualified: boolean };
  errors?: string[];
}
export interface NormalizedLead {
  businessName: string;
  category: string;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  emailSource?: 'discovered_osm' | 'company_website' | 'manually_entered' | 'unverified';
  facebook?: string | null;
  instagram?: string | null;
  googleMapsUrl?: string | null;
  research?: LeadResearch;
  latitude: number | null;
  longitude: number | null;
  osmType: string | null;
  osmId: string | null;
  osmUrl: string | null;
  dataSource: string;
}

export interface LeadSearchInput {
  category: string;
  location: string;
  locations?: string[];
  sources?: string[];
  /** Free-text keyword ("tack shop", "organic feed") — Nominatim name-index half. */
  keyword?: string;
  maxResults?: number;
  requireWebsite?: boolean;
  requirePhone?: boolean;
  nodeOnly?: boolean;
  radiusKm?: number;
  productInterest?: ProductInterest;
  requireEmail?: boolean;
  excludeSaved?: boolean;
  excludeContacted?: boolean;
  searchDepth?: number;
  country?: string;
  state?: string;
  city?: string;
  wholesaleOnly?: boolean;
  privateLabelOnly?: boolean;
}

export interface ProjectFitResult {
  score: number;
  reasons: string[];
  outreachAngles: string[];
  method: 'deterministic' | 'ai';
}

export interface OpportunityScoreResult {
  /** Compatibility value: transparent commercial priority, not opportunity from missing data. */
  score: number;
  signals: string[];
  icpFit: number;
  reachability: number;
  dataConfidence: number;
  commercialPriority: number;
}

export interface ScoredLead extends NormalizedLead {
  opportunityScore: number;
  opportunitySignals: string[];
  evidence?: {
    icpFit: number;
    reachability: number;
    dataConfidence: number;
    commercialPriority: number;
    reasons: string[];
  };
  projectFit?: ProjectFitResult;
  matchedCategories?: string[];
  locked?: boolean;
  alreadySaved?: boolean;
}

export interface SearchDiagnostics {
  geocodeSuccess: boolean;
  resolvedLocation: string | null;
  boundingArea: { lat: number; lon: number; radiusKm: number } | null;
  categoriesQueried: string[];
  perCategory?: Record<string, { raw: number; normalized: number; error: string | null }>;
  /** Per-source outcome: `overpass` (map data) and, when a keyword was given, `keyword`. */
  sources?: Record<string, { raw: number; normalized: number; error: string | null }>;
  rawResultsCount: number;
  normalizedCount: number;
  duplicatesRemoved: number;
  finalResultsCount?: number;
  aiAnalysisCount?: number;
  aiFailures?: number;
  responseTimeMs: number;
  errorSummary: string | null;
  queuedJobId?: string;
  batchPersistence?: {
    savedCount: number;
    failedCount: number;
    errors: string[];
  };
}

export interface LeadOSProject {
  id: string;
  workspaceId: string;
  name: string;
  logoUrl?: string | null;
  website?: string | null;
  shortDescription?: string | null;
  productService?: string | null;
  targetCustomerDescription?: string | null;
  industries: string[];
  businessCategories: string[];
  preferredLocations: string[];
  countries: string[];
  targetBusinessSize?: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  idealCustomerProfile?: string | null;
  notes?: string | null;
  defaultAiPrompt?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  leadCount?: number;
}

export interface LeadOSCategoryMapping {
  id: string;
  categoryName: string;
  osmTags: Array<{ key: string; value: string }>;
  aliases: string[];
  relatedCategories: string[];
  enabled: boolean;
}

export interface LeadOSScoreWeight {
  id: string;
  signalKey: string;
  signalName: string;
  weight: number;
  description: string | null;
}

export interface SavedLeadRecord {
  id: string;
  workspaceId: string;
  businessName: string;
  category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  emailSource?: 'discovered_osm' | 'company_website' | 'manually_entered' | 'unverified';
  research?: LeadResearch;
  dataSource?: string;
  osmType?: string | null;
  osmId?: string | null;
  opportunityScore: number | null;
  opportunitySignals: string[] | null;
  evidence?: {
    icpFit: number;
    reachability: number;
    dataConfidence: number;
    commercialPriority: number;
    reasons: string[];
  } | null;
  status: string;
  starred: boolean;
  tags: string[] | null;
  notes: string | null;
  osmUrl: string | null;
  discoveredAt: string;
  createdAt: string;
  projects?: Array<{
    leadId: string;
    projectId: string;
    projectName: string;
    projectFitScore: number | null;
  }>;
}
