import { existsSync, readFileSync } from 'fs';
import { Auth } from '@vonage/auth';

export const privateKey = existsSync(process.env.VONAGE_PRIVATE_KEY)
  ? readFileSync(process.env.VONAGE_PRIVATE_KEY)
  : process.env.VONAGE_PRIVATE_KEY || process.env.VCR_PRIVATE_KEY;

/**
 *
 * Checks if we are running in VCR
 * @return {Boolean} True if we are running in VCR
 */
export const isVCR = () => {
  return ~~process.env.VCR_PORT;
};

export const getVCRPort = () => {
  return process.env.VCR_PORT || process.env.PORT;
};

export const getVCRAuth = () => {
  const data = {
    apiKey: process.env.VONAGE_API_KEY || process.env.VCR_API_ACCOUNT_ID,
    apiSecret: process.env.VONAGE_API_SECRET
      || process.env.VCR_API_ACCOUNT_SECRET,
    applicationId: process.env.VONAGE_APPLICATION_ID
      || process.env.API_APPLICATION_ID,
    privateKey: privateKey,
  }

  if (!data.privateKey.startsWith('---')) {
    data.privateKey = Buffer.from(data.privateKey, 'base64');
  }

  return new Auth(data);
}

export const getVCRAppliationId = () => process.env.VONAGE_APPLICATION_ID
|| process.env.API_APPLICATION_ID;

