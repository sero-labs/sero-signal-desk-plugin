import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  children,
  className = '',
  size = 'default',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: 'default' | 'sm';
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <button className={`sd-button ${size} ${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
