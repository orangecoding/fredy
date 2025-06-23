import { config } from '../../../utils/utils.js';
import { generateSystemPrompt, generateUserPrompt, CHATGPT_CONFIG } from './prompts.js';
import logger from '../../../utils/logger.js';

class ChatGPTExtractor {
  static async extract(parsedData, customFields, jobId) {
    let summary = {
      attempts: 0,
      success: false,
      error: null,
      jobId,
      customFieldCount: customFields.length,
    };
    try {
      // Check if ChatGPT is enabled and API key is configured
      if (!config.chatgpt?.enabled) {
        logger.info('[ChatGPTExtractor] ChatGPT integration is disabled');
        return {};
      }
      if (!config.chatgpt?.apiKey) {
        logger.error('[ChatGPTExtractor] ChatGPT API key is not configured');
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
          const extractedFields = {};
          
          // Replace the field names with the field ids
          this._parseResponse(response).array.forEach(element => {
            const key = customFields.find(field => field.name === element.name)?.id;
            if (key) {
              extractedFields[key] = element.value;
            } else {
              logger.warn(`[ChatGPTExtractor] Field ${element.name} not found in custom fields [${customFields.map(field => field.name).join(', ')}]`);
            }
          });
          summary.attempts = attempts + 1;
          summary.success = true;
          return extractedFields;
        } catch (error) {
          lastError = error;
          attempts++;
          summary.attempts = attempts;
          summary.error = error.message;
          if (attempts >= maxAttempts) {
            logger.error(`[ChatGPTExtractor] Failed to parse ChatGPT response after ${maxAttempts} attempts for jobId=${jobId}: ${lastError.message}`);
            throw new Error(`Failed to get valid JSON response after ${maxAttempts} attempts: ${lastError.message}`);
          }
          logger.warn(`[ChatGPTExtractor] Attempt ${attempts} failed for jobId=${jobId}, retrying with error context: ${error.message}`);
          userPrompt = generateUserPrompt(parsedData, error.message);
        }
      }
    } catch (error) {
      summary.success = false;
      summary.error = error.message;
      logger.error(`[ChatGPTExtractor] Error in ChatGPT extraction for jobId=${jobId}: ${error.message}`);
      throw error;
    } finally {
      // Log a summary at the end of the extraction attempt
      if (!summary.success) {
        logger.info(`[ChatGPTExtractor] Extraction summary for jobId=${jobId}: attempts=${summary.attempts}, success=${summary.success}, error=${summary.error}, customFields=${summary.customFieldCount}`);
      }
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
      logger.error('[ChatGPTExtractor] Error parsing ChatGPT response:', error);
      throw error;
    }
  }
}

export { ChatGPTExtractor };