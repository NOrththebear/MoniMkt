/**
 * MoniMkt design system - Universal Color Theme
 * Based on MoniMkt's official design guidelines and DeFi best practices
 */

export const monimktTheme = {
  // Primary Colors - Cool Blue (Subtle & Professional)
  primary: {
    50: '#f8fafc',   // Lightest blue-gray
    100: '#f1f5f9',  // Very light blue-gray
    200: '#e2e8f0',  // Light blue-gray
    300: '#cbd5e1',  // Medium light blue-gray
    400: '#94a3b8',  // Medium blue-gray
    500: '#64748b',  // Primary blue-gray (Subtle)
    600: '#475569',  // Dark blue-gray
    700: '#334155',  // Darker blue-gray
    800: '#1e293b',  // Very dark blue-gray
    900: '#0f172a',  // Darkest blue-gray
    950: '#020617',  // Ultra dark blue-gray
  },

  // Secondary Colors - Cool Gray (Muted & Professional)
  secondary: {
    50: '#fafafa',   // Lightest gray
    100: '#f4f4f5',  // Very light gray
    200: '#e4e4e7',  // Light gray
    300: '#d4d4d8',  // Medium light gray
    400: '#a1a1aa',  // Medium gray
    500: '#71717a',  // Primary gray (Muted)
    600: '#52525b',  // Dark gray
    700: '#3f3f46',  // Darker gray
    800: '#27272a',  // Very dark gray
    900: '#18181b',  // Darkest gray
    950: '#09090b',  // Ultra dark gray
  },

  // Accent Colors - Cool Purple (Muted & Sophisticated)
  accent: {
    50: '#fafafa',   // Lightest purple-gray
    100: '#f4f4f5',  // Very light purple-gray
    200: '#e4e4e7',  // Light purple-gray
    300: '#d4d4d8',  // Medium light purple-gray
    400: '#a1a1aa',  // Medium purple-gray
    500: '#71717a',  // Primary purple-gray (Muted)
    600: '#52525b',  // Dark purple-gray
    700: '#3f3f46',  // Darker purple-gray
    800: '#27272a',  // Very dark purple-gray
    900: '#18181b',  // Darkest purple-gray
    950: '#09090b',  // Ultra dark purple-gray
  },

  // Status Colors - Muted & Subtle
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    500: '#10b981',  // Muted teal-green (less bright)
    600: '#059669',
    700: '#047857',
    900: '#064e3b',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#d97706',  // Muted amber (less bright)
    600: '#b45309',
    700: '#92400e',
    900: '#78350f',
  },

  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#dc2626',  // Muted red (less bright)
    600: '#b91c1c',
    700: '#991b1b',
    900: '#7f1d1d',
  },

  // Neutral Colors - Dark Theme Optimized
  neutral: {
    50: '#f8fafc',   // Lightest gray
    100: '#f1f5f9',  // Very light gray
    200: '#e2e8f0',  // Light gray
    300: '#cbd5e1',  // Medium light gray
    400: '#94a3b8',  // Medium gray
    500: '#64748b',  // Base gray
    600: '#475569',  // Dark gray
    700: '#334155',  // Darker gray
    800: '#1e293b',  // Very dark gray
    900: '#0f172a',  // Darkest gray
    950: '#020617',  // Ultra dark gray
  },

  // Background Colors - Dark Theme
  background: {
    primary: '#0d0f14',     // Main background (current)
    secondary: '#1a1d26',   // Card backgrounds
    tertiary: '#252836',    // Elevated surfaces
    quaternary: '#2a2d36',  // Borders and dividers
  },

  // Text Colors
  text: {
    primary: '#ffffff',     // Primary text
    secondary: '#e2e8f0',   // Secondary text
    tertiary: '#94a3b8',    // Tertiary text
    muted: '#64748b',       // Muted text
    inverse: '#0f172a',     // Text on light backgrounds
  },

  // Border Colors
  border: {
    primary: '#2a2d36',     // Primary borders
    secondary: '#334155',   // Secondary borders
    accent: '#475569',      // Accent borders
    focus: '#64748b',       // Focus borders (muted)
  },

  // Shadow Colors - Subtle & Muted
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    colored: {
      green: '0 4px 14px 0 rgb(16 185 129 / 0.15)',  // Muted teal
      blue: '0 4px 14px 0 rgb(100 116 139 / 0.15)',  // Muted blue-gray
      purple: '0 4px 14px 0 rgb(113 113 122 / 0.15)', // Muted gray
      red: '0 4px 14px 0 rgb(220 38 38 / 0.15)',     // Muted red
      yellow: '0 4px 14px 0 rgb(217 119 6 / 0.15)',  // Muted amber
    }
  }
} as const

