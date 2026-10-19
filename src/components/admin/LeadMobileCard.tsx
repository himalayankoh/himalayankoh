'use client';

import { CaretDown, MapPin, Phone, PaperPlaneRight } from '@phosphor-icons/react';
import type { SavedLeadRecord } from '@/lib/leados/types';

/** A compact view of the same record and actions used by the desktop table. */
export function LeadMobileCard({ lead, selected, onSelect, onView, onOutreach }: {
  lead: SavedLeadRecord;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onOutreach: () => void;
}) {
  const score = lead.research?.qualification?.score ?? lead.opportunityScore;
  const location = [lead.city, lead.region].filter(Boolean).join(', ') || lead.address || 'Location unavailable';
  const mapQuery = [lead.businessName, lead.address, lead.city, lead.region].filter(Boolean).join(', ');
  return (
    <article className="lead-mobile-card" data-selected={selected}>
      <div className="lead-mobile-heading">
        <label className="lead-select-target">
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${lead.businessName}`} />
        </label>
        <div className="lead-mobile-identity">
          <h3><button type="button" onClick={onView}>{lead.businessName}</button></h3>
          <p><MapPin size={13} aria-hidden="true" />{location}</p>
        </div>
      </div>
      <div className="lead-mobile-meta">
        <span>{lead.category || 'Uncategorized'}</span>
        <span className="lead-status">{(lead.status || 'new').replaceAll('_', ' ')}</span>
        <span className="lead-match">{typeof score === 'number' ? `${score}% match` : 'Not scored'}</span>
      </div>
      <div className="lead-mobile-actions">
        <button type="button" className="workspace-primary" onClick={onView}>View details</button>
        <details className="lead-secondary-actions">
          <summary>Actions <CaretDown size={14} aria-hidden="true" /></summary>
          <div>
            <button type="button" onClick={onOutreach}><PaperPlaneRight size={16} />Outreach</button>
            {lead.phone && <a href={`tel:${lead.phone}`}><Phone size={16} />Call</a>}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Map</a>
          </div>
        </details>
      </div>
    </article>
  );
}
