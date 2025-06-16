export const DEFAULT_CONFIG = {
            'interval': '60',
            'port': 9998,
            'workingHours': {'from': '', 'to': ''},
            'demoMode': false,
            'analyticsEnabled': null,
            'chatgpt': {
                'apiKey': '',
                'enabled': false
            },
            'googleMaps': {
                'apiKey': ''
            },
            'defaultCustomFields': [
                {
                    'id': 1,
                    'name': 'title',
                    'questionPrompt': 'What is the title of the listing exactly as it appears? (e.g., "Top Altbau 5-Zimmer-Wohnung in Berlin-Mitte")',
                    'answerLength': 'one_statement'
                },
                {
                    'id': 2,
                    'name': 'baseRent',
                    'questionPrompt': 'What is the Kaltmiete (base rent without utilities)? (e.g., "1230")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 3,
                    'name': 'totalRent',
                    'questionPrompt': 'What is the Warmmiete (total rent including utilities)? (e.g., "1450")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 4,
                    'name': 'area',
                    'questionPrompt': 'What is the area in square meters? (e.g., "74")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 5,
                    'name': 'rooms',
                    'questionPrompt': 'What is the total number of rooms? (e.g., "3")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 6,
                    'name': 'floor',
                    'questionPrompt': 'What is the floor level? (e.g., "2")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 7,
                    'name': 'moveInDate',
                    'questionPrompt': 'When is the flat available for move-in? (e.g., "sofort", "01.07.2025")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 8,
                    'name': 'address',
                    'questionPrompt': 'What is the complete address including street and city? (e.g., "Musterstraße 1, Berlin")',
                    'answerLength': 'one_statement'
                },
                {
                    'id': 9,
                    'name': 'bedrooms',
                    'questionPrompt': 'How many bedrooms are there? (e.g., "2")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 10,
                    'name': 'bathrooms',
                    'questionPrompt': 'How many bathrooms are there? (e.g., "1")',
                    'answerLength': 'one_word'
                },
                {
                    'id': 11,
                    'name': 'highlight',
                    'questionPrompt': 'What is the one unique highlight of the flat? (e.g., "The flat has a large balcony to the south")',
                    'answerLength': 'one_statement'
                }
            ]
        };