import React from 'react';

interface LedButtonProps {
  label: string;
  active: boolean;
  color?: 'amber' | 'red' | 'green';
  onClick: () => void;
}

export const LedButton: React.FC<LedButtonProps> = ({
  label,
  active,
  color = 'amber',
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`led-btn ${active ? 'on' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`led-dot ${color} ${active ? 'on' : ''}`} />
      <span>{label}</span>
    </button>
  );
};
