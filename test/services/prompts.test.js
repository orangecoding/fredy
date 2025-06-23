import { expect } from 'chai';
import esmock from 'esmock';
import { generateSystemPrompt, generateUserPrompt } from '../../lib/services/extractor/prompter/prompts.js';
import * as jobStorage from '../../lib/services/storage/jobStorage.js';

describe('Prompt Generation', () => {
  const mockCustomFields = [
    {
      id: '1',
      name: 'title',
      questionPrompt: 'Title of the listing exactly as it is in the listing',
      answerLength: 'one_statement'
    },
    {
      id: '2',
      name: 'baseRent',
      questionPrompt: 'Kaltmiete without utilities',
      answerLength: 'one_word'
    },
    {
      id: '3',
      name: 'highlight',
      questionPrompt: 'Key features or selling points of the property',
      answerLength: 'several_sentences'
    }
  ];

  let prompts;

  before(async () => {
    prompts = await esmock('../../lib/services/extractor/prompter/prompts.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: (jobId) => {
          if (jobId === 'test-job-id') {
            return {
              customFields: [
                {
                  id: '4',
                  name: 'customField',
                  questionPrompt: 'Custom field description',
                  answerLength: 'one_word'
                }
              ]
            };
          }
          return { customFields: [] };
        }
      }
    });
  });

  describe('generateSystemPrompt', () => {
    it('should generate system prompt with custom fields', () => {
      const prompt = prompts.generateSystemPrompt(mockCustomFields);
      
      // Check if all custom fields are included in the description
      mockCustomFields.forEach(field => {
        expect(prompt).to.include(field.name);
        expect(prompt).to.include(field.questionPrompt);
      });

      // Check if JSON template includes all fields
      mockCustomFields.forEach(field => {
        expect(prompt).to.include(`"${field.name}": ""`);
      });

      // Check if length guidance is properly mapped
      expect(prompt).to.include('one word');
      expect(prompt).to.include('one short statement');
      expect(prompt).to.include('2-3 sentences');
    });

    it('should use job custom fields when jobId is provided', () => {
      const jobId = 'test-job-id';
      const prompt = prompts.generateSystemPrompt(mockCustomFields, jobId);
      
      expect(prompt).to.include('customField');
      expect(prompt).to.include('Custom field description');
      expect(prompt).not.to.include('title'); // Should not contain default fields
    });

    it('should fallback to provided custom fields when job has none', () => {
      const jobId = 'non-existent-job';
      const prompt = prompts.generateSystemPrompt(mockCustomFields, jobId);
      
      mockCustomFields.forEach(field => {
        expect(prompt).to.include(field.name);
        expect(prompt).to.include(field.questionPrompt);
      });
    });
  });

  describe('generateUserPrompt', () => {
    it('should generate basic user prompt', () => {
      const context = 'Test listing text';
      const prompt = prompts.generateUserPrompt(context);
      
      expect(prompt).to.include(context);
      expect(prompt).not.to.include('IMPORTANT');
    });

    it('should include error message when provided', () => {
      const context = 'Test listing text';
      const errorMessage = 'Invalid JSON format';
      const prompt = prompts.generateUserPrompt(context, errorMessage);
      
      expect(prompt).to.include(context);
      expect(prompt).to.include('IMPORTANT');
      expect(prompt).to.include(errorMessage);
    });
  });
});