// Semantic Color Mappings
export const semanticColors = {
  // Action Colors
  supply: monimktTheme.primary[500],      // Green for supply actions
  borrow: monimktTheme.warning[500],      // Amber for borrow actions
  withdraw: monimktTheme.secondary[500],  // Blue for withdraw actions
  repay: monimktTheme.error[500],         // Red for repay actions
  
  // Status Colors
  safe: monimktTheme.success[500],        // Green for safe status
  warning: monimktTheme.warning[500],     // Amber for warning status
  danger: monimktTheme.error[500],        // Red for danger status
  
  // Interactive Colors
  hover: monimktTheme.neutral[700],       // Hover states
  active: monimktTheme.neutral[600],      // Active states
  disabled: monimktTheme.neutral[800],    // Disabled states
  
  // Gradient Colors
  gradients: {
    primary: `linear-gradient(135deg, ${monimktTheme.primary[600]} 0%, ${monimktTheme.primary[500]} 100%)`,
    secondary: `linear-gradient(135deg, ${monimktTheme.secondary[600]} 0%, ${monimktTheme.secondary[500]} 100%)`,
    accent: `linear-gradient(135deg, ${monimktTheme.accent[600]} 0%, ${monimktTheme.accent[500]} 100%)`,
    success: `linear-gradient(135deg, ${monimktTheme.success[600]} 0%, ${monimktTheme.success[500]} 100%)`,
    warning: `linear-gradient(135deg, ${monimktTheme.warning[600]} 0%, ${monimktTheme.warning[500]} 100%)`,
    error: `linear-gradient(135deg, ${monimktTheme.error[600]} 0%, ${monimktTheme.error[500]} 100%)`,
  }
} as const

// Utility Functions
export const getColorWithOpacity = (color: string, opacity: number) => {
  // Convert hex to rgba
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export const getStatusColor = (status: 'safe' | 'warning' | 'danger') => {
  switch (status) {
    case 'safe': return monimktTheme.success[500]
    case 'warning': return monimktTheme.warning[500]
    case 'danger': return monimktTheme.error[500]
    default: return monimktTheme.neutral[500]
  }
}

export const getActionColor = (action: 'supply' | 'borrow' | 'withdraw' | 'repay') => {
  switch (action) {
    case 'supply': return monimktTheme.primary[500]
    case 'borrow': return monimktTheme.warning[500]
    case 'withdraw': return monimktTheme.secondary[500]
    case 'repay': return monimktTheme.error[500]
    default: return monimktTheme.neutral[500]
  }
}

// CSS Custom Properties for Tailwind
export const cssVariables = {
  '--color-primary': monimktTheme.primary[500],
  '--color-primary-dark': monimktTheme.primary[600],
  '--color-secondary': monimktTheme.secondary[500],
  '--color-secondary-dark': monimktTheme.secondary[600],
  '--color-accent': monimktTheme.accent[500],
  '--color-accent-dark': monimktTheme.accent[600],
  '--color-success': monimktTheme.success[500],
  '--color-warning': monimktTheme.warning[500],
  '--color-error': monimktTheme.error[500],
  '--color-background': monimktTheme.background.primary,
  '--color-background-secondary': monimktTheme.background.secondary,
  '--color-background-tertiary': monimktTheme.background.tertiary,
  '--color-text-primary': monimktTheme.text.primary,
  '--color-text-secondary': monimktTheme.text.secondary,
  '--color-text-tertiary': monimktTheme.text.tertiary,
  '--color-border': monimktTheme.border.primary,
  '--color-border-secondary': monimktTheme.border.secondary,
} as const

export default monimktTheme
