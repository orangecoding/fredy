/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * English application letters.
 *
 * Also the fallback for every country Fredy ships no letter for - Spain and Portugal reach Fredy
 * through Idealista, and an English letter any European agent can read beats a machine-translated
 * one nobody here could proofread.
 *
 * See `de.js` for why every fact sits on a line of its own.
 */

const rent = `Subject: Application for {{listing.title|your listing}}

{{contact.salutation}},

I am writing to apply for the property you have advertised.

Property: {{listing.title}}
Address: {{listing.address}}
Rent: {{listing.price}}
Living space: {{listing.size}}
Rooms: {{listing.rooms}}

Name: {{applicant.fullName}}
Address: {{applicant.address}}
Phone: {{applicant.phone}}
Email: {{applicant.email}}
Household: {{applicant.household}}
Occupation: {{applicant.occupation}}
Employment: {{applicant.employmentType}}
Employer: {{applicant.employer}}
Monthly net income: {{applicant.netIncome}}
Pets: {{applicant.pets}}
Available from: {{applicant.moveInDate}}

{{applicant.smoker}}.
{{applicant.schufa}}.
{{applicant.wbs}}.
{{applicant.guarantor}}.

{{applicant.extra}}

I would be glad to view the property at your convenience. Proof of income and references can be provided in advance on request.

Kind regards
{{applicant.fullName}}

Listing: {{listing.link}}`;

/** A viewing request, not a self-disclosure. See the note on `buy` in `de.js`. */
const buy = `Subject: Viewing request for {{listing.title|your listing}}

{{contact.salutation}},

Your listing caught my attention and I would like to arrange a viewing.

Property: {{listing.title}}
Address: {{listing.address}}
Asking price: {{listing.price}}
Living space: {{listing.size}}
Rooms: {{listing.rooms}}

Name: {{applicant.fullName}}
Address: {{applicant.address}}
Phone: {{applicant.phone}}
Email: {{applicant.email}}
Preferred handover from: {{applicant.moveInDate}}

{{applicant.extra}}

Financing is in place and I can supply written confirmation from my bank at short notice. Please let me know which viewing dates would suit you.

Kind regards
{{applicant.fullName}}

Listing: {{listing.link}}`;

export default { rent, buy };
