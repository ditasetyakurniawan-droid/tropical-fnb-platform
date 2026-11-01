import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

/**
 * Modern dual-screen POS cash register with scanner & thermal roll.
 */
export const POSTerminalIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Screen Monitor */}
    <rect x="3" y="3" width="18" height="12" rx="2" className="fill-emerald-500/10 dark:fill-emerald-400/10" />
    <path d="M7 8h5" />
    <path d="M7 11h3" />
    {/* Receipt feed */}
    <path d="M15 6h3v4h-3z" fill="currentColor" fillOpacity="0.2" />
    {/* Stand and Base */}
    <path d="M12 15v3" />
    <path d="M6 21h12a1 1 0 0 0 1-1v-2H5v2a1 1 0 0 0 1 1z" />
    {/* Scanner dot */}
    <circle cx="17" cy="19" r="1" fill="currentColor" />
  </svg>
);

/**
 * Floor plan / layout grid for indoor dining & outdoor garden gazebos.
 */
export const FloorPlanIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" strokeDasharray="2 2" />
    <path d="M9 21V9" />
    <rect x="5" y="12" width="2" height="3" rx="0.5" fill="currentColor" fillOpacity="0.3" />
    <rect x="13" y="13" width="6" height="5" rx="1" className="fill-amber-500/20 dark:fill-amber-400/20" />
    <circle cx="16" cy="6" r="1.5" fill="currentColor" />
  </svg>
);

/**
 * Traditional tropical gazebo pavilion (representing Tropical Garden Resto Manding).
 */
export const GazeboIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Thatched Pitched Roof */}
    <path d="M12 2L2 9h20L12 2z" className="fill-emerald-500/20 dark:fill-emerald-400/20" />
    <path d="M12 2v7" />
    {/* Pillars */}
    <path d="M5 9v10" />
    <path d="M9 9v10" />
    <path d="M15 9v10" />
    <path d="M19 9v10" />
    {/* Deck Platform */}
    <path d="M2 19h20" strokeWidth="2.2" />
    <path d="M4 22h16" />
    {/* Fence Railing */}
    <path d="M5 15h4" />
    <path d="M15 15h4" />
  </svg>
);

/**
 * Premium steak house cut (representing Australian Tenderloin & Ribeye).
 */
export const SteakHouseIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Steak Cut Contour */}
    <path
      d="M19.5 7.5c-1.5-2.5-5-4-9-3C5.5 5.5 3 9 3.5 13.5c.5 4.5 4 7.5 9 7 4-.5 7.5-3 8-6.5.5-2.5 0-5-1-6.5z"
      className="fill-rose-500/20 dark:fill-rose-400/20"
    />
    {/* Bone or Marbling Core */}
    <circle cx="9" cy="11" r="2.5" fill="currentColor" fillOpacity="0.2" strokeWidth="1.5" />
    {/* Sear Grill Marks */}
    <path d="M13 7l-2 3" />
    <path d="M16 10l-2 3" />
    <path d="M15 15l-1.5 2" />
  </svg>
);

/**
 * Split bill icon showing receipt partitioned into multiple accounts.
 */
export const SplitBillIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Bill */}
    <path d="M4 3v18l3-1.5 3 1.5V3L7 4.5 4 3z" className="fill-emerald-500/10 dark:fill-emerald-400/10" />
    <path d="M6 8h2" />
    <path d="M6 12h2" />
    {/* Right Bill */}
    <path d="M14 3v18l3-1.5 3 1.5V3l-3 1.5L14 3z" className="fill-amber-500/10 dark:fill-amber-400/10" />
    <path d="M16 8h2" />
    <path d="M16 12h2" />
    {/* Split separator scissors / arrow */}
    <path d="M10 10l4 4" strokeDasharray="1.5 1.5" />
    <path d="M14 10l-4 4" strokeDasharray="1.5 1.5" />
  </svg>
);

/**
 * Large Event, Gathering & VIP reservation calendar.
 */
export const EventReservationIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Calendar Card */}
    <rect x="3" y="4" width="18" height="17" rx="2" className="fill-purple-500/10 dark:fill-purple-400/10" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 9h18" />
    {/* Event star / seal */}
    <circle cx="12" cy="15" r="3" fill="currentColor" fillOpacity="0.2" />
    <path d="M12 13.5v3" strokeWidth="1.5" />
    <path d="M10.5 15h3" strokeWidth="1.5" />
  </svg>
);

/**
 * Kitchen Cook & Chef KDS icon.
 */
export const ChefKitchenIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Chef Toque */}
    <path
      d="M6 18h12v3H6v-3zM7 18V11a3 3 0 0 1 3-3 3 3 0 0 1 4 0 3 3 0 0 1 3 3v7"
      className="fill-amber-500/20 dark:fill-amber-400/20"
    />
    <path d="M6 12a3 3 0 0 1-3-3 3 3 0 0 1 5-2.2" />
    <path d="M16 6.8A3 3 0 0 1 21 9a3 3 0 0 1-3 3" />
    <path d="M9 5a3 3 0 0 1 6 0" />
  </svg>
);

/**
 * QRIS payment barcode badge.
 */
export const QRISBadgeIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Corner Targets */}
    <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="15" y="3" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    <rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.2" />
    <path d="M5 5h2v2H5z" fill="currentColor" />
    <path d="M17 5h2v2h-2z" fill="currentColor" />
    <path d="M5 17h2v2H5z" fill="currentColor" />
    {/* Data pixels */}
    <path d="M15 15h2v2h-2z" fill="currentColor" />
    <path d="M19 19h2v2h-2z" fill="currentColor" />
    <path d="M12 9v6" />
    <path d="M9 12h6" />
  </svg>
);

/**
 * Cash drawer with Rupiah note.
 */
export const CashDrawerIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="2" y="6" width="20" height="12" rx="2" className="fill-emerald-500/10 dark:fill-emerald-400/10" />
    <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
    <path d="M6 9h.01" strokeWidth="2.5" />
    <path d="M18 15h.01" strokeWidth="2.5" />
    <path d="M2 18v2a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2" />
    <circle cx="12" cy="19.5" r="0.75" fill="currentColor" />
  </svg>
);

/**
 * Dining table with 4 surrounding chairs.
 */
export const DiningTableIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Table Surface */}
    <rect x="6" y="7" width="12" height="10" rx="2" className="fill-emerald-500/20 dark:fill-emerald-400/20" />
    {/* Chairs: Top, Bottom, Left, Right */}
    <path d="M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M9 18h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
    <path d="M2 10v4a1 1 0 0 0 1 1h1V9H3a1 1 0 0 0-1 1z" />
    <path d="M22 10v4a1 1 0 0 1-1 1h-1V9h1a1 1 0 0 1 1 1z" />
  </svg>
);

/**
 * Concierge check-in badge for arrival.
 */
export const CheckInBadgeIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Service Bell Dome */}
    <path d="M3 17h18" strokeWidth="2.2" />
    <path d="M4 17c0-4.4 3.6-8 8-8s8 3.6 8 8" className="fill-emerald-500/20 dark:fill-emerald-400/20" />
    <path d="M12 9V6" />
    <path d="M10 6h4" />
    {/* Checkmark */}
    <path d="M9 13l2 2 4-4" strokeWidth="2.2" />
  </svg>
);
