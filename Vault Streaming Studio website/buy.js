/**
 * VaultStudio Lifetime Pro checkout.
 * Renders PayPal Smart Buttons, drives the payments Worker (create + capture),
 * and reveals the key on success. Authoritative price/verification is server-side.
 */
(function () {
  const cfg = window.VAULTSTUDIO_PAYMENTS || {};
  const statusEl = document.getElementById('status-msg');
  const buyView = document.getElementById('buy-view');
  const successView = document.getElementById('success-view');
  const keyBox = document.getElementById('key-box');
  const copyBtn = document.getElementById('copy-btn');

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status-msg' + (text ? ' ' + (kind || 'info') : '');
  }

  function isConfigured() {
    return (
      cfg.workerUrl &&
      !cfg.workerUrl.includes('REPLACE') &&
      cfg.paypalClientId &&
      !cfg.paypalClientId.includes('REPLACE')
    );
  }

  function showSuccess(key, alreadyIssued) {
    keyBox.textContent = key;
    buyView.classList.add('is-hidden');
    successView.classList.add('is-active');
    if (alreadyIssued) {
      document.getElementById('success-sub').textContent =
        "This order's key:";
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(keyBox.textContent || '');
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy key'), 1800);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  });

  async function createOrder() {
    const res = await fetch(cfg.workerUrl + '/create-order', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.id) throw new Error('Could not start checkout. Please try again.');
    return data.id;
  }

  async function onApprove(data) {
    setStatus('Confirming your payment…', 'info');
    const res = await fetch(cfg.workerUrl + '/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderID: data.orderID }),
    });
    const result = await res.json();
    if (result.error === 'out_of_stock') {
      setStatus(
        'Payment received - keys are briefly sold out, so yours will be emailed shortly. ' +
          'Contact vaultkeeperirl@gmail.com if it does not arrive.',
        'info'
      );
      return;
    }
    if (!res.ok || !result.key) {
      setStatus(
        'Payment captured but the key could not be shown. Check your email - if it does ' +
          'not arrive, contact vaultkeeperirl@gmail.com with your PayPal order ID.',
        'error'
      );
      return;
    }
    showSuccess(result.key, result.alreadyIssued);
  }

  function loadPayPalSdk() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src =
        'https://www.paypal.com/sdk/js?client-id=' +
        encodeURIComponent(cfg.paypalClientId) +
        '&currency=USD&intent=capture';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load PayPal.'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (!isConfigured()) {
      setStatus(
        'Checkout is not configured yet (set workerUrl + paypalClientId in payments-config.js).',
        'error'
      );
      return;
    }
    try {
      await loadPayPalSdk();
      window.paypal
        .Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
          createOrder: () => createOrder(),
          onApprove: (data) => onApprove(data),
          onCancel: () => setStatus('Checkout cancelled.', 'info'),
          onError: () =>
            setStatus('Something went wrong with PayPal. Please try again.', 'error'),
        })
        .render('#paypal-buttons');
    } catch (err) {
      setStatus(String(err.message || err), 'error');
    }
  }

  init();
})();
