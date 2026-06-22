import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import type { LicenseInfo } from '../types';
import { Button } from './common/Button';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.lg};
  padding: ${tokens.spacing.lg};
`;

const StatusCard = styled.div<{ $isPro: boolean }>`
  padding: ${tokens.spacing.lg};
  border-radius: ${tokens.borderRadius.lg};
  border: 1px solid ${(p) => (p.$isPro ? tokens.colors.gold : tokens.colors.border)};
  background-color: ${(p) => (p.$isPro ? 'rgba(214, 162, 58, 0.08)' : tokens.colors.panel2)};
`;

const TierLabel = styled.div<{ $isPro: boolean }>`
  font-size: ${tokens.fontSize.lg};
  font-weight: ${tokens.fontWeight.bold};
  color: ${(p) => (p.$isPro ? tokens.colors.gold : tokens.colors.muted)};
  margin-bottom: ${tokens.spacing.xs};
`;

const TierDetail = styled.div`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.muted};
`;

const ActiveKey = styled.div`
  margin-top: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.gold};
  font-family: monospace;
  word-break: break-all;
`;

const InputRow = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
  align-items: flex-start;
`;

const KeyInput = styled.input`
  flex: 1;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  font-family: monospace;
  outline: none;

  &::placeholder {
    color: ${tokens.colors.muted};
    opacity: 0.6;
  }

  &:focus {
    border-color: ${tokens.colors.gold};
  }
`;

const Message = styled.div<{ $kind: 'error' | 'success' }>`
  font-size: ${tokens.fontSize.sm};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  border-radius: ${tokens.borderRadius.sm};
  background-color: ${(p) =>
    p.$kind === 'error' ? 'rgba(255, 48, 69, 0.12)' : 'rgba(83, 252, 24, 0.12)'};
  color: ${(p) => (p.$kind === 'error' ? tokens.colors.danger : tokens.colors.kick)};
  border: 1px solid
    ${(p) => (p.$kind === 'error' ? tokens.colors.danger : tokens.colors.kick)};
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
`;

const BuyCard = styled.div`
  padding: ${tokens.spacing.lg};
  border-radius: ${tokens.borderRadius.lg};
  border: 1px solid ${tokens.colors.gold};
  background: linear-gradient(135deg, rgba(214, 162, 58, 0.12), rgba(214, 162, 58, 0.03));
`;

const BuyTitle = styled.div`
  font-size: ${tokens.fontSize.md};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.gold};
  margin-bottom: ${tokens.spacing.xs};
`;

const PayHint = styled.div`
  margin-top: ${tokens.spacing.sm};
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  line-height: 1.5;

  code {
    color: ${tokens.colors.gold};
  }
`;

export function ProKeyPanel() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const info = await window.vaultstudio.license.getInfo();
      setLicense(info);
    } catch {
      /* ipc unavailable */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleActivate = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await window.vaultstudio.license.activate(trimmed);
      if (result.ok) {
        setMessage({ kind: 'success', text: 'Pro key activated successfully!' });
        setKeyInput('');
        await refresh();
      } else {
        setMessage({ kind: 'error', text: result.error || 'Activation failed' });
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Activation failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const info = await window.vaultstudio.license.deactivate();
      setLicense(info);
      setMessage({ kind: 'success', text: 'License deactivated. You are now on the Free tier.' });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Deactivation failed' });
    } finally {
      setLoading(false);
    }
  };

  const isPro = license?.valid === true && license.tier === 'pro';

  return (
    <Wrapper>
      <StatusCard $isPro={isPro}>
        <TierLabel $isPro={isPro}>{isPro ? 'Pro Tier' : 'Free Tier'}</TierLabel>
        <TierDetail>
          {isPro
            ? 'Lifetime Pro: unlimited stream targets and dashboard platforms.'
            : `Free includes ${license?.maxTargets ?? 3} stream targets and 3 dashboard platforms.`}
        </TierDetail>
        {isPro && license?.key && <ActiveKey>{license.key}</ActiveKey>}
      </StatusCard>

      {!isPro && (
        <>
          <BuyCard>
            <BuyTitle>Lifetime Pro - $19.99 USD</BuyTitle>
            <TierDetail>
              Lifetime Pro is a one-time purchase: unlimited stream targets, unlimited
              dashboard platforms, and no subscription. Your key is emailed after purchase.
            </TierDetail>
            <ButtonRow style={{ marginTop: tokens.spacing.sm }}>
              <Button variant="primary" onClick={() => window.vaultstudio.license.buyPro()}>
                Get Lifetime Pro - $19.99
              </Button>
            </ButtonRow>
            <PayHint>
              PayPal opens in your browser to complete the $19.99 USD payment. Your Lifetime Pro
              key is emailed to you once the payment clears.
            </PayHint>
          </BuyCard>
          <InputRow>
            <KeyInput
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your key: VS-PRO-XXXX-XXXX-XXXX-XXXX[.signature]"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleActivate();
              }}
            />
          </InputRow>
          <ButtonRow>
            <Button
              variant="primary"
              onClick={handleActivate}
              disabled={loading || !keyInput.trim()}
            >
              Activate
            </Button>
          </ButtonRow>
        </>
      )}

      {isPro && (
        <ButtonRow>
          <Button variant="danger" onClick={handleDeactivate} disabled={loading}>
            Deactivate
          </Button>
        </ButtonRow>
      )}

      {message && <Message $kind={message.kind}>{message.text}</Message>}
    </Wrapper>
  );
}
