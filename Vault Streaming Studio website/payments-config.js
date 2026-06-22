/**
 * Public payments config for the VaultStudio site. These values are NOT secret
 * (the PayPal client-id is public and the Worker URL is just an endpoint).
 * Fill them in after deploying payments-worker and creating the PayPal app.
 */
window.VAULTSTUDIO_PAYMENTS = {
  // Your deployed Cloudflare Worker URL (no trailing slash).
  workerUrl: 'https://vaultstudio-payments.vaultstudio.workers.dev',
  // PayPal REST app Client ID (public). Use the SANDBOX client-id while testing.
  paypalClientId: 'Af82nHM-4C1QPDimx-cNKjZKaHZeL3OWbAn99bJSkmg8I_oZ4msqPVUUA203Hs6iWwn3u6PXDDAvbqkq',
  // Display price (the authoritative amount is enforced server-side in the Worker).
  priceUsd: '19.99',
};
