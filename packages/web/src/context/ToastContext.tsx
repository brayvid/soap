// packages/web/src/context/ToastContext.tsx
"use client";

import { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// Define the shape and types for our toast messages
type ToastType = 'success' | 'error';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

// Define the context shape
interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

// Create the actual React Context
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Create a custom hook for easy access to the context
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Create the Provider component that will wrap the application
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // This is the function you asked for.
  // It uses state to set the current message and type, which triggers the render of the toast div.
  // It also sets a timeout to clear the message after a few seconds.
  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const newToast = { id: Date.now(), message, type };
    setToast(newToast);

    // Automatically clear the toast after 4 seconds
    setTimeout(() => {
      // We use a functional update to ensure we only clear the toast if it's the current one
      setToast((currentToast) => 
        currentToast?.id === newToast.id ? null : currentToast
      );
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* This is the JSX that renders the actual toast message when the 'toast' state is not null */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#28a745' : '#ff3860',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          zIndex: 2100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          fontSize: '1rem',
        }}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
};