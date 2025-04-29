# Vonage Trivia

A fun trivia game using GPT to generate questions and Vonage API's to get help from other developers

## Installation

### Requirements

- Node 16 or higher
- ChatGPT ApiKey
- A Vonage Application that has numbers for receiving SMS and can make Phone calls
- NGrok (if running locally)
- MongoDB instance

### Environment Variables

Rename `env.dist` and fill in the correct environment variables.

- `PORT` Port to run web server on
- `VONAGE_API_KEY` API Key
- `VONAGE_API_SECRET` API Secret
- `VONAGE_PRIVATE_KEY` The Private key for the application (should be the contents of the file)
- `VONAGE_APPLICATION_ID` Vonage Application ID
- `OPENAI_API_KEY` ChatGPT API key
- `FROM_NUMBER` Number to send text messages from
- `AIRTABLE_TOKEN` AirTable Token

## Commands

- `npm run start` Start the web server
- `npm run watch` Watch changes and restart the web server (use for dev)
- `npm run livereload` Set up live reload (use for dev)

## Notes

- SMS Messages will be streamed into a file (`particpants.txt`)
- When using the `Text the Audience` feature, only the active game will be updated
