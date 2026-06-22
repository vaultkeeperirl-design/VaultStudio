import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const PanelWrapper = styled.div`
  background-color: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.lg};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  min-height: 0;
`;

const PanelHeader = styled.div`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${tokens.colors.panel2};
  border-bottom: 1px solid ${tokens.colors.border};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  color: ${tokens.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
`;

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${tokens.spacing.sm};
`;

type Props = {
  title: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function Panel({ title, children, className, style }: Props) {
  return (
    <PanelWrapper className={className} style={style}>
      <PanelHeader className="panel-header">{title}</PanelHeader>
      <PanelBody>{children}</PanelBody>
    </PanelWrapper>
  );
}
