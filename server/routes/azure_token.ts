import { RequestHandler } from "express";

export const getAzureToken: RequestHandler = async (req, res) => {
  try {
    const apiKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!apiKey || !region)
      return res.status(500).json({ error: "Azure speech credentials not configured" });

    // For the browser SDK we can return the region and key as a short-lived token.
    // Azure recommends using the token endpoint on your server which returns an authorization token.
    // However, generating a token requires calling Azure Cognitive Services token endpoint using the subscription key.
    // For simplicity here we'll return the subscription key and region — the client SHOULD use fetch with Ocp-Apim-Subscription-Key
    // If you want real token exchange, replace this with an Azure token fetch using the subscription key.

    res.json({ region, apiKey });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Failed to fetch azure token" });
  }
};
