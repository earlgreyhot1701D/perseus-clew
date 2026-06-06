/**
 * Button: shared reusable button component.
 *
 * Variants: primary (sienna), ghost (transparent with border).
 * Used by scan input, results actions, and future components.
 *
 * Visual reference: mockups/agentislux-app.html button treatments
 */

import styles from './Button.module.css';

interface ButtonProps {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  onClick,
  children,
  className = ''
}: ButtonProps) {
  const variantClass = variant === 'ghost' ? styles.ghost : styles.primary;
  const sizeClass = size === 'sm' ? styles.sm : styles.md;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${styles.btn} ${variantClass} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
}
