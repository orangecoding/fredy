# Date degli annunci

`created_at` indica quando Fredy registra l'annuncio.
`published_at` indica la data fornita dal portale, in millisecondi Unix.
La data fornita puo' indicare la pubblicazione oppure l'ultimo aggiornamento.
La tabella identifica la fonte usata da ciascun provider.

| Provider | Fonte | Significato |
|---|---|---|
| Immowelt | `metadata.creationDate` | Creazione dell'annuncio |
| Flatfox | `published` | Pubblicazione dell'annuncio |
| willhaben | `PUBLISHED` | Pubblicazione dell'annuncio |
| Engel & Voelkers | `publishedAt` | Pubblicazione dell'annuncio |
| IMAXX | `WebPage.datePublished` dell'URL dell'annuncio | Pubblicazione della pagina dell'annuncio |

Immowelt, Flatfox e willhaben leggono la data dai risultati della ricerca.
Engel & Voelkers legge la data dai risultati o dal dettaglio, quando il portale la espone.
IMAXX legge la data dal dettaglio e verifica che l'URL appartenga all'annuncio.
Il recupero dal dettaglio richiede l'abilitazione dei dettagli per il provider.
Questi provider ignorano le date di aggiornamento, trasferimento e cache della pagina.
I timestamp ISO richiedono un fuso orario esplicito.
Il parser scarta i valori mancanti, invalidi e relativi, come "vor 3 Tagen".

La visualizzazione e l'ordinamento usano `created_at` quando `published_at` manca.
Questa integrazione legge le date dei nuovi annunci e non aggiunge un recupero per gli annunci gia' archiviati.
