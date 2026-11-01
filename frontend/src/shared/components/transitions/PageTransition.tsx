import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard transition wrapper providing buttery smooth fade & slide-in entry
 * for route navigation across the platform.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({ children, className = '' }) => {
  return (
    <div className={`page-transition w-full ${className}`}>
      {children}
    </div>
  );
};
