/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Italian application letters, for Casa.it, Subito, Tecnocasa, Tecnorete and Italian Idealista.
 *
 * Italy is the second-largest country group among Fredy's providers, which is why it is shipped
 * and Spain and Portugal are not.
 *
 * Nothing here inflects for the writer's gender - the profile does not hold one, so `Sarei lieto`
 * and friends are avoided in favour of forms that work for anybody.
 *
 * See `de.js` for why every fact sits on a line of its own.
 */

const rent = `Oggetto: Candidatura per {{listing.title|il vostro annuncio}}

{{contact.salutation}},

Ho visto con grande interesse il vostro annuncio e vorrei candidarmi per questo immobile.

Immobile: {{listing.title}}
Indirizzo: {{listing.address}}
Canone: {{listing.price}}
Superficie: {{listing.size}}
Locali: {{listing.rooms}}

Nome: {{applicant.fullName}}
Indirizzo: {{applicant.address}}
Telefono: {{applicant.phone}}
E-mail: {{applicant.email}}
Nucleo familiare: {{applicant.household}}
Professione: {{applicant.occupation}}
Posizione: {{applicant.employmentType}}
Datore di lavoro: {{applicant.employer}}
Reddito netto mensile: {{applicant.netIncome}}
Animali domestici: {{applicant.pets}}
Disponibile dal: {{applicant.moveInDate}}

{{applicant.smoker}}.
{{applicant.schufa}}.
{{applicant.guarantor}}.

{{applicant.extra}}

Vorrei visitare l'immobile. Su richiesta posso fornire in anticipo la documentazione reddituale e le referenze.

Cordiali saluti
{{applicant.fullName}}

Annuncio: {{listing.link}}`;

/** Una richiesta di visita, non un'autocertificazione. See the note on `buy` in `de.js`. */
const buy = `Oggetto: Richiesta di visita per {{listing.title|il vostro annuncio}}

{{contact.salutation}},

Il vostro annuncio ha catturato il mio interesse e vorrei fissare una visita.

Immobile: {{listing.title}}
Indirizzo: {{listing.address}}
Prezzo richiesto: {{listing.price}}
Superficie: {{listing.size}}
Locali: {{listing.rooms}}

Nome: {{applicant.fullName}}
Indirizzo: {{applicant.address}}
Telefono: {{applicant.phone}}
E-mail: {{applicant.email}}
Consegna desiderata dal: {{applicant.moveInDate}}

{{applicant.extra}}

Il finanziamento è già definito e posso fornire a breve una conferma della mia banca. Vi prego di indicarmi le date disponibili per una visita.

Cordiali saluti
{{applicant.fullName}}

Annuncio: {{listing.link}}`;

export default { rent, buy };
