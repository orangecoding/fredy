/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * German application letters. Also the letters Austria and Switzerland get, which is why nothing
 * here names a credit register - the SCHUFA exists in neither, and the credit statement is carried
 * by `{{applicant.schufa}}`, whose phrase table words it neutrally.
 *
 * Written one fact per line on purpose: the renderer drops a line whose placeholders all resolved
 * empty, so a profile that never named an employer loses that line instead of leaving
 * `Arbeitgeber:` standing on its own. The prose never interpolates a value, so no sentence can be
 * left half-finished by a field nobody filled in; the only fallback is the subject, which has to
 * survive a listing that arrived without a title.
 */

const rent = `Betreff: Bewerbung für {{listing.title|Ihr Inserat}}

{{contact.salutation}},

mit großem Interesse habe ich Ihr Inserat gesehen und möchte mich hiermit darauf bewerben.

Objekt: {{listing.title}}
Adresse: {{listing.address}}
Miete: {{listing.price}}
Wohnfläche: {{listing.size}}
Zimmer: {{listing.rooms}}

Name: {{applicant.fullName}}
Anschrift: {{applicant.address}}
Telefon: {{applicant.phone}}
E-Mail: {{applicant.email}}
Haushalt: {{applicant.household}}
Beruf: {{applicant.occupation}}
Beschäftigung: {{applicant.employmentType}}
Arbeitgeber: {{applicant.employer}}
Monatliches Nettoeinkommen: {{applicant.netIncome}}
Haustiere: {{applicant.pets}}
Einzug möglich ab: {{applicant.moveInDate}}

{{applicant.smoker}}.
{{applicant.schufa}}.
{{applicant.wbs}}.
{{applicant.guarantor}}.

{{applicant.extra}}

Über eine Einladung zur Besichtigung würde ich mich sehr freuen. Selbstauskunft und Einkommensnachweise reiche ich auf Wunsch gerne vorab ein.

Mit freundlichen Grüßen
{{applicant.fullName}}

Inserat: {{listing.link}}`;

/**
 * A purchase enquiry asks for a viewing. It deliberately carries no occupation, employer, household
 * or income: those are a seller's agent's business after a viewing, not before one, and handing
 * them over up front costs the buyer their negotiating position for nothing.
 */
const buy = `Betreff: Besichtigungsanfrage zu {{listing.title|Ihrem Inserat}}

{{contact.salutation}},

Ihr Inserat hat mein Interesse geweckt. Ich würde die Immobilie gerne besichtigen.

Objekt: {{listing.title}}
Adresse: {{listing.address}}
Kaufpreis: {{listing.price}}
Wohnfläche: {{listing.size}}
Zimmer: {{listing.rooms}}

Name: {{applicant.fullName}}
Anschrift: {{applicant.address}}
Telefon: {{applicant.phone}}
E-Mail: {{applicant.email}}
Gewünschte Übergabe ab: {{applicant.moveInDate}}

{{applicant.extra}}

Die Finanzierung ist geklärt, eine Finanzierungsbestätigung meiner Bank kann ich kurzfristig vorlegen. Bitte teilen Sie mir mögliche Besichtigungstermine mit.

Mit freundlichen Grüßen
{{applicant.fullName}}

Inserat: {{listing.link}}`;

export default { rent, buy };
