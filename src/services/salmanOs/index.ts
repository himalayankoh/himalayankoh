// HIMALAYAN KOH — SALMAN OS ADAPTER (server-side boundary)
//
// Himalayan Koh consumes Salman OS / SoSAi as its PRIMARY AI intelligence backend.
// This module is the ONLY place that talks to Salman OS. It is contract-gated
// and credential-safe (server env only).
//
// Do NOT import this module from browser code — it reads process.env and must
// stay server-side. The browser talks to Himalayan Koh's own /api/salman-os/*
// proxy routes instead.
// ============================================================================
export * from './types';
export {
  salmanOsStatus, getProjectStatus, getIntelligence, getJobs, runJob, pauseJob, resumeJob,
  CONTRACT_VERSION, CONTRACT_DOC_VERSION, CONTRACT_DOC_PATH, PROJECT_SLUG,
} from './contract';
