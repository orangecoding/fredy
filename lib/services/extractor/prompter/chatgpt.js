import { config } from '../../../utils.js';
import { generateSystemPrompt, generateUserPrompt, CHATGPT_CONFIG } from './prompts.js';

class ChatGPTExtractor {
  static async extract(parsedData, customFields, jobId) {
    try {
      // Check if ChatGPT is enabled and API key is configured
      if (!config.chatgpt?.enabled) {
        console.warn('ChatGPT integration is disabled');
        return {};
      }
      if (!config.chatgpt?.apiKey) {
        console.error('ChatGPT API key is not configured');
        return {};
      }

      const systemPrompt = generateSystemPrompt(customFields, jobId);
      let userPrompt = generateUserPrompt(parsedData);
      let lastError = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const response = await this._callChatGPT(systemPrompt, userPrompt);
          return this._parseResponse(response);
        } catch (error) {
          lastError = error;
          attempts++;
          
          if (attempts >= maxAttempts) {
            console.error(`Failed to parse ChatGPT response after ${maxAttempts} attempts:`, lastError.message);
            throw new Error(`Failed to get valid JSON response after ${maxAttempts} attempts: ${lastError.message}`);
          }
          
          console.log(`Attempt ${attempts} failed, retrying with error context:`, error.message);
          userPrompt = generateUserPrompt(parsedData, error.message);
        }
      }
    } catch (error) {
      console.error('Error in ChatGPT extraction:', error);
      throw error;
    }
  }

  static async _callChatGPT(systemPrompt, userPrompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.chatgpt.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`ChatGPT API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  static _parseResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      console.error('Error parsing ChatGPT response:', error);
      throw error;
    }
  }
}

export { ChatGPTExtractor };