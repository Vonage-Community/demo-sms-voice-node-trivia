import dotenv from 'dotenv';
import OpenAIApi from 'openai';
import debug from 'debug';

dotenv.config();

const log = debug('@vonage.openai');

const openai = new OpenAIApi({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
});

/**
 * Call chat GPT
 * @param {string} messages
 * @return {Promise<string>}
 */
export const callGPT = async (
  messages,
) => {
  log('Calling ChatGPT');
  try {
    log(messages);

    const chatCompletion = await openai.chat.completions.create(
      {
        model: 'gpt-3.5-turbo-0125',
        temperature: 1.5,
        messages: messages,
        response_format: { type: 'json_object' },
      },
    );

    log('Call to GPT complete', JSON.stringify(chatCompletion, null, 2));
    const content = chatCompletion.choices[0].message.content;
    log(content);
    return content;
  } catch (error) {
    log(error);
    console.error('Failed to call GPT');
    console.error(error.message);
  }
};

