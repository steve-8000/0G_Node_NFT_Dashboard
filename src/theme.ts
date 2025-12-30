import { createTheme } from '@mui/material/styles';

// Material Design 3.0 Dark Theme (eth_exit_hoodi 스타일)
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2962ff', // Material Design 3 Primary Blue
      light: '#a8c5ff',
      dark: '#0039cb',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#625b71',
      light: '#8f8a9f',
      dark: '#373045',
      contrastText: '#ffffff',
    },
    background: {
      default: '#141218', // Material Design 3 Surface
      paper: '#1e2330', // Material Design 3 Surface Variant
    },
    error: {
      main: '#F44336',
      light: '#EF5350',
      dark: '#C62828',
    },
    success: {
      main: '#4CAF50',
      light: '#66BB6A',
      dark: '#388E3C',
    },
    text: {
      primary: '#e6e0e9', // Material Design 3 On Surface
      secondary: '#c4c7d0', // Material Design 3 On Surface Variant
    },
  },
  shape: {
    borderRadius: 12, // Material Design 3 표준 border radius
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.35,
      letterSpacing: '-0.005em',
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.45,
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
      letterSpacing: '0.01em',
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.5,
      letterSpacing: '0.01em',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '10px',
          padding: '10px 20px',
          fontWeight: 500,
          fontSize: '0.875rem',
          letterSpacing: '0.01em',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          backgroundColor: '#2962ff',
          color: '#ffffff',
          boxShadow: '0px 2px 4px rgba(41, 98, 255, 0.2), 0px 4px 8px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            backgroundColor: '#3d72ff',
            boxShadow: '0px 4px 8px rgba(41, 98, 255, 0.3), 0px 8px 16px rgba(0, 0, 0, 0.15)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
            boxShadow: '0px 1px 2px rgba(41, 98, 255, 0.2), 0px 2px 4px rgba(0, 0, 0, 0.1)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: '1.5px',
          color: '#e6e0e9',
          '&:hover': {
            borderColor: '#2962ff',
            backgroundColor: 'rgba(41, 98, 255, 0.08)',
            borderWidth: '1.5px',
          },
        },
        text: {
          color: '#e6e0e9',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '16px',
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15), 0px 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(30, 35, 48, 0.6)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2), 0px 2px 6px rgba(0, 0, 0, 0.15)',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(30, 35, 48, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15), 0px 1px 3px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px',
            backgroundColor: '#1e2330',
            '& fieldset': {
              borderColor: '#2a3440',
            },
            '&:hover fieldset': {
              borderColor: '#5a6b7f',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2962ff',
            },
          },
          '& .MuiInputLabel-root': {
            color: '#c4c7d0',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          backgroundColor: '#1e2330',
          color: '#e6e0e9',
          border: '1px solid #2a3440',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(20, 18, 24, 0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.2), 0px 1px 3px rgba(0, 0, 0, 0.1)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(30, 35, 48, 0.95)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.4), 0px 4px 16px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          backgroundColor: '#121212',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#0A0A0A',
            color: '#FFFFFF',
            fontWeight: 500,
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#FFFFFF',
        },
      },
    },
  },
});

