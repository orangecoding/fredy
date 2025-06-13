import * as jobStorage from '../../storage/jobStorage.js';

export const generateSystemPrompt = (customFields, jobId) => {
  // Get job configuration if jobId is provided
  const job = jobId ? jobStorage.getJob(jobId) : null;
  const jobCustomFields = job?.customFields || customFields;

  const customFieldsDescription = jobCustomFields.map(field => {
    const lengthGuidance = {
      'one_word': 'one word',
      'one_sentence': 'one short statement',
      'several_sentences': '2-3 sentences'
    }[field.answerLength];

    return `- '${field.name}': ${field.questionPrompt} (${lengthGuidance})`;
  }).join('\n');

  const customFieldsJSON = jobCustomFields
    .map(field => `  "${field.name}": ""`)
    .join(',\n');

  return `You are a precise information extraction assistant. Your sole task is to extract specific values from a given real estate listing text. 

You must return only a valid JSON object that matches the template exactly as provided below — no explanations, no greetings, no analysis, and no additional output of any kind.

Guidelines:
- Only extract the value — no units, no labels, no extra characters unless they are part of the original data.
- If a field is not present or cannot be confidently extracted, set it to an empty string \`""\`.
- Use one word, one short statement/sentence or several sentences per field, as specified.
- The output must exactly match the structure and formatting of the JSON template below — nothing more, nothing less.

Here is a description of the fields you need to extract:
- 'title': Title of the listing exactly as it is in the listing (one statement, e.g., "Top Altbau 5-Zimmer-Wohnung in Berlin-Mitte")
- 'baseRent': Kaltmiete without utilities (one word, e.g., "1234")
- 'totalRent': Warmmiete incl. utilities (one word, e.g., "1450")
- 'area': Area in square meters (one word, e.g., "74")
- 'rooms': Total number of rooms (one word, e.g., "3")
- 'floor': Floor level (one word, e.g., "2")
- 'moveInDate': When the flat is available (one word, e.g., "sofort", "01.07.2025")
- 'address': Street and city (one statement, e.g., "Musterstraße 1, Berlin")
- 'bedrooms': Number of bedrooms (one word, e.g., "2")
- 'bathrooms': Number of bathrooms (one word, e.g., "1")
${customFieldsDescription}

Expected JSON output template - please make sure to strictly follow this template (no json at the beginning, no additional fields/properties, nothing before or after the {}):

{
  "title": "",
  "baseRent": "",
  "totalRent": "",
  "area": "",
  "rooms": "",
  "floor": "",
  "moveInDate": "",
  "address": "",
  "bedrooms": "",
  "bathrooms": "",
${customFieldsJSON}
}
`;
};

export const generateUserPrompt = (context, errorMessage = null) => {
  let prompt = `Please extract the following fields from the listing text:\n\n${context}`;
  
  if (errorMessage) {
    prompt += `\n\nIMPORTANT: The previous response caused this error: "${errorMessage}". Please ensure your response is valid JSON and does not cause this error.`;
  }
  
  return prompt;
};

export const CHATGPT_CONFIG = {
  model: "gpt-3.5-turbo",
  temperature: 0.3,
  max_tokens: 500
}; 