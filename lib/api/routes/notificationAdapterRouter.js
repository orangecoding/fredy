/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import logger from '../../services/logger.js';

const notificationAdapterList = fs.readdirSync('./lib//notification/adapter').filter((file) => file.endsWith('.js'));
const notificationAdapter = await Promise.all(
  notificationAdapterList.map(async (pro) => {
    return await import(`../../notification/adapter/${pro}`);
  }),
);

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function notificationAdapterPlugin(fastify) {
  fastify.get('/', async () => {
    return notificationAdapter.map((adapter) => adapter.config);
  });

  fastify.post('/try', async (request, reply) => {
    const { id, fields } = request.body;
    const adapter = notificationAdapter.find((adapter) => adapter.config.id === id);
    if (adapter == null) {
      return reply.code(404).send();
    }
    const notificationConfig = [];
    const notificationObject = {};
    Object.keys(fields).forEach((key) => {
      notificationObject[key] = fields[key].value;
    });
    notificationConfig.push({
      fields: { ...notificationObject },
      enabled: true,
      id,
    });
    try {
      await adapter.send({
        serviceName: 'TestCall',
        newListings: [
          {
            address: 'Heidestrasse 17, 51147 Köln',
            description: exampleDescription,
            id: '1',
            imageUrl: 'https://placehold.co/600x400/png',
            price: '1.000 €',
            size: '76 m²',
            title: 'Stilvolle gepflegte 3-Raum-Wohnung mit gehobener Innenausstattung',
            url: 'https://www.orange-coding.net',
          },
        ],
        notificationConfig,
        jobKey: 'TestJob',
      });
      return reply.send();
    } catch (Exception) {
      logger.error('Error during notification adapter test:', Exception);
      return reply.code(500).send({ error: String(Exception) });
    }
  });
}

const exampleDescription = `
Wohnungstyp: Etagenwohnung
Nutzfläche: 76 m²
Etage: 2 von 3
Schlafzimmer: 1
Badezimmer: 1
Bezugsfrei ab: 1.4.2026
Haustiere: Nein
Garage/Stellplatz: Tiefgarage
Anzahl Garage/Stellplatz: 1
Kaltmiete (zzgl. Nebenkosten): 1.000 €
Preis/m²: 13,16 €/m²
Nebenkosten: 230 €
Heizkosten in Nebenkosten enthalten: Ja
Gesamtmiete: 1.230 €
Kaution: 3.000,00
Preis pro Parkfläche: 60 €
Baujahr: 2000
Objektzustand: Modernisiert
Qualität der Ausstattung: Gehoben
Heizungsart: Fernwärme
Energieausweistyp: Verbrauchsausweis
Energieausweis: liegt vor
Endenergieverbrauch: 72 kWh/(m²∙a)
Baujahr laut Energieausweis: 2000

Diese moderne 3-Zimmer-Wohnung liegt direkt neben einem Park und nur wenige Minuten von der S-Bahn-Haltestelle entfernt. Das Stadtzentrum sowie Freizeiteinrichtungen sind 1,5 km entfernt.

Die Wohnung ist ideal für Paare oder kleine Familien geeignet.

Ausstattung:
- neuer hochwertiger Bodenbelag (Holzoptik) in allen Räumen außer Bad/Küche
- sonniger Balkon (Süd)
- Tiefgaragenstellplatz
- Kellerabteil
- gepflegtes Mehrfamilienhaus

Die Küche ist vom Mieter nach eigenen Wünschen einzurichten.

Vermietung direkt vom Eigentümer - provisionsfrei!

Lage:
• Park: 1 Minute zu Fuß
• S-Bahn Station: 2 Minuten zu Fuß
• Supermärkte, Restaurants, täglicher Bedarf in der Nähe
• Gute Anbindung Richtung Großstadt und Flughafen
`;
