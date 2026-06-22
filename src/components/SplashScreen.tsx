import styled, { keyframes } from 'styled-components';
import { tokens } from '../theme/tokens';
import logoUrl from '../assets/logo.png';

type Props = {
  version: string;
  status: string;
};

const ledAnimation = keyframes`
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
`;

const statusPulse = keyframes`
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
`;

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const LogoContainer = styled.div`
  position: relative;
  width: 200px;
  height: 200px;
  flex: 0 0 auto;
`;

const Logo = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

/**
 * Each LED sits exactly over one of the blue dashes on the logo's vault door.
 * Centers, sizes and rotations are measured from the 500x500 artwork
 * (clusters of blue pixels), expressed as percentages so they track any
 * render size. The red LED matches the dash dimensions 1:1 so the blink
 * reads as the same light changing color while the engine boots.
 */
const Led = styled.div<{ $x: number; $y: number; $angle: number; $delay: number }>`
  position: absolute;
  width: 4.2%;
  height: 2%;
  left: ${(p) => p.$x - 2.1}%;
  top: ${(p) => p.$y - 1}%;
  transform: rotate(${(p) => p.$angle}deg);
  background-color: #e63946;
  border-radius: 2px;
  box-shadow: 0 0 6px 1px rgba(230, 57, 70, 0.8);
  animation: ${ledAnimation} 1.5s ease-in-out infinite;
  animation-delay: ${(p) => p.$delay}ms;
  pointer-events: none;
`;

const VersionText = styled.div`
  margin-top: ${tokens.spacing.xl};
  color: ${tokens.colors.gold};
  font-size: ${tokens.fontSize.md};
  font-weight: ${tokens.fontWeight.medium};
`;

const StatusText = styled.div`
  margin-top: ${tokens.spacing.sm};
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  animation: ${statusPulse} 2s ease-in-out infinite;
`;

// Measured centers/rotations of the logo's blue dashes (percent of artwork).
const LEDS = [
  { x: 79.8, y: 26.6, angle: -40 },
  { x: 83.0, y: 33.0, angle: -27 },
  { x: 85.2, y: 40.2, angle: -14 },
  { x: 85.8, y: 47.6, angle: -2 },
  { x: 84.8, y: 55.0, angle: 11 },
];

export function SplashScreen({ version, status }: Props) {
  return (
    <Container>
      <LogoContainer>
        <Logo src={logoUrl} alt="VaultStudio" />
        {LEDS.map((led, i) => (
          <Led
            key={i}
            $x={led.x}
            $y={led.y}
            $angle={led.angle}
            $delay={i * 150}
            role="img"
            aria-label={`led ${i * 150}`}
          />
        ))}
      </LogoContainer>
      <VersionText>VaultStudio v{version}</VersionText>
      <StatusText>{status}</StatusText>
    </Container>
  );
}